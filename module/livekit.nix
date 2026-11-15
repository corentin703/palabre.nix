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

    # Project "palabre" (livekit + plugnmeet): target podman-palabre.target.
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
        # Host networking: the RTC range (10000+ UDP ports) cannot reasonably
        # be published port by port with `-p`. It is also what LiveKit
        # recommends for a single node.
        "--network=host"
      ];
      autoStart = true;
    };

    # Native Redis (see redis.nix), not a container.
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
      # The main HTTP/WS port (cfg.port) is deliberately NOT opened here:
      # with `--network=host` it is bound directly on the host, but must only
      # be reachable locally (127.0.0.1) from Caddy, never directly from the
      # Internet (see `caddyHandles`). The deny-by-default firewall on eth0
      # takes care of it: cfg.port is added to no `allowed*Ports` list.
    };
  };
}
