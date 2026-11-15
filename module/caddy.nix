{ config, lib, ... }:
let
  cfg = config.services.palabre;
in
{
  # PlugNMeet est servi sur un seul domaine mais parle à 3 autres backends
  # (LiveKit, NATS en WebSocket, page d'accueil) : routage par chemin, comme
  # le haproxy de l'installeur officiel mynaparrot/plugNmeet-install.
  config.services.palabre.caddyHandles = ''
    # `handle_path`/`handle` n'acceptent qu'un seul motif de chemin en
    # argument inline : il faut un matcher nommé pour couvrir le chemin nu ET
    # ses sous-chemins.
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

    # Page d'accueil : création/jonction de salon, panneau /admin et leurs
    # ressources (/visio-assets, /visio-api : /assets et /api sont pris par
    # le client PlugNMeet).
    @landing path /join /join/* /r/* /admin /admin/* /visio-assets/* /visio-api/*
    handle @landing {
        reverse_proxy http://127.0.0.1:${toString cfg.ports.landing}
    }

    # La racine sans `access_token` est aussi la page d'accueil.
    @landingRoot {
        path /
        not query access_token=*
    }
    handle @landingRoot {
        reverse_proxy http://127.0.0.1:${toString cfg.ports.landing}
    }
  '';
}
