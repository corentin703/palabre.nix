# Fichiers de configuration qui contiennent des secrets.
#
# Le module ne connaît aucun gestionnaire de secrets : il reçoit des CHEMINS de fichiers
# (`services.palabre.secrets.*`), que sops-nix, agenix, systemd-creds ou autre ont déposés, lisibles
# par root. Mais LiveKit, PlugNMeet et la page d'accueil lisent leurs secrets dans leur propre
# fichier de configuration, mêlés aux autres réglages : il faut donc produire ce fichier.
#
# Chaque configuration est un modèle du store avec des `@NOM@` à la place des secrets. Juste
# avant le démarrage du conteneur (`ExecStartPre`, en root), le modèle est rempli dans le dossier
# d'exécution du conteneur (propriétaire : l'utilisateur des conteneurs, mode 0400), puis monté. Aucun
# secret n'entre dans le store. Après un changement de secret, il suffit de redémarrer le conteneur.
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.palabre;
  inherit (lib) mkOption types;

  # Dossier d'exécution d'une unité de conteneur : `oci-containers` le crée déjà, du nom du
  # conteneur (`podman-<conteneur>`), pour l'utilisateur de l'unité.
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

  # Le script d'une unité : remplit le modèle (`$1`) vers la destination (`$2`), avec les
  # secrets `NOM=fichier` qui suivent.
  render = pkgs.writeShellScript "palabre-render" ''
    set -euo pipefail
    template=$1 target=$2
    shift 2
    content=$(<"$template")
    for pair in "$@"; do
      name=''${pair%%=*}
      file=''${pair#*=}
      if [ ! -r "$file" ]; then
        echo "palabre: le fichier de secret $file est absent ou illisible" >&2
        exit 1
      fi
      # $(<…) retire les retours à la ligne de fin ; les guillemets rendent le motif et le
      # remplacement littéraux, quel que soit le contenu du secret.
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
          # `+` : en root, pour lire les secrets que l'utilisateur des conteneurs ne lit pas.
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
