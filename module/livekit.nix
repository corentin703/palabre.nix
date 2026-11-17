{ config, lib, ... }:
let
  cfg = config.services.palabre;
  ociUser = cfg.user;

  rtcPortRangeStart = cfg.rtc.portRangeStart;
  rtcPortRangeEnd = cfg.rtc.portRangeEnd;
  rtcTcpPort = cfg.rtc.tcpPort;
  rtcUdpPort = cfg.rtc.udpPort;

  lk = cfg.livekit;
  turn = lk.turn;
  turnTls = turn.enable && turn.certFile != null && turn.keyFile != null;
in
{
  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = (turn.certFile == null) == (turn.keyFile == null);
        message = "services.palabre.livekit.turn.certFile and keyFile go together.";
      }
    ];

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
        logging:
          level: ${lk.logLevel}
        rtc:
      ''
      + (
        if rtcUdpPort != null then
          "  udp_port: ${toString rtcUdpPort}\n"
        else
          "  port_range_start: ${toString rtcPortRangeStart}\n  port_range_end: ${toString rtcPortRangeEnd}\n"
      )
      + ''
          tcp_port: ${toString rtcTcpPort}
          use_external_ip: true
        webhook:
          api_key: @LIVEKIT_API_KEY@
          urls:
            - https://${cfg.host}/webhook
      ''
      + lib.optionalString turn.enable (
        "turn:\n  enabled: true\n"
        + "  domain: ${if turn.domain != null then turn.domain else cfg.host}\n"
        + "  udp_port: ${toString turn.udpPort}\n"
        + lib.optionalString turnTls (
          "  tls_port: ${toString turn.tlsPort}\n"
          + "  cert_file: /etc/livekit-turn/cert.pem\n"
          + "  key_file: /etc/livekit-turn/key.pem\n"
        )
      );
    };

    # Project "palabre" (livekit + plugnmeet): target podman-palabre.target.
    virtualisation.pin-oci.projects.palabre.enable = true;

    virtualisation.pin-oci.projects.palabre.services.livekit-server = {
      image = "docker.io/livekit/livekit-server:${cfg.versions.livekit}";
      podman.user = ociUser;
      volumes = [
        "${cfg.rendered.livekit.path}:/etc/livekit.yaml:ro"
      ]
      ++ lib.optionals turnTls [
        "${toString turn.certFile}:/etc/livekit-turn/cert.pem:ro"
        "${toString turn.keyFile}:/etc/livekit-turn/key.pem:ro"
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
      serviceConfig = lib.mkIf (lk.cpuWeight != null) { CPUWeight = lk.cpuWeight; };
    };

    networking.firewall = {
      allowedUDPPortRanges = lib.optional (rtcUdpPort == null) {
        from = rtcPortRangeStart;
        to = rtcPortRangeEnd;
      };
      allowedUDPPorts =
        lib.optional (rtcUdpPort != null) rtcUdpPort ++ lib.optional turn.enable turn.udpPort;
      allowedTCPPorts = [ rtcTcpPort ] ++ lib.optional turnTls turn.tlsPort;
      # The main HTTP/WS port (cfg.port) is deliberately NOT opened here:
      # with `--network=host` it is bound directly on the host, but must only
      # be reachable locally (127.0.0.1) from Caddy, never directly from the
      # Internet (see `caddyHandles`). The deny-by-default firewall on eth0
      # takes care of it: cfg.port is added to no `allowed*Ports` list.
    };
  };
}
