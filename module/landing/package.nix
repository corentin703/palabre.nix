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
      ./server.js
      ./admin.js
    ];
  };

  npmDepsHash = "sha256-ZzW1guCwIqYGT1dvq9GrCudGpCnzobtqfYOGSeergkk=";

  # plugnmeet-sdk-js / plugnmeet-protocol-js ont un script `preinstall` qui
  # refuse tout gestionnaire autre que pnpm (`npx only-allow pnpm`) ; il ne
  # fait rien d'utile pour nous (pas de build natif) donc on l'ignore plutôt
  # que d'ajouter pnpm au pipeline pour ce seul paquet.
  npmFlags = [ "--ignore-scripts" ];

  dontNpmBuild = true;

  inherit nodejs;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/{bin,share/palabre-landing}
    cp -r node_modules server.js admin.js package.json $out/share/palabre-landing/

    makeWrapper ${lib.getExe nodejs} $out/bin/palabre-landing \
      --set-default PORT 3000 \
      --add-flags "$out/share/palabre-landing/server.js"

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
