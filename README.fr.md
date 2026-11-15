# Palabre

[English](README.md)

Visioconférence autohébergée pour NixOS : [PlugNMeet](https://github.com/mynaparrot/plugNmeet-server)
(interface + API) au-dessus de [LiveKit](https://livekit.io) (média) et de NATS (temps réel), avec
une **page d'accueil** personnalisable : création et jonction de salon anonyme, lien de modérateur
personnel et panneau `/admin`.

Module NixOS : `services.palabre`, exposé par ce flake en `nixosModules.palabre`
(`inputs.palabre.nixosModules.palabre`).

## Prérequis

- [pin-oci](https://github.com/corentin703/pin-oci.nix) (conteneurs Podman verrouillés par
  digest) et [sops-nix](https://github.com/Mic92/sops-nix), fournis par l'hôte ;
- un utilisateur système pour Podman rootless (`linger`, subuid/subgid, home) : option `user` ;
- une base MySQL/MariaDB (nom, utilisateur et mot de passe dans des secrets sops) ;
- un reverse proxy qui sert `host` en HTTPS et y colle `services.palabre.caddyHandles` ;
  le vhost doit autoriser caméra, micro et partage d'écran (`Permissions-Policy`).

Redis et NATS sont gérés par le module (instance `redis-palabre`, `services.nats`). Le pare-feu
s'ouvre sur la plage RTC (UDP 50000-60000 et TCP 7881 par défaut).

## Exemple

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
    nameSecret = "plugnmeet_db";           # noms de `sops.secrets` définis ailleurs
    userSecret = "plugnmeet_user";
    passwordSecret = "plugnmeet_password";
  };
  nats = {                                 # clés publiques (nsc generate nkey --user|--account|--curve)
    userNkey = "U…";
    calloutIssuer = "A…";
    calloutXkey = "X…";
  };

  landing = {
    brandName = "Mon organisation";
    themeColor = "#1f3a5f";
    logo = ./logo.png;
    css = builtins.readFile ./theme.css;
  };
};
```

Les ports (`ports.*`), versions d'images (`versions.*`) et la plage RTC (`rtc.*`) ont des valeurs
par défaut.

## Images verrouillées

Les images LiveKit et PlugNMeet sont verrouillées par digest avec pin-oci. Ce flake livre son
propre `pin-oci.lock`, et le projet le suit par défaut
(`virtualisation.pin-oci.projects.palabre.followLockFile`) : votre build lit ce fichier tel quel,
donc vous obtenez les digests testés ici, et votre propre `pin-oci lock` n'y touche pas.

Pour verrouiller les images avec votre verrou à vous :

```nix
virtualisation.pin-oci.projects.palabre.followLockFile = null; # votre virtualisation.pin-oci.lockFile
```

puis lancez `pin-oci lock`. L'hôte doit quand même activer pin-oci et définir son `lockFile`
(`virtualisation.pin-oci.{enable,lockFile}`).

## Personnaliser la page d'accueil

`landing.css` est injecté dans une balise `<style>` placée **après** la feuille de base : il peut
redéfinir les variables ou ajouter n'importe quelle règle.

| Variable      | Rôle                                                | Défaut    |
|---------------|-----------------------------------------------------|-----------|
| `--brand`     | nom, liens, puces numérotées, focus                 | `#1f3a5f` |
| `--action`    | bouton principal (`--action-hover` au survol)       | `#2563eb` |
| `--accent`    | liseré de la feuille, bandeaux                      | `#f59e0b` |
| `--page-bg`   | fond de page (valeur de `background`, dégradé possible) | `#e9edf2` |
| `--sheet`     | fond de la feuille                                  | `#ffffff` |
| `--tint`      | fond des bandeaux et survol des boutons             | `#f3f5f8` |
| `--ink`, `--muted`, `--line` | texte, texte secondaire, filets      |           |
| `--input-border`, `--placeholder` | champs de saisie                |           |

Balisage utile : `body`, `.sheet` (la feuille), `.brand` (logo + nom), `h1`, `.lead`,
`#join-button`, `.banner`, `.history`, `.guide`. Un décor se pose par exemple avec
`body::before { position: fixed; inset: 0; z-index: 0; pointer-events: none; … }` (la feuille
est en `z-index: 1`).

Le panneau `/admin` garde son style neutre ; seul le nom (`brandName`) y apparaît.

## Développement

```console
$ nix develop                          # pin-oci dans le shell
$ pin-oci lock --flake .#lock          # verrouille les images dans ./pin-oci.lock
$ pin-oci lock update --flake .#lock   # fait avancer les tags vers leurs digests actuels
$ nix flake check                      # le module s'évalue, formatage, build de la page d'accueil
```

`.#lock` est une configuration d'exemple (`examples/lock`) qui ne sert qu'à verrouiller les images
et à tester que le module s'évalue. Après une modification de `module/landing/package-lock.json`,
mettez à jour `npmDepsHash` dans `module/landing/package.nix`.

## Structure

- `flake.nix` : expose `nixosModules.palabre` et `packages.palabre-landing` ;
- `module/default.nix` : options ;
- `module/livekit.nix`, `plugnmeet.nix`, `landing.nix` : conteneurs ;
- `module/nats.nix`, `redis.nix` : services natifs ;
- `module/caddy.nix` : routage par chemin (`caddyHandles`) ;
- `module/landing/` : l'application Node.js (`server.js`, `admin.js`) ;
- `examples/lock/` : configuration d'exemple, qui sert à verrouiller les images et aux checks ;
- `pin-oci.lock` : digests verrouillés des images.

## Licence

[MIT](LICENSE)
