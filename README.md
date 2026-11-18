# palabre.nix

[Français](README.fr.md)

Self-hosted video conferencing for NixOS: [PlugNMeet](https://github.com/mynaparrot/plugNmeet-server)
(interface + API) on top of [LiveKit](https://livekit.io) (media) and NATS (real time), with a
customizable **landing page**: anonymous room creation and joining, a personal moderator link,
and an `/admin` panel.

NixOS module: `services.palabre`, exposed by this flake as `nixosModules.palabre`
(`inputs.palabre.nixosModules.palabre`).

## Requirements

- [pin-oci](https://github.com/corentin703/pin-oci.nix) (Podman containers pinned by digest),
  provided by the host;
- a way to put secrets in files readable by root, whatever it is (sops-nix, agenix, systemd
  credentials...): the module only takes file paths, see `secrets.*`;
- a system user for rootless Podman (`linger`, subuid/subgid, home): option `user`;
- a MySQL/MariaDB database (name, user and password in files, see `database.*File`);
- a reverse proxy serving `host` over HTTPS, with `services.palabre.caddyHandles` in its vhost;
  the vhost must allow camera, microphone and screen sharing (`Permissions-Policy`).

Redis and NATS are managed by the module (`redis-palabre` instance, `services.nats`). The
firewall opens the RTC range (UDP 50000-60000 and TCP 7881 by default).

## Example

```nix
services.palabre = {
  enable = true;
  host = "visio.example.org";
  user = "oci-visio";
  stateDir = "/srv/oci/visio/data/plugnmeet";

  # Paths of files holding the secrets (absolute, outside the store, readable by root). Here with
  # sops-nix; any other way of putting secrets in files works.
  secrets = {
    livekitApiKeyFile = config.sops.secrets.livekit-api-key.path;
    livekitApiSecretFile = config.sops.secrets.livekit-api-secret.path;
    plugnmeetApiKeyFile = config.sops.secrets.plugnmeet-api-key.path;
    plugnmeetApiSecretFile = config.sops.secrets.plugnmeet-api-secret.path;
    adminTokenFile = config.sops.secrets.palabre-admin-token.path;   # token of the /admin panel
    # Optional: secret the moderator links are derived from, apart from the PlugNMeet secret
    # (e.g. `openssl rand -hex 32`). Without it the PlugNMeet secret is used, and existing links
    # stay valid; setting or changing it invalidates every moderator link.
    roomKeySecretFile = config.sops.secrets.palabre-room-key-secret.path;
    natsUserSeedFile = config.sops.secrets.nats-user-seed.path;
    natsCalloutIssuerSeedFile = config.sops.secrets.nats-callout-issuer-seed.path;
    natsCalloutXkeySeedFile = config.sops.secrets.nats-callout-xkey-seed.path;
  };
  database = {
    nameFile = config.sops.secrets.palabre-db-name.path;
    userFile = config.sops.secrets.palabre-db-user.path;
    passwordFile = config.sops.secrets.palabre-db-password.path;
  };
  nats = {                                 # public keys (nsc generate nkey --user|--account|--curve)
    userNkey = "U…";
    calloutIssuer = "A…";
    calloutXkey = "X…";
  };

  landing = {
    brandName = "My organization";
    defaultLocale = "en";                 # "fr" (default) or "en"
    themeColor = "#1f3a5f";
    pwa = {
      enable = true;                      # installable app, off by default; requires `logo`
      shortName = "Visio";                # name under the icon (default: brandName)
      backgroundColor = "#ffffff";        # splash screen and adaptive icon background
    };
    logo = ./logo.png;
    css = builtins.readFile ./theme.css;
  };
};
```

Ports (`ports.*`), image versions (`versions.*`) and the RTC range (`rtc.*`) have defaults.

### Secrets

LiveKit, PlugNMeet and the landing page read their secrets from their own configuration file,
mixed with their other settings, so the module has to produce those files. Each one is a template
in the Nix store with `@NAME@` in place of the secrets. Right before the container starts (an
`ExecStartPre` of its unit, as root), the template is filled from the files you gave in
`secrets.*` and `database.*`, written in the container's runtime directory
(`/run/palabre-<container>/config`, owned by `user`, mode 0400) and mounted. No secret ever
enters the store. After changing a secret, restart the container's unit
(`podman-palabre-livekit-server`, `podman-palabre-plugnmeet-server`, `podman-palabre-landing`).
A missing or unreadable file makes the unit fail with a message naming it.

## Pinned images

The LiveKit and PlugNMeet images are pinned by digest with pin-oci. This flake ships its own
`pin-oci.lock`, and the project follows it by default
(`virtualisation.pin-oci.projects.palabre.followLockFile`): your build reads that file as is, so
you get the digests tested here, and your own `pin-oci lock` leaves them alone.

To lock the images with your own lockfile instead:

```nix
virtualisation.pin-oci.projects.palabre.followLockFile = null; # your virtualisation.pin-oci.lockFile
```

then run `pin-oci lock`. The host still has to enable pin-oci and set its `lockFile`
(`virtualisation.pin-oci.{enable,lockFile}`).

## Binary cache

The CI builds the landing page and pushes it to the [Cachix](https://cachix.org) cache `palabre`.
Through this flake, `services.palabre.landing.package` is that package, so hosts download it
instead of compiling it (a Vite build). To use the cache:

```console
$ cachix use palabre
```

or add `https://palabre.cachix.org` and the public key `palabre.cachix.org-1:llE6p76J47pEBXVonV3bdqn+Qhms1fn6JMqDzR9SAXw=`
to `nix.settings.substituters` and `nix.settings.trusted-public-keys` (this flake's `nixConfig` already
does it for its own commands). Maintainers: create the cache on cachix.org and add its
auth token to the repository's secrets as `CACHIX_AUTH_TOKEN`.

## Limiting open meetings

`services.palabre.landing.maxRooms` (default 20) caps the meetings open at the same time: past it,
nobody can start a new one (the page says so), while people can still join the ones that are open.

## Locking a room

In `/admin`, **Lock** closes a room to new guests: the invitation link then answers that the
meeting is closed, even if the room has ended and would otherwise be recreated. Moderators (moderator
link, or the administrator joining or observing from `/admin`) still get in, and whoever is already
in the meeting stays; **Unlock** reverses it. The list of locked rooms is kept in
`services.palabre.landing.stateDir` (default `<stateDir>-landing`).

A moderator can do the same from the room's page: open the moderator link (`/r/<room>?m=<key>`), then
open **Room settings**: it holds the links, their sending by email, and **Close the room to new guests**.

## Languages

The landing page and the `/admin` panel exist in French and English. Each person gets the language
they picked with the buttons at the top of the page (remembered on their device), otherwise the
first language of their browser that is available, otherwise `landing.defaultLocale`. The
language also sets the room's welcome message and the language of the PlugNMeet meeting.

To add a language: add its code to `src/shared/locales.ts`, copy `src/web/i18n/en.ts` to
`src/web/i18n/<code>.ts` (TypeScript checks that no text is missing), register it in
`src/web/i18n/index.tsx`, add its welcome message in `src/server/messages.ts`, and allow it in the
`landing.defaultLocale` option. All paths are under `module/landing/`.

## Tuning LiveKit

```nix
services.palabre = {
  livekit.logLevel = "warn";   # default; "info" writes a line every few seconds per meeting
  livekit.cpuWeight = 200;     # default; systemd CPUWeight (100 = normal): the media server wins a CPU contention
  rtc.udpPort = 7882;          # all the media on one UDP port, instead of portRangeStart-portRangeEnd

  # Relay for participants whose network blocks the media. Off by default.
  livekit.turn = {
    enable = true;
    tlsPort = 443;             # the one that gets through the most networks, if nothing else listens on it
    certFile = "/var/lib/acme/visio.example.org/fullchain.pem";   # readable by `user`
    keyFile = "/var/lib/acme/visio.example.org/key.pem";
  };
};
```

The firewall follows (`udpPort`, the TURN ports). TURN needs `turn.udpPort` (3478) and, with a
certificate, `turn.tlsPort` reachable from the Internet; without `certFile`/`keyFile` only TURN over
UDP is enabled, which helps little against networks that filter UDP.

## Sending the links by email

With `landing.mail` set, the page offers to email the room's links to whoever created it: two
separate mails, one with the invitation link (which can be forwarded as is) and one with the
moderator link (with a warning not to forward it), written in the language chosen on the page.
They reuse the landing page's look (white sheet, accent bar, `themeColor`, logo). The `/admin`
panel gives both links of every room, open or past, with copy buttons.

```nix
services.palabre.landing.mail = {
  host = "smtp.example.org";
  security = "starttls";               # "tls" (465), "starttls" (587, default) or "none"
  from = "visio@example.org";
  user = "visio";
  passwordFile = config.sops.secrets.palabre-smtp-password.path;
};
```

Each setting (`host`, `port`, `security`, `user`, `from`) can also be given as the path of a
file holding it (`hostFile`, `portFile`, `securityFile`, `userFile`, `fromFile`), for credentials
already kept in a secrets manager. `securityFile` also understands `ssl`, `force_tls` and `off`.

The form only sends the links of a room to someone who holds its moderator key, at most 3 times a
day to the same address.

## Customizing the landing page

`landing.css` is injected in a `<style>` tag **after** the base stylesheet: it can redefine the
variables or add any rule.

| Variable      | Role                                               | Default   |
|---------------|----------------------------------------------------|-----------|
| `--brand`     | name, links, numbered bullets, focus               | `#1f3a5f` |
| `--action`    | main button (`--action-hover` on hover)            | `#2563eb` |
| `--accent`    | sheet edge, banners                                | `#f59e0b` |
| `--page-bg`   | page background (a `background` value, may be a gradient) | `#e9edf2` |
| `--sheet`     | sheet background                                   | `#ffffff` |
| `--tint`      | banner background, button hover                    | `#f3f5f8` |
| `--ink`, `--muted`, `--line` | text, secondary text, rules         |           |
| `--input-border`, `--placeholder` | input fields                   |           |

Useful markup: `body`, `.sheet` (the sheet), `.brand` (logo + name), `h1`, `.lead`,
`#join-button`, `.banner`, `.history`, `.guide`. A backdrop can be added with, for example,
`body::before { position: fixed; inset: 0; z-index: 0; pointer-events: none; … }` (the sheet is
at `z-index: 1`).

With `pwa.enable = true` (off by default; the evaluation fails if `logo` is missing) the page is an
installable app. Its name (`brandName`, `pwa.shortName`), colors (`themeColor`,
`pwa.backgroundColor`) and icon come from the module options. The icons (192 and 512 px, plus an
adaptive one) are made from `logo` by the server on the first request, then served from memory.
Chrome and other Chromium browsers show a banner inviting to install; Firefox does not.

The `/admin` panel keeps its neutral style; only the name (`brandName`) appears there.

## Development

```console
$ nix develop                          # pin-oci in the shell
$ pin-oci lock --flake .#lock          # lock the images into ./pin-oci.lock
$ pin-oci lock update --flake .#lock   # move the tags to their current digests
$ nix flake check                      # the module evaluates, formatting, landing page build and tests
```

`.#lock` is an example configuration (`examples/lock`) that only exists to lock the images and
to test that the module evaluates.

The landing page is a TypeScript project in `module/landing/` (Node 22+, npm):

```console
$ cd module/landing
$ npm ci
$ npm run build       # server (tsc -> dist/server) and web app (vite -> dist/web)
$ npm test            # vitest
$ npm run typecheck
$ npm run dev         # Vite dev server for the web app; run `npm start` next to it (API on :3000)
```

After changing `package-lock.json`, update `npmDepsHash` in `module/landing/package.nix` (put
`lib.fakeHash`, build, copy the hash Nix prints).

### Trying it quickly

`devenv up` runs the whole stack on your machine, with no infrastructure to set up (Docker is
needed for PlugNMeet; the first start downloads its image and its web client):

- <http://localhost:8080>: the public address, as a real deployment's vhost: the landing page, the
  meetings, and <http://localhost:8080/admin> (token `palabre-dev-admin-token-0123456789`);
- <http://localhost:8025>: the mailbox, with the mails the landing page sends.

Redis, MariaDB, NATS and LiveKit run natively; PlugNMeet runs in Docker, from the image pinned in
`pin-oci.lock`; Caddy routes by path like `caddyHandles`, without TLS (`localhost` is a secure
context: camera and microphone work). The landing page is the real one, rebuilt on change (reload the
browser). The configuration of the stack is written by `dev/setup.sh`.

`landing-mock` (in `devenv shell`) runs the landing page alone with a fake PlugNMeet, if you do not
have Docker.

## Layout

- `flake.nix`: exposes `nixosModules.palabre` and `packages.palabre-landing`;
- `module/default.nix`: options;
- `module/livekit.nix`, `plugnmeet.nix`, `landing.nix`: containers;
- `module/nats.nix`, `redis.nix`: native services;
- `module/caddy.nix`: path-based routing (`caddyHandles`);
- `module/landing/`: the landing page, in TypeScript:
  - `src/server/`: Node server, JSON API only (join, admin, files);
  - `src/web/`: the web app (Vite + React): join page, `/admin`, `i18n/` for the texts;
  - `src/shared/`: what both sides share (room name rules, API types, languages);
- `examples/lock/`: example configuration, used to lock the images and by the checks;
- `pin-oci.lock`: pinned digests of the images.

## License

[MIT](LICENSE)
