{ config, lib, ... }:
let
  cfg = config.services.palabre;
in
{
  # État partagé de LiveKit et de PlugNMeet. Instance dédiée : une instance
  # partagée avec politique d'éviction (allkeys-lru) ferait perdre des
  # données de salles. Écoute en local uniquement (les conteneurs sont en
  # `--network=host`).
  config = lib.mkIf cfg.enable {
    services.redis.servers.palabre = {
      enable = true;
      bind = "127.0.0.1";
      port = cfg.ports.redis;
      # Données de salles éphémères, rien à persister entre redémarrages.
      save = [ ];
    };
  };
}
