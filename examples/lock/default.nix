# Configuration minimale, sans valeur réelle : elle ne sert qu'à verrouiller les images de
# Palabre depuis ce dépôt (`pin-oci lock --flake .#lock`) et à vérifier que le module s'évalue.
# Ici le projet n'a pas de `followLockFile` : ses images sont celles du `lockFile` du dépôt,
# que `pin-oci lock` écrit. Chez un hôte, c'est ce fichier qui est lu (`followLockFile`).
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
    # Fichiers fictifs : jamais lus ici (le module ne les lit qu'au démarrage du service).
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
