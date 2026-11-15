{
  lib,
  buildNpmPackage,
  nodejs,
  makeWrapper,
  imagemagick,
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

  # plugnmeet-sdk-js / plugnmeet-protocol-js have a `preinstall` script that refuses
  # any package manager other than pnpm (`npx only-allow pnpm`); it does nothing
  # useful for us (no native build), so we skip it rather than add pnpm to the
  # pipeline for this single package.
  npmFlags = [ "--ignore-scripts" ];

  # `npm run build`: the server (tsc -> dist/server) and the interface (vite -> dist/web).
  inherit nodejs;

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm test
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall

    # Only the runtime dependencies (the PlugNMeet SDK) stay in the image.
    npm prune --omit=dev --no-save --ignore-scripts

    mkdir -p $out/{bin,share/palabre-landing}
    cp -r node_modules dist package.json $out/share/palabre-landing/

    makeWrapper ${lib.getExe nodejs} $out/bin/palabre-landing \
      --set-default PORT 3000 \
      --prefix PATH : ${lib.makeBinPath [ imagemagick ]} \
      --add-flags "$out/share/palabre-landing/dist/server/main.js"

    runHook postInstall
  '';

  nativeBuildInputs = [ makeWrapper ];

  meta = {
    description = "Public landing page (anonymous room creation/joining) for PlugNMeet (Palabre)";
    license = lib.licenses.mit;
    mainProgram = "palabre-landing";
    platforms = lib.platforms.linux;
  };
}
