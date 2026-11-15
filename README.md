# Palabre

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

## Languages

The landing page and the `/admin` panel exist in French and English. Each person gets the language
they picked with the buttons at the top of the page (remembered on their device), otherwise the
first language of their browser that is available, otherwise `landing.defaultLocale`. The
language also sets the room's welcome message and the language of the PlugNMeet meeting.

To add a language: add its code to `src/shared/locales.ts`, copy `src/web/i18n/en.ts` to
`src/web/i18n/<code>.ts` (TypeScript checks that no text is missing), register it in
`src/web/i18n/index.tsx`, add its welcome message in `src/server/messages.ts`, and allow it in the
`landing.defaultLocale` option. All paths are under `module/landing/`.

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
