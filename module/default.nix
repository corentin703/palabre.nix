# Palabre : visioconférence autohébergée.
#
# PlugNMeet (interface + API) au-dessus de LiveKit (média audio/vidéo) et NATS
# (temps réel), avec une page d'accueil publique (création/jonction de salon
# anonyme, panneau /admin) personnalisable. Voir README.md.
{
  config,
  lib,
  pkgs,
  ...
}:
let
  inherit (lib) mkEnableOption mkOption types;

  # Chemin d'un fichier de secret, hors du store (le secret n'y entrerait pas en clair sinon).
  # Lisible par root : le module en tire les configurations au démarrage (voir secrets.nix).
  secretFile = types.pathWith {
    inStore = false;
    absolute = true;
  };
in
{
  imports = [
    ./livekit.nix
    ./nats.nix
    ./redis.nix
    ./secrets.nix
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
    enable = mkEnableOption "Palabre (PlugNMeet + LiveKit + NATS + landing page)";

    host = mkOption {
      type = types.str;
      example = "visio.example.org";
      description = ''
        Single public domain name. PlugNMeet, LiveKit (`/livekit`), NATS
        (`/ws`) and the landing page are all served from it: the reverse
        proxy has to route by path (see `caddyHandles`).
      '';
    };

    user = mkOption {
      type = types.str;
      example = "oci-visio";
      description = ''
        System user running the containers with rootless Podman (pin-oci's
        `podman.user`). It must already exist, with `linger`, subuid/subgid
        ranges and a home for Podman's configuration: the module does not
        create it.
      '';
    };

    stateDir = mkOption {
      type = types.str;
      example = "/srv/oci/visio/data/plugnmeet";
      description = ''
        Persistent directory mounted in the PlugNMeet server (downloaded web
        client, uploaded files, logs). It is created (owned by `user`); its
        parent must exist.
      '';
    };

    ports = {
      plugnmeet = mkOption {
        type = types.port;
        default = 10003;
        description = "Local port of the PlugNMeet server.";
      };
      livekit = mkOption {
        type = types.port;
        default = 10005;
        description = "Local (HTTP/WebSocket) port of LiveKit. Never opened in the firewall.";
      };
      landing = mkOption {
        type = types.port;
        default = 10006;
        description = "Local port of the landing page.";
      };
      nats = mkOption {
        type = types.port;
        default = 4222;
        description = "NATS (client) port.";
      };
      natsWebsocket = mkOption {
        type = types.port;
        default = 8222;
        description = "NATS WebSocket port, reached by the browser through `/ws`.";
      };
      redis = mkOption {
        type = types.port;
        default = 6379;
        description = "Port of the dedicated Redis instance (listens on localhost only).";
      };
    };

    versions = {
      plugnmeet = mkOption {
        type = types.str;
        default = "v2.5.2";
        description = "Tag of the PlugNMeet server image, and of the web client release it downloads.";
      };
      livekit = mkOption {
        type = types.str;
        default = "v1.11.0";
        description = "Tag of the LiveKit server image.";
      };
    };

    rtc = {
      portRangeStart = mkOption {
        type = types.port;
        default = 50000;
        description = "First port of the UDP range LiveKit uses for media (opened in the firewall).";
      };
      portRangeEnd = mkOption {
        type = types.port;
        default = 60000;
        description = "Last port of the UDP range LiveKit uses for media (opened in the firewall).";
      };
      tcpPort = mkOption {
        type = types.port;
        default = 7881;
        description = "TCP port LiveKit uses for media when UDP is not available (opened in the firewall).";
      };
    };

    secrets = {
      livekitApiKeyFile = mkOption {
        type = secretFile;
        description = "File containing the LiveKit API key.";
      };
      livekitApiSecretFile = mkOption {
        type = secretFile;
        description = "File containing the LiveKit API secret.";
      };
      plugnmeetApiKeyFile = mkOption {
        type = secretFile;
        description = "File containing the PlugNMeet API key.";
      };
      plugnmeetApiSecretFile = mkOption {
        type = secretFile;
        description = "File containing the PlugNMeet API secret.";
      };
      adminTokenFile = mkOption {
        type = secretFile;
        description = "File containing the token of the /admin panel.";
      };
      natsUserSeedFile = mkOption {
        type = secretFile;
        description = "File containing PlugNMeet's nkey \"user\" seed (`nats.userNkey` is its public key).";
      };
      natsCalloutIssuerSeedFile = mkOption {
        type = secretFile;
        description = "File containing the auth callout's nkey \"account\" seed (`nats.calloutIssuer` is its public key).";
      };
      natsCalloutXkeySeedFile = mkOption {
        type = secretFile;
        description = "File containing the auth callout's xkey seed (`nats.calloutXkey` is its public key).";
      };
    };

    database = {
      host = mkOption {
        type = types.str;
        default = "127.0.0.1";
        description = "Host of the MySQL/MariaDB server.";
      };
      port = mkOption {
        type = types.port;
        default = 3306;
        description = "Port of the MySQL/MariaDB server.";
      };
      unit = mkOption {
        type = types.str;
        default = "mysql.service";
        description = "systemd unit of the MySQL/MariaDB server, which PlugNMeet depends on.";
      };
      nameFile = mkOption {
        type = secretFile;
        description = "File containing the name of the database.";
      };
      userFile = mkOption {
        type = secretFile;
        description = "File containing the database user.";
      };
      passwordFile = mkOption {
        type = secretFile;
        description = "File containing the database password.";
      };
    };

    nats = {
      userNkey = mkOption {
        type = types.str;
        description = "PlugNMeet's public nkey \"user\" key (prefix U); its seed is `secrets.natsUserSeedFile`.";
      };
      calloutIssuer = mkOption {
        type = types.str;
        description = "Public nkey \"account\" key (prefix A) of the auth callout; its seed is `secrets.natsCalloutIssuerSeedFile`.";
      };
      calloutXkey = mkOption {
        type = types.str;
        description = "Public xkey key (prefix X) of the auth callout; its seed is `secrets.natsCalloutXkeySeedFile`.";
      };
    };

    landing = {
      package = mkOption {
        type = types.package;
        default = pkgs.callPackage ./landing/package.nix { };
        defaultText = lib.literalMD "the flake's `packages.<system>.palabre-landing` (otherwise built with the host's nixpkgs)";
        description = ''
          Package of the landing page. Through the flake it is the one Palabre's CI builds and
          pushes to its binary cache, so the host does not compile it.
        '';
      };
      brandName = mkOption {
        type = types.str;
        default = "Visioconférence";
        description = "Name shown on the landing page, in its title and on /admin.";
      };
      defaultLocale = mkOption {
        type = types.enum [
          "fr"
          "en"
        ];
        default = "fr";
        description = ''
          Language of the page when nothing says which one the visitor wants. A visitor gets the
          language they picked on the page (language buttons), otherwise the first language of
          their browser that is available, otherwise this one. Available languages: French and
          English.
        '';
      };
      themeColor = mkOption {
        type = types.str;
        default = "#1f3a5f";
        description = "Color of the browser bar (`theme-color`).";
      };
      logo = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = "Logo (png, jpg, webp, svg or gif), shown on the page and used as its icon.";
      };
      css = mkOption {
        type = types.lines;
        default = "";
        example = lib.literalExpression "builtins.readFile ./theme.css";
        description = ''
          CSS injected after the landing page's base stylesheet: it can override the `:root`
          variables (`--brand`, `--action`, `--accent`, `--page-bg`...) like any other rule. See
          the README for the list of variables and the markup.
        '';
      };
    };

    caddyHandles = mkOption {
      type = types.lines;
      readOnly = true;
      description = ''
        Caddy directives for the vhost of `host`: path-based routing to LiveKit,
        NATS and the landing page. Everything else goes to PlugNMeet
        (`ports.plugnmeet`). The vhost's security headers must allow camera,
        microphone and screen sharing (`Permissions-Policy`).
      '';
    };
  };
}
