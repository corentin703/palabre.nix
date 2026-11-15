{
  lib,
  buildNpmPackage,
  nodejs,
  makeWrapper,
}:
buildNpmPackage {
  pname = "palabre-landing";
  version = "1.0.0";

  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./package.json
      ./package-lock.json
      ./tsconfig.server.json
      ./tsconfig.web.json
      ./vite.config.ts
      ./vitest.config.ts
      ./src
    ];
  };

  npmDepsHash = "sha256-G2i0X1EX22NFkmZW06u0q1yWNywOkyNZm1CjTJAOyKU=";

  # plugnmeet-sdk-js / plugnmeet-protocol-js ont un script `preinstall` qui refuse tout
  # gestionnaire autre que pnpm (`npx only-allow pnpm`) ; il ne fait rien d'utile pour nous (pas
  # de build natif) donc on l'ignore plutôt que d'ajouter pnpm au pipeline pour ce seul paquet.
  npmFlags = [ "--ignore-scripts" ];

  # `npm run build` : le serveur (tsc -> dist/server) et l'interface (vite -> dist/web).
  inherit nodejs;

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm test
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall

    # Seules les dépendances d'exécution (le SDK PlugNMeet) restent dans l'image.
    npm prune --omit=dev --no-save --ignore-scripts

    mkdir -p $out/{bin,share/palabre-landing}
    cp -r node_modules dist package.json $out/share/palabre-landing/

    makeWrapper ${lib.getExe nodejs} $out/bin/palabre-landing \
      --set-default PORT 3000 \
      --add-flags "$out/share/palabre-landing/dist/server/main.js"

    runHook postInstall
  '';

  nativeBuildInputs = [ makeWrapper ];

  meta = {
    description = "Page d'accueil publique (création/jonction de salon anonyme) pour PlugNMeet (Palabre)";
    license = lib.licenses.mit;
    mainProgram = "palabre-landing";
    platforms = lib.platforms.linux;
  };
}
