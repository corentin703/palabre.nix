{ config, lib, ... }:
let
  cfg = config.services.palabre;
in
{
  # PlugNMeet is served on a single domain but talks to 3 other backends
  # (LiveKit, NATS over WebSocket, the landing page): path-based routing,
  # like the official installer's haproxy (mynaparrot/plugNmeet-install).
  config.services.palabre.caddyHandles = ''
    # `handle_path`/`handle` only accept one path pattern as an inline
    # argument: a named matcher is needed to cover the bare path AND its
    # subpaths.
    @livekit path /livekit /livekit/*
    handle @livekit {
        uri strip_prefix /livekit
        reverse_proxy http://127.0.0.1:${toString cfg.ports.livekit}
    }

    @natsWs path /ws /ws/*
    handle @natsWs {
        uri strip_prefix /ws
        reverse_proxy http://127.0.0.1:${toString cfg.ports.natsWebsocket}
    }

    # Landing page: room creation/joining, the /admin panel and their
    # resources (/visio-assets, /visio-api: /assets and /api belong to the
    # PlugNMeet client).
    @landing path /join /join/* /r/* /admin /admin/* /visio-assets/* /visio-api/*
    handle @landing {
        reverse_proxy http://127.0.0.1:${toString cfg.ports.landing}
    }

    # The root without `access_token` is the landing page too.
    @landingRoot {
        path /
        not query access_token=*
    }
    handle @landingRoot {
        reverse_proxy http://127.0.0.1:${toString cfg.ports.landing}
    }
  '';
}
