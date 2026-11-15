# Palabre : visioconférence autohébergée.
#
# PlugNMeet (interface + API) au-dessus de LiveKit (média audio/vidéo) et NATS
# (temps réel), avec une page d'accueil publique (création/jonction de salon
# anonyme, panneau /admin) personnalisable. Voir README.md.
{ config, lib, ... }:
let
  inherit (lib) mkEnableOption mkOption types;
in
{
  imports = [
    ./livekit.nix
    ./nats.nix
    ./redis.nix
    ./plugnmeet.nix
    ./landing.nix
    ./caddy.nix
  ];

  # Les images (LiveKit, PlugNMeet) sont verrouillées par le `pin-oci.lock` de ce flake, lu
  # tel quel par l'hôte ; l'hôte peut le surcharger (`followLockFile = null` pour les
  # verrouiller avec les siennes). Voir README.md.
  config = lib.mkIf config.services.palabre.enable {
    virtualisation.pin-oci.projects.palabre.followLockFile = lib.mkDefault ../pin-oci.lock;
  };

  options.services.palabre = {
    enable = mkEnableOption "Palabre (PlugNMeet + LiveKit + NATS + page d'accueil)";

    host = mkOption {
      type = types.str;
      example = "visio.example.org";
      description = ''
        Nom de domaine public unique. PlugNMeet, LiveKit (`/livekit`), NATS
        (`/ws`) et la page d'accueil y sont tous servis ; le reverse proxy
        doit router par chemin (voir `caddyHandles`).
      '';
    };

    user = mkOption {
      type = types.str;
      example = "oci-visio";
      description = ''
        Utilisateur système qui exécute les conteneurs en Podman rootless
        (`podman.user` de pin-oci). Il doit exister, avec `linger`, des
        plages subuid/subgid et un home pour la configuration de Podman : le
        module ne le crée pas.
      '';
    };

    stateDir = mkOption {
      type = types.str;
      example = "/srv/oci/visio/data/plugnmeet";
      description = ''
        Répertoire persistant monté dans le serveur PlugNMeet (client web
        téléchargé, fichiers déposés, journaux). Créé (propriétaire
        `user`) ; son parent doit exister.
      '';
    };

    ports = {
      plugnmeet = mkOption {
        type = types.port;
        default = 10003;
        description = "Port local du serveur PlugNMeet.";
      };
      livekit = mkOption {
        type = types.port;
        default = 10005;
        description = "Port local (HTTP/WebSocket) de LiveKit. Jamais ouvert dans le pare-feu.";
      };
      landing = mkOption {
        type = types.port;
        default = 10006;
        description = "Port local de la page d'accueil.";
      };
      nats = mkOption {
        type = types.port;
        default = 4222;
        description = "Port NATS (client).";
      };
      natsWebsocket = mkOption {
        type = types.port;
        default = 8222;
        description = "Port WebSocket NATS, joint par le navigateur via `/ws`.";
      };
      redis = mkOption {
        type = types.port;
        default = 6379;
        description = "Port de l'instance Redis dédiée (écoute en local uniquement).";
      };
    };

    versions = {
      plugnmeet = mkOption {
        type = types.str;
        default = "v2.5.2";
        description = "Tag de l'image du serveur PlugNMeet, et de la release du client web qu'il télécharge.";
      };
      livekit = mkOption {
        type = types.str;
        default = "v1.11.0";
        description = "Tag de l'image du serveur LiveKit.";
      };
    };

    rtc = {
      portRangeStart = mkOption {
        type = types.port;
        default = 50000;
      };
      portRangeEnd = mkOption {
        type = types.port;
        default = 60000;
      };
      tcpPort = mkOption {
        type = types.port;
        default = 7881;
      };
    };

    secrets = {
      livekitFile = mkOption {
        type = types.path;
        description = "Fichier sops contenant `livekit_api_key` et `livekit_api_secret`.";
      };
      plugnmeetFile = mkOption {
        type = types.path;
        description = ''
          Fichier sops contenant `plugnmeet_api_key`, `plugnmeet_secret`,
          `nats_user_nkey_seed`, `nats_callout_issuer_seed`,
          `nats_callout_xkey_seed` et `visio_admin_token` (jeton du panneau
          /admin).
        '';
      };
    };

    database = {
      host = mkOption {
        type = types.str;
        default = "127.0.0.1";
      };
      port = mkOption {
        type = types.port;
        default = 3306;
      };
      unit = mkOption {
        type = types.str;
        default = "mysql.service";
        description = "Unité systemd de la base MySQL/MariaDB, dont PlugNMeet dépend.";
      };
      nameSecret = mkOption {
        type = types.str;
        description = "Nom du secret `sops.secrets` contenant le nom de la base.";
      };
      userSecret = mkOption {
        type = types.str;
        description = "Nom du secret `sops.secrets` contenant l'utilisateur de la base.";
      };
      passwordSecret = mkOption {
        type = types.str;
        description = "Nom du secret `sops.secrets` contenant le mot de passe de la base.";
      };
    };

    nats = {
      userNkey = mkOption {
        type = types.str;
        description = "Clé publique nkey « user » (préfixe U) de PlugNMeet ; la graine est `nats_user_nkey_seed`.";
      };
      calloutIssuer = mkOption {
        type = types.str;
        description = "Clé publique nkey « account » (préfixe A) de l'auth callout ; la graine est `nats_callout_issuer_seed`.";
      };
      calloutXkey = mkOption {
        type = types.str;
        description = "Clé publique xkey (préfixe X) de l'auth callout ; la graine est `nats_callout_xkey_seed`.";
      };
    };

    landing = {
      brandName = mkOption {
        type = types.str;
        default = "Visioconférence";
        description = "Nom affiché sur la page d'accueil, dans son titre et sur /admin.";
      };
      defaultLocale = mkOption {
        type = types.enum [
          "fr"
          "en"
        ];
        default = "fr";
        description = ''
          Langue de la page quand rien ne dit celle de la personne. Elle est d'abord celle
          qu'elle a choisie sur la page (boutons de langue), puis celle de son navigateur si
          elle est disponible. Langues disponibles : français et anglais.
        '';
      };
      themeColor = mkOption {
        type = types.str;
        default = "#1f3a5f";
        description = "Couleur de la barre du navigateur (`theme-color`).";
      };
      logo = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = "Logo (png, jpg, webp, svg ou gif), affiché sur la page et utilisé comme icône.";
      };
      css = mkOption {
        type = types.lines;
        default = "";
        example = lib.literalExpression "builtins.readFile ./theme.css";
        description = ''
          CSS injecté après la feuille de style de base de la page d'accueil :
          il peut surcharger les variables de `:root` (`--brand`, `--action`,
          `--accent`, `--page-bg`...) comme n'importe quelle règle. Voir le
          README du module pour la liste des variables et du balisage.
        '';
      };
    };

    caddyHandles = mkOption {
      type = types.lines;
      readOnly = true;
      description = ''
        Directives Caddy à placer dans le vhost de `host` : routage par chemin
        vers LiveKit, NATS et la page d'accueil. Le reste va à PlugNMeet
        (`ports.plugnmeet`). Les en-têtes de sécurité du vhost doivent
        autoriser caméra, micro et partage d'écran (`Permissions-Policy`).
      '';
    };
  };
}
