{ config, lib, ... }:
let
  cfg = config.services.palabre;
in
{
  # State shared by LiveKit and PlugNMeet. Dedicated instance: one shared
  # with an eviction policy (allkeys-lru) would lose room data. Listens on
  # localhost only (the containers use `--network=host`).
  config = lib.mkIf cfg.enable {
    services.redis.servers.palabre = {
      enable = true;
      bind = "127.0.0.1";
      port = cfg.ports.redis;
      # Ephemeral room data, nothing to persist across restarts.
      save = [ ];
    };
  };
}
