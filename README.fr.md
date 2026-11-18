# palabre.nix

[English](README.md)

Visioconférence autohébergée pour NixOS : [PlugNMeet](https://github.com/mynaparrot/plugNmeet-server)
(interface + API) au-dessus de [LiveKit](https://livekit.io) (média) et de NATS (temps réel), avec
une **page d'accueil** personnalisable : création et jonction de salon anonyme, lien de modérateur
personnel et panneau `/admin`.

Module NixOS : `services.palabre`, exposé par ce flake en `nixosModules.palabre`
(`inputs.palabre.nixosModules.palabre`).

## Prérequis

- [pin-oci](https://github.com/corentin703/pin-oci.nix) (conteneurs Podman verrouillés par
  digest), fourni par l'hôte ;
- un moyen de déposer les secrets dans des fichiers lisibles par root, quel qu'il soit (sops-nix,
  agenix, credentials systemd...) : le module ne prend que des chemins, voir `secrets.*` ;
- un utilisateur système pour Podman rootless (`linger`, subuid/subgid, home) : option `user` ;
- une base MySQL/MariaDB (nom, utilisateur et mot de passe dans des fichiers, voir `database.*File`) ;
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

  # Chemins des fichiers qui contiennent les secrets (absolus, hors du store, lisibles par root).
  # Ici avec sops-nix ; tout autre moyen de déposer des secrets dans des fichiers convient.
  secrets = {
    livekitApiKeyFile = config.sops.secrets.livekit-api-key.path;
    livekitApiSecretFile = config.sops.secrets.livekit-api-secret.path;
    plugnmeetApiKeyFile = config.sops.secrets.plugnmeet-api-key.path;
    plugnmeetApiSecretFile = config.sops.secrets.plugnmeet-api-secret.path;
    adminTokenFile = config.sops.secrets.palabre-admin-token.path;   # jeton du panneau /admin
    # Facultatif : secret dont dérivent les liens modérateur, distinct du secret PlugNMeet
    # (p. ex. `openssl rand -hex 32`). Sans lui, le secret PlugNMeet est utilisé et les liens
    # existants restent valables ; le définir ou le changer invalide tous les liens modérateur.
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
  nats = {                                 # clés publiques (nsc generate nkey --user|--account|--curve)
    userNkey = "U…";
    calloutIssuer = "A…";
    calloutXkey = "X…";
  };

  landing = {
    brandName = "Mon organisation";
    defaultLocale = "fr";                 # "fr" (défaut) ou "en"
    themeColor = "#1f3a5f";
    pwa = {
      enable = true;                      # app installable, désactivée par défaut ; exige `logo`
      shortName = "Visio";                # nom sous l'icône (défaut : brandName)
      backgroundColor = "#ffffff";        # écran de démarrage et fond de l'icône adaptative
    };
    logo = ./logo.png;
    css = builtins.readFile ./theme.css;
  };
};
```

Les ports (`ports.*`), versions d'images (`versions.*`) et la plage RTC (`rtc.*`) ont des valeurs
par défaut.

### Secrets

LiveKit, PlugNMeet et la page d'accueil lisent leurs secrets dans leur propre fichier de
configuration, mêlés à leurs autres réglages : le module doit donc produire ces fichiers. Chacun
est un modèle du store avec `@NOM@` à la place des secrets. Juste avant le démarrage du conteneur
(un `ExecStartPre` de son unité, en root), le modèle est rempli à partir des fichiers donnés dans
`secrets.*` et `database.*`, écrit dans le dossier d'exécution du conteneur
(`/run/palabre-<conteneur>/config`, propriétaire `user`, mode 0400) et monté. Aucun secret
n'entre dans le store. Après un changement de secret, redémarrez l'unité du conteneur
(`podman-palabre-livekit-server`, `podman-palabre-plugnmeet-server`, `podman-palabre-landing`).
Un fichier absent ou illisible fait échouer l'unité avec un message qui le nomme.

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

## Limiter les réunions ouvertes

`services.palabre.landing.maxRooms` (20 par défaut) plafonne les réunions ouvertes en même temps :
au-delà, personne ne peut en démarrer une nouvelle (la page l'indique), mais on peut toujours
rejoindre celles qui sont ouvertes.

## Verrouiller une salle

Dans `/admin`, **Verrouiller** ferme une salle aux nouveaux invités : le lien d'invitation répond
alors que la réunion est fermée, même si la salle est terminée et serait sinon recréée. Les
modérateurs (lien modérateur, ou l'administrateur qui rejoint ou observe depuis `/admin`) entrent
toujours, et les personnes déjà présentes restent ; **Déverrouiller** annule. La liste des salles
verrouillées est conservée dans `services.palabre.landing.stateDir` (par défaut `<stateDir>-landing`).

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

## Réglages de LiveKit

```nix
services.palabre = {
  livekit.logLevel = "warn";   # défaut ; "info" écrit une ligne toutes les quelques secondes par réunion
  livekit.cpuWeight = 200;     # défaut ; CPUWeight systemd (100 = normal) : le serveur média passe en premier
  rtc.udpPort = 7882;          # tout le média sur un seul port UDP, au lieu de portRangeStart-portRangeEnd

  # Relais pour les participants dont le réseau bloque le média. Désactivé par défaut.
  livekit.turn = {
    enable = true;
    tlsPort = 443;             # celui qui passe le plus de réseaux, si rien d'autre n'écoute dessus
    certFile = "/var/lib/acme/visio.example.org/fullchain.pem";   # lisible par `user`
    keyFile = "/var/lib/acme/visio.example.org/key.pem";
  };
};
```

Le pare-feu suit (`udpPort`, les ports TURN). TURN demande `turn.udpPort` (3478) et, avec un
certificat, `turn.tlsPort` joignables depuis Internet ; sans `certFile`/`keyFile`, seul TURN sur UDP
est activé, ce qui aide peu contre les réseaux qui filtrent l'UDP.

## Envoi des liens par courriel

Avec `landing.mail` renseigné, la page propose d'envoyer par courriel les liens du salon à la
personne qui l'a créé : deux courriels distincts, l'un avec le lien d'invitation (transférable
tel quel), l'autre avec le lien de modérateur (et un avertissement de ne pas le transférer),
dans la langue choisie sur la page. Ils reprennent l'apparence de la page d'accueil (feuille
blanche, bandeau d'accent, `themeColor`, logo). Le panneau `/admin` donne les deux liens de
chaque salon, ouvert ou terminé, avec des boutons de copie.

```nix
services.palabre.landing.mail = {
  host = "smtp.example.org";
  security = "starttls";               # "tls" (465), "starttls" (587, défaut) ou "none"
  from = "visio@example.org";
  user = "visio";
  passwordFile = config.sops.secrets.palabre-smtp-password.path;
};
```

Chaque réglage (`host`, `port`, `security`, `user`, `from`) peut aussi être donné sous la forme du
chemin d'un fichier qui le contient (`hostFile`, `portFile`, `securityFile`, `userFile`,
`fromFile`), pour des identifiants déjà gérés par un gestionnaire de secrets. `securityFile`
comprend aussi `ssl`, `force_tls` et `off`.

Le formulaire n'envoie les liens d'un salon qu'à qui détient sa clé de modérateur, et au plus 3
fois par jour vers la même adresse.

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

Avec `pwa.enable = true` (désactivé par défaut ; l'évaluation échoue si `logo` manque) la page est
une application installable. Son nom (`brandName`, `pwa.shortName`), ses couleurs (`themeColor`,
`pwa.backgroundColor`) et son icône viennent des options du module. Les icônes (192 et 512 px, plus
une adaptative) sont produites à partir de `logo` par le serveur à la première requête, puis servies
depuis la mémoire. Chrome et les navigateurs Chromium affichent un bandeau d'installation ; pas Firefox.

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

### Essayer rapidement

`devenv up` lance toute la pile sur votre machine, sans infrastructure à installer (Docker est
nécessaire pour PlugNMeet ; le premier démarrage télécharge son image et son client web) :

- <http://localhost:8080> : l'adresse publique, comme le vhost d'un vrai déploiement : la page
  d'accueil, les réunions, et <http://localhost:8080/admin> (jeton `admin-token`) ;
- <http://localhost:8025> : la boîte aux lettres, avec les courriels envoyés par la page d'accueil.

Redis, MariaDB, NATS et LiveKit tournent nativement ; PlugNMeet tourne dans Docker, avec l'image
épinglée dans `pin-oci.lock` ; Caddy route par chemin comme `caddyHandles`, sans TLS (`localhost`
est un contexte sécurisé : caméra et micro fonctionnent). La page d'accueil est la vraie, reconstruite
à chaque modification (rechargez le navigateur). La configuration de la pile est écrite par
`dev/setup.sh`.

`landing-mock` (dans `devenv shell`) lance la page d'accueil seule avec un faux PlugNMeet, si vous
n'avez pas Docker.

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
