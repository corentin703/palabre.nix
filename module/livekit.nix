{ config, lib, ... }:
let
  cfg = config.services.palabre;
  ociUser = cfg.user;

  rtcPortRangeStart = cfg.rtc.portRangeStart;
  rtcPortRangeEnd = cfg.rtc.portRangeEnd;
  rtcTcpPort = cfg.rtc.tcpPort;
in
{
  config = lib.mkIf cfg.enable {
    services.palabre.rendered.livekit = {
      unit = "podman-palabre-livekit-server";
      secrets = {
        LIVEKIT_API_KEY = cfg.secrets.livekitApiKeyFile;
        LIVEKIT_API_SECRET = cfg.secrets.livekitApiSecretFile;
      };
      content = ''
        port: ${toString cfg.ports.livekit}
        keys:
          @LIVEKIT_API_KEY@: @LIVEKIT_API_SECRET@
        redis:
          address: 127.0.0.1:${toString cfg.ports.redis}
        rtc:
          port_range_start: ${toString rtcPortRangeStart}
          port_range_end: ${toString rtcPortRangeEnd}
          tcp_port: ${toString rtcTcpPort}
          use_external_ip: true
        webhook:
          api_key: @LIVEKIT_API_KEY@
          urls:
            - https://${cfg.host}/webhook
      '';
    };

    # Projet "palabre" (livekit + plugnmeet) : cible podman-palabre.target.
    virtualisation.pin-oci.projects.palabre.enable = true;

    virtualisation.pin-oci.projects.palabre.services.livekit-server = {
      image = "docker.io/livekit/livekit-server:${cfg.versions.livekit}";
      podman.user = ociUser;
      volumes = [
        "${cfg.rendered.livekit.path}:/etc/livekit.yaml:ro"
      ];
      cmd = [
        "--config"
        "/etc/livekit.yaml"
      ];
      extraOptions = [
        # Host networking : la plage RTC (10000+ ports UDP) ne peut pas
        # raisonnablement être publiée port par port via `-p`. C'est aussi le
        # déploiement recommandé par LiveKit pour un nœud unique.
        "--network=host"
      ];
      autoStart = true;
    };

    # Redis natif (voir redis.nix), pas un conteneur.
    systemd.services.podman-palabre-livekit-server = {
      after = [ "redis-palabre.service" ];
      requires = [ "redis-palabre.service" ];
    };

    networking.firewall = {
      allowedUDPPortRanges = [
        {
          from = rtcPortRangeStart;
          to = rtcPortRangeEnd;
        }
      ];
      allowedTCPPorts = [
        rtcTcpPort
      ];
      # Le port HTTP/WS principal (cfg.port) n'est volontairement PAS ouvert ici :
      # avec `--network=host`, il est bindé directement sur l'hôte, mais ne doit
      # être joignable qu'en local (127.0.0.1) depuis Caddy, jamais directement
      # depuis Internet (voir `caddyHandles`). Le
      # pare-feu deny-by-default sur eth0 s'en charge : on n'ajoute cfg.port à
      # aucune liste `allowed*Ports`.
    };
  };
}
