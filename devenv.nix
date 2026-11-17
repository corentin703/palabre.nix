# Try the landing page without any infrastructure: `devenv up`.
#
#   http://localhost:3000        landing page (create a room, "email me the links"...)
#   http://localhost:3000/admin  admin panel, token: admin-token
#   http://localhost:8025        mailbox: the mails the page sends
#
# PlugNMeet and the mail relay are faked (module/landing/dev/mock.mjs): "entering" a room leads
# to a stand-in meeting page showing the room, the name and the role. After a change the server restarts by itself; reload the browser.
{ pkgs, ... }:
let
  landing = "module/landing";
in
{
  packages = [ pkgs.nodejs ];

  languages.javascript.enable = true;
  languages.javascript.package = pkgs.nodejs;

  scripts.landing-test.exec = ''
    cd "$DEVENV_ROOT/${landing}" && npm test
  '';
  scripts.landing-typecheck.exec = ''
    cd "$DEVENV_ROOT/${landing}" && npm run typecheck
  '';

  processes = {
    # `--ignore-scripts`: the PlugNMeet SDK's preinstall refuses anything but pnpm (see package.nix).
    install.exec = ''
      cd "$DEVENV_ROOT/${landing}"
      [ -d node_modules ] || npm ci --ignore-scripts
      npx tsc -p tsconfig.server.json && npx vite build
    '';

    server-build = {
      exec = ''cd "$DEVENV_ROOT/${landing}" && exec npx tsc -p tsconfig.server.json --watch --preserveWatchOutput'';
      process-compose.depends_on.install.condition = "process_completed_successfully";
    };
    web-build = {
      exec = ''cd "$DEVENV_ROOT/${landing}" && exec npx vite build --watch'';
      process-compose.depends_on.install.condition = "process_completed_successfully";
    };
    landing = {
      exec = ''cd "$DEVENV_ROOT/${landing}" && exec node --watch-path=dist dev/mock.mjs'';
      process-compose.depends_on.install.condition = "process_completed_successfully";
    };
  };

  enterShell = ''
    echo "devenv up  →  http://localhost:3000 (admin: /admin, token admin-token), mailbox http://localhost:8025"
  '';
}
