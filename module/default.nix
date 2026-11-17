# palabre.nix: self-hosted video conferencing.
#
# PlugNMeet (interface + API) on top of LiveKit (audio/video media) and NATS
# (real time), with a customizable public landing page (anonymous room
# creation/joining, /admin panel). See README.md.
{
  config,
  lib,
  pkgs,
  ...
}:
let
  inherit (lib) mkEnableOption mkOption types;

  # Path of a secret file, outside the store (the secret would end up there in
  # clear text otherwise). Readable by root: the module builds its configuration
  # files from them at startup (see secrets.nix).
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

  # The images (LiveKit, PlugNMeet) are pinned by this flake's `pin-oci.lock`, read
  # as is by the host; the host can override it (`followLockFile = null` to pin
  # them with its own). See README.md.
  config = lib.mkIf config.services.palabre.enable {
    virtualisation.pin-oci.projects.palabre.followLockFile = lib.mkDefault ../pin-oci.lock;
  };

  options.services.palabre = {
    enable = mkEnableOption "palabre.nix (PlugNMeet + LiveKit + NATS + landing page)";

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
          Package of the landing page. Through the flake it is the one the palabre.nix CI builds and
          pushes to its binary cache, so the host does not compile it.
        '';
      };
      brandName = mkOption {
        type = types.str;
        default = "Visioconférence";
        description = "Name shown on the landing page, in its title, on /admin and as the name of the installed app (PWA).";
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
        description = "Color of the browser bar and of the installed app's title bar (`theme-color`).";
      };
      pwa = {
        enable = mkEnableOption "the installable app (PWA): manifest, service worker and install banner (needs `logo`)";
        shortName = mkOption {
          type = types.nullOr types.str;
          default = null;
          example = "Visio";
          description = ''
            Name of the installed app under its icon, where space is short. Default: `brandName`,
            cut to 12 characters if longer.
          '';
        };
        backgroundColor = mkOption {
          type = types.str;
          default = "#ffffff";
          description = "Splash screen color of the installed app, and background of its adaptive icon.";
        };
      };
      logo = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = "Logo (png, jpg, webp, svg or gif), shown on the page and used as its icon, and, with `pwa.enable`, resized by the server (on the first request, then kept in memory) into the installed app's icons: square and at least 512x512 recommended. Required by `pwa.enable`.";
      };
      mail = {
        host = mkOption {
          type = types.nullOr types.str;
          default = null;
          example = "smtp.example.org";
          description = ''
            SMTP relay used to send room links by email (the "Get both links by email" form of
            the landing page: one mail with the invitation link, one with the moderator link,
            in the language chosen on the page). `null`: the form is not shown.
          '';
        };
        port = mkOption {
          type = types.nullOr types.port;
          default = null;
          description = "SMTP port. Default: 465 with `security = \"tls\"`, otherwise 587.";
        };
        security = mkOption {
          type = types.enum [
            "tls"
            "starttls"
            "none"
          ];
          default = "starttls";
          description = "`tls`: encrypted from the start (port 465); `starttls`: upgraded after connecting (587); `none`: clear text, for a local relay only.";
        };
        user = mkOption {
          type = types.nullOr types.str;
          default = null;
          description = "SMTP login; `null` for a relay that needs none. Used with `passwordFile`.";
        };
        passwordFile = mkOption {
          type = types.nullOr secretFile;
          default = null;
          description = "File containing the SMTP password (used with `user`).";
        };
        from = mkOption {
          type = types.nullOr types.str;
          default = null;
          example = "visio@example.org";
          description = "Sender address of the mails (shown with `landing.brandName` as its name). Required with `host`.";
        };
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
