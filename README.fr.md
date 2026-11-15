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
    defaultLocale = "fr";                 # "fr" (défaut) ou "en"
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

## Cache binaire

La CI construit la page d'accueil et la pousse dans le cache [Cachix](https://cachix.org)
`palabre`. Via ce flake, `services.palabre.landing.package` est ce paquet : les hôtes le
téléchargent au lieu de le compiler (un build Vite). Pour utiliser le cache :

```console
$ cachix use palabre
```

ou ajoutez `https://palabre.cachix.org` et la clé publique `palabre.cachix.org-1:llE6p76J47pEBXVonV3bdqn+Qhms1fn6JMqDzR9SAXw=`
à `nix.settings.substituters` et `nix.settings.trusted-public-keys` (le `nixConfig` de ce flake le fait
déjà pour ses propres commandes). Mainteneurs : créez le cache sur cachix.org et ajoutez son
jeton d'authentification aux secrets du dépôt sous le nom `CACHIX_AUTH_TOKEN`.

## Langues

La page d'accueil et le panneau `/admin` existent en français et en anglais. Chaque personne a la
langue qu'elle a choisie avec les boutons en haut de la page (retenue sur son appareil), sinon la
première langue de son navigateur qui est disponible, sinon `landing.defaultLocale`. La langue
détermine aussi le message de bienvenue du salon et la langue de la réunion PlugNMeet.

Pour ajouter une langue : ajoutez son code dans `src/shared/locales.ts`, copiez
`src/web/i18n/en.ts` en `src/web/i18n/<code>.ts` (TypeScript vérifie qu'aucun texte ne manque),
déclarez-la dans `src/web/i18n/index.tsx`, ajoutez son message de bienvenue dans
`src/server/messages.ts`, et autorisez-la dans l'option `landing.defaultLocale`. Tous les chemins
sont sous `module/landing/`.

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
$ nix flake check                      # le module s'évalue, formatage, build de la page d'accueil et tests
```

`.#lock` est une configuration d'exemple (`examples/lock`) qui ne sert qu'à verrouiller les images
et à tester que le module s'évalue.

La page d'accueil est un projet TypeScript dans `module/landing/` (Node 22+, npm) :

```console
$ cd module/landing
$ npm ci
$ npm run build       # serveur (tsc -> dist/server) et application web (vite -> dist/web)
$ npm test            # vitest
$ npm run typecheck
$ npm run dev         # serveur de développement Vite ; lancez `npm start` à côté (API sur :3000)
```

Après une modification de `package-lock.json`, mettez à jour `npmDepsHash` dans
`module/landing/package.nix` (mettez `lib.fakeHash`, construisez, copiez le hash affiché par Nix).

## Structure

- `flake.nix` : expose `nixosModules.palabre` et `packages.palabre-landing` ;
- `module/default.nix` : options ;
- `module/livekit.nix`, `plugnmeet.nix`, `landing.nix` : conteneurs ;
- `module/nats.nix`, `redis.nix` : services natifs ;
- `module/caddy.nix` : routage par chemin (`caddyHandles`) ;
- `module/landing/` : la page d'accueil, en TypeScript :
  - `src/server/` : serveur Node, API JSON uniquement (jonction, administration, fichiers) ;
  - `src/web/` : l'application web (Vite + React) : page d'accueil, `/admin`, `i18n/` pour les textes ;
  - `src/shared/` : ce que les deux côtés partagent (règles des noms de salon, types de l'API, langues) ;
- `examples/lock/` : configuration d'exemple, qui sert à verrouiller les images et aux checks ;
- `pin-oci.lock` : digests verrouillés des images.

## Licence

[MIT](LICENSE)
