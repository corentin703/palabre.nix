# Palabre

[Français](README.fr.md)

Self-hosted video conferencing for NixOS: [PlugNMeet](https://github.com/mynaparrot/plugNmeet-server)
(interface + API) on top of [LiveKit](https://livekit.io) (media) and NATS (real time), with a
customizable **landing page**: anonymous room creation and joining, a personal moderator link,
and an `/admin` panel.

NixOS module: `services.palabre`, exposed by this flake as `nixosModules.palabre`
(`inputs.palabre.nixosModules.palabre`).

## Requirements

- [pin-oci](https://github.com/corentin703/pin-oci.nix) (Podman containers pinned by digest) and
  [sops-nix](https://github.com/Mic92/sops-nix), provided by the host;
- a system user for rootless Podman (`linger`, subuid/subgid, home): option `user`;
- a MySQL/MariaDB database (name, user and password in sops secrets);
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

  secrets = {
    livekitFile = ./livekit.sops.yaml;     # livekit_api_key, livekit_api_secret
    plugnmeetFile = ./plugnmeet.sops.yaml; # plugnmeet_api_key, plugnmeet_secret, visio_admin_token,
                                           # nats_user_nkey_seed, nats_callout_issuer_seed, nats_callout_xkey_seed
  };
  database = {
    nameSecret = "plugnmeet_db";           # names of `sops.secrets` defined elsewhere
    userSecret = "plugnmeet_user";
    passwordSecret = "plugnmeet_password";
  };
  nats = {                                 # public keys (nsc generate nkey --user|--account|--curve)
    userNkey = "U…";
    calloutIssuer = "A…";
    calloutXkey = "X…";
  };

  landing = {
    brandName = "My organization";
    themeColor = "#1f3a5f";
    logo = ./logo.png;
    css = builtins.readFile ./theme.css;
  };
};
```

Ports (`ports.*`), image versions (`versions.*`) and the RTC range (`rtc.*`) have defaults.

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
$ nix flake check                      # the module evaluates, formatting, landing page build
```

`.#lock` is an example configuration (`examples/lock`) that only exists to lock the images and
to test that the module evaluates. After changing `module/landing/package-lock.json`, update
`npmDepsHash` in `module/landing/package.nix`.

## Layout

- `flake.nix`: exposes `nixosModules.palabre` and `packages.palabre-landing`;
- `module/default.nix`: options;
- `module/livekit.nix`, `plugnmeet.nix`, `landing.nix`: containers;
- `module/nats.nix`, `redis.nix`: native services;
- `module/caddy.nix`: path-based routing (`caddyHandles`);
- `module/landing/`: the Node.js application (`server.js`, `admin.js`);
- `examples/lock/`: example configuration, used to lock the images and by the checks;
- `pin-oci.lock`: pinned digests of the images.

## License

[MIT](LICENSE)
