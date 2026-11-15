# Minimal configuration with no real value: it only exists to lock palabre.nix's
# images from this repository (`pin-oci lock --flake .#lock`) and to check that
# the module evaluates. Here the project has no `followLockFile`: its images are
# those of the repository's `lockFile`, which `pin-oci lock` writes. On a host,
# that file is what gets read (`followLockFile`).
{ lib, ... }:
{
  system.stateVersion = "26.05";
  boot.loader.grub.devices = [ "nodev" ];
  fileSystems."/" = {
    device = "none";
    fsType = "tmpfs";
  };
  virtualisation.oci-containers.backend = "podman";

  users.groups.oci-palabre = { };
  users.users.oci-palabre = {
    isSystemUser = true;
    group = "oci-palabre";
    linger = true;
  };

  virtualisation.pin-oci = {
    enable = true;
    lockFile = ../../pin-oci.lock;
    projects.palabre.followLockFile = lib.mkForce null;
  };

  services.palabre = {
    enable = true;
    host = "visio.example.org";
    user = "oci-palabre";
    stateDir = "/srv/palabre";
    # Placeholder files: never read here (the module only reads them when the service starts).
    secrets = lib.genAttrs [
      "livekitApiKeyFile"
      "livekitApiSecretFile"
      "plugnmeetApiKeyFile"
      "plugnmeetApiSecretFile"
      "adminTokenFile"
      "natsUserSeedFile"
      "natsCalloutIssuerSeedFile"
      "natsCalloutXkeySeedFile"
    ] (name: "/run/secrets/palabre-${name}");
    database = {
      nameFile = "/run/secrets/palabre-db-name";
      userFile = "/run/secrets/palabre-db-user";
      passwordFile = "/run/secrets/palabre-db-password";
    };
    nats = {
      userNkey = "UEXAMPLE";
      calloutIssuer = "AEXAMPLE";
      calloutXkey = "XEXAMPLE";
    };
  };
}
