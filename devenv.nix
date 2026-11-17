# The whole stack on your machine: `devenv up`.
#
#   http://localhost:8080        the public address (like the vhost of a real deployment):
#                                landing page, /admin (token: admin-token), and the meetings
#   http://localhost:8025        mailbox: the mails sent by the "email me the links" form
#
# Redis, MariaDB, NATS and LiveKit run natively; PlugNMeet runs in Docker (its image, pinned by
# digest in pin-oci.lock, has no Nix package); Caddy routes by path as caddy.nix does, without
# TLS (http://localhost is a secure context: camera and microphone work). The landing page is the
# real one, rebuilt on change. PlugNMeet downloads its web client from GitHub on its first start.
#
# Without Docker, `landing-mock` runs the landing page alone, with a fake PlugNMeet.
{
  pkgs,
  config,
  lib,
  ...
}:
let
  landing = "module/landing";
  ports = {
    public = 8080;
    plugnmeet = 10003;
    livekit = 10005;
    landing = 10006;
    nats = 14222;
    natsWs = 18222;
    redis = 16379;
    mysql = 13306;
    rtcTcp = 17881;
    rtcFrom = 50000;
    rtcTo = 50100;
    smtp = 2525;
    mailbox = 8025;
  };
  version = "v2.5.2"; # services.palabre.versions.plugnmeet
  apiKey = "devapikey";
  apiSecret = "devapisecretdevapisecretdevapisecret";
  livekitKey = "devlivekitkey";
  livekitSecret = "devlivekitsecretdevlivekitsecret0";

  # Waits for the ports given (bash), and fails with a message rather than waiting for ever.
  waitFor =
    ps:
    lib.concatMapStringsSep "\n" (p: ''
      for i in $(seq 1 180); do
        (echo > /dev/tcp/127.0.0.1/${toString p}) 2>/dev/null && break
        [ "$i" = 180 ] && { echo "nothing listens on port ${toString p} after 3 minutes" >&2; exit 1; }
        sleep 1
      done
    '') ps;
in
{
  packages = [
    pkgs.nodejs
    pkgs.nsc
    pkgs.jq
    pkgs.caddy
    pkgs.livekit
    pkgs.nats-server
  ];

  languages.javascript.enable = true;
  languages.javascript.package = pkgs.nodejs;

  env = {
    PNM_STATE = "${config.devenv.state}/palabre";
    PNM_PUBLIC_PORT = toString ports.public;
    PNM_PLUGNMEET_PORT = toString ports.plugnmeet;
    PNM_LIVEKIT_PORT = toString ports.livekit;
    PNM_LANDING_PORT = toString ports.landing;
    PNM_NATS_PORT = toString ports.nats;
    PNM_NATS_WS_PORT = toString ports.natsWs;
    PNM_REDIS_PORT = toString ports.redis;
    PNM_MYSQL_PORT = toString ports.mysql;
    PNM_RTC_TCP = toString ports.rtcTcp;
    PNM_RTC_FROM = toString ports.rtcFrom;
    PNM_RTC_TO = toString ports.rtcTo;
    PNM_VERSION = version;
    PNM_API_KEY = apiKey;
    PNM_API_SECRET = apiSecret;
    PNM_LIVEKIT_KEY = livekitKey;
    PNM_LIVEKIT_SECRET = livekitSecret;
  };

  services.redis = {
    enable = true;
    port = ports.redis;
  };

  services.mysql = {
    enable = true;
    package = pkgs.mariadb;
    settings.mysqld = {
      port = ports.mysql;
      bind-address = "127.0.0.1";
    };
    initialDatabases = [ { name = "plugnmeet"; } ];
    ensureUsers = [
      {
        name = "plugnmeet";
        password = "plugnmeet";
        ensurePermissions."plugnmeet.*" = "ALL PRIVILEGES";
      }
    ];
  };

  scripts.landing-test.exec = ''cd "$DEVENV_ROOT/${landing}" && npm test'';
  scripts.landing-typecheck.exec = ''cd "$DEVENV_ROOT/${landing}" && npm run typecheck'';
  scripts.landing-mock.exec = ''
    cd "$DEVENV_ROOT/${landing}"
    [ -d node_modules ] || npm ci --ignore-scripts
    npx tsc -p tsconfig.server.json && npx vite build && exec node dev/mock.mjs
  '';

  processes = {
    # Configuration of the stack, then the web application's first build.
    setup.exec = ''
      "$DEVENV_ROOT/dev/setup.sh"
      cd "$DEVENV_ROOT/${landing}"
      # `--ignore-scripts`: the PlugNMeet SDK's preinstall refuses anything but pnpm (see package.nix).
      [ -d node_modules ] || npm ci --ignore-scripts
      npx tsc -p tsconfig.server.json && npx vite build
    '';

    nats = {
      exec = ''exec nats-server -c "$PNM_STATE/nats.conf"'';
      process-compose.depends_on.setup.condition = "process_completed_successfully";
    };

    livekit = {
      exec = ''
        ${waitFor [ ports.redis ]}
        exec livekit-server --config "$PNM_STATE/livekit.yaml"
      '';
      process-compose.depends_on.setup.condition = "process_completed_successfully";
    };

    plugnmeet = {
      exec = ''
        ${waitFor [
          ports.redis
          ports.mysql
          ports.nats
          ports.livekit
        ]}
        # The image of services.palabre.versions.plugnmeet, by the digest pin-oci.lock pins.
        case "$(uname -m)" in aarch64) arch=aarch64-linux ;; *) arch=x86_64-linux ;; esac
        digest=$(jq -r --arg a "$arch" '.images["docker.io/mynaparrot/plugnmeet-server:${version}"].arch[$a].digest' "$DEVENV_ROOT/pin-oci.lock")
        image="mynaparrot/plugnmeet-server@$digest"
        docker rm -f palabre-dev-plugnmeet >/dev/null 2>&1 || true
        exec docker run --rm --name palabre-dev-plugnmeet --network=host \
          --user "$(id -u):$(id -g)" \
          -v "$PNM_STATE/plugnmeet:/app" \
          -v "$PNM_STATE/plugnmeet.yaml:/app/config.yaml:ro" \
          "$image"
      '';
      process-compose.depends_on.setup.condition = "process_completed_successfully";
    };

    caddy = {
      exec = ''exec caddy run --config "$PNM_STATE/Caddyfile" --adapter caddyfile'';
      process-compose.depends_on.setup.condition = "process_completed_successfully";
    };

    mailbox.exec = ''cd "$DEVENV_ROOT/${landing}" && exec env SMTP_PORT=${toString ports.smtp} MAILBOX_PORT=${toString ports.mailbox} node dev/mailbox.mjs'';

    # The landing page proper, restarted when its build changes.
    server-build = {
      exec = ''cd "$DEVENV_ROOT/${landing}" && exec npx tsc -p tsconfig.server.json --watch --preserveWatchOutput'';
      process-compose.depends_on.setup.condition = "process_completed_successfully";
    };
    web-build = {
      exec = ''cd "$DEVENV_ROOT/${landing}" && exec npx vite build --watch'';
      process-compose.depends_on.setup.condition = "process_completed_successfully";
    };
    landing = {
      exec = ''
        cd "$DEVENV_ROOT/${landing}"
        export PORT=${toString ports.landing} BIND_HOST=127.0.0.1
        export PLUGNMEET_HOST=http://localhost:${toString ports.public}
        export PLUGNMEET_API_URL=http://127.0.0.1:${toString ports.plugnmeet}
        export PLUGNMEET_API_KEY=${apiKey} PLUGNMEET_SECRET=${apiSecret}
        export ADMIN_TOKEN=admin-token LANDING_BRAND_NAME="Palabre (dev)"
        export MAIL_HOST=127.0.0.1 MAIL_PORT=${toString ports.smtp} MAIL_SECURITY=none MAIL_FROM=visio@palabre.test
        exec node --watch-path=dist dist/server/main.js
      '';
      process-compose.depends_on.setup.condition = "process_completed_successfully";
    };
  };

  enterShell = ''
    echo "devenv up  →  http://localhost:${toString ports.public} (admin: /admin, token admin-token), mailbox http://localhost:${toString ports.mailbox}"
  '';
}
