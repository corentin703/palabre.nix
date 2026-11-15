# Configuration files that contain secrets.
#
# The module knows no secrets manager: it receives file PATHS
# (`services.palabre.secrets.*`), put there by sops-nix, agenix, systemd-creds or
# anything else, readable by root. But LiveKit, PlugNMeet and the landing page read
# their secrets from their own configuration file, mixed with their other settings:
# that file has to be produced.
#
# Each configuration is a store template with `@NAME@` in place of the secrets.
# Right before the container starts (`ExecStartPre`, as root), the template is
# filled in the container's runtime directory (owner: the containers' user, mode
# 0400), then mounted. No secret enters the store. After changing a secret,
# restarting the container is enough.
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.palabre;
  inherit (lib) mkOption types;

  # Runtime directory of a container unit: `oci-containers` already creates it, named
  # after the container (`podman-<container>`), for the unit's user.
  runtimeDirectory = unit: lib.removePrefix "podman-" unit;

  renderedFile =
    { config, ... }:
    {
      options = {
        unit = mkOption {
          type = types.str;
          description = "systemd unit of the container mounting this file (without `.service`).";
        };
        content = mkOption {
          type = types.lines;
          description = "Content of the file, with `@NAME@` in place of each secret.";
        };
        secrets = mkOption {
          type = types.attrsOf types.str;
          default = { };
          description = "NAME -> path of the file containing the secret.";
        };
        path = mkOption {
          type = types.str;
          readOnly = true;
          default = "/run/${runtimeDirectory config.unit}/config";
          description = "Where the filled file is written, and mounted in the container.";
        };
      };
    };

  # A unit's script: fills the template (`$1`) into the destination (`$2`), with the
  # `NAME=file` secrets that follow.
  render = pkgs.writeShellScript "palabre-render" ''
    set -euo pipefail
    template=$1 target=$2
    shift 2
    content=$(<"$template")
    for pair in "$@"; do
      name=''${pair%%=*}
      file=''${pair#*=}
      if [ ! -r "$file" ]; then
        echo "palabre: secret file $file is missing or unreadable" >&2
        exit 1
      fi
      # $(<…) strips trailing newlines; the quotes make the pattern and the
      # replacement literal, whatever the content of the secret.
      secret=$(<"$file")
      content=''${content//"@$name@"/"$secret"}
    done
    umask 0277
    printf '%s\n' "$content" > "$target"
    chown ${lib.escapeShellArg cfg.user} "$target"
  '';
in
{
  options.services.palabre.rendered = mkOption {
    type = types.attrsOf (types.submodule renderedFile);
    default = { };
    internal = true;
    visible = false;
    description = "Configuration files filled with their secrets before the containers start.";
  };

  config = lib.mkIf cfg.enable {
    systemd.services = lib.mapAttrs' (
      name: file:
      lib.nameValuePair file.unit {
        serviceConfig = {
          RuntimeDirectory = lib.mkDefault (runtimeDirectory file.unit);
          # `+`: as root, to read the secrets the containers' user cannot read.
          ExecStartPre = [
            "+${render} ${pkgs.writeText "palabre-${name}" file.content} ${lib.escapeShellArg file.path} ${
              lib.escapeShellArgs (lib.mapAttrsToList (secret: path: "${secret}=${path}") file.secrets)
            }"
          ];
        };
      }
    ) cfg.rendered;
  };
}
