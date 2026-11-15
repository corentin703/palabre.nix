{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.palabre;
  lcfg = cfg.landing;
  ociUser = cfg.user;

  palabre-landing = lcfg.package;

  imageName = "palabre-landing";
  imageTag = "latest";

  palabre-landing-image = pkgs.dockerTools.streamLayeredImage {
    name = imageName;
    tag = imageTag;
    contents = [
      palabre-landing
      pkgs.cacert
    ];
    config = {
      Cmd = [ "${palabre-landing}/bin/palabre-landing" ];
      # Sans ça, axios (utilisé par plugnmeet-sdk-js pour appeler l'API
      # PlugNMeet en HTTPS) échoue avec "unable to get local issuer
      # certificate" -- une image dockerTools minimale n'a pas de magasin de
      # certs CA au chemin où Node.js/OpenSSL les cherche par défaut (vu en
      # prod).
      Env = [
        "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
        "NODE_EXTRA_CA_CERTS=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
      ];
    };
  };

  # Personnalisation : fichiers du store montés en lecture seule dans le
  # conteneur (l'image ne contient que l'application).
  cssFile = pkgs.writeText "palabre-landing.css" lcfg.css;
  hasCss = lib.trim lcfg.css != "";
  logoExt = lib.last (lib.splitString "." (baseNameOf (toString lcfg.logo)));
  logoTarget = "/etc/palabre/logo.${logoExt}";
in
{
  config = lib.mkIf cfg.enable {
    services.palabre.rendered.landing = {
      unit = "podman-palabre-landing";
      secrets = {
        PLUGNMEET_API_KEY = cfg.secrets.plugnmeetApiKeyFile;
        PLUGNMEET_API_SECRET = cfg.secrets.plugnmeetApiSecretFile;
        ADMIN_TOKEN = cfg.secrets.adminTokenFile;
      };
      content = ''
        PORT=${toString cfg.ports.landing}
        BIND_HOST=127.0.0.1
        PLUGNMEET_HOST=https://${cfg.host}
        PLUGNMEET_API_URL=http://127.0.0.1:${toString cfg.ports.plugnmeet}
        PLUGNMEET_API_KEY=@PLUGNMEET_API_KEY@
        PLUGNMEET_SECRET=@PLUGNMEET_API_SECRET@
        ADMIN_TOKEN=@ADMIN_TOKEN@
        LANDING_THEME_COLOR=${lcfg.themeColor}
        LANDING_DEFAULT_LOCALE=${lcfg.defaultLocale}
      '';
    };

    virtualisation.oci-containers.containers.palabre-landing = {
      image = "${imageName}:${imageTag}";
      imageStream = palabre-landing-image;
      podman.user = ociUser;
      environment = {
        # Valeur hors du fichier d'environnement : pas secrète, et peut contenir des
        # caractères que ce format n'aime pas.
        LANDING_BRAND_NAME = lcfg.brandName;
      }
      // lib.optionalAttrs hasCss { LANDING_CSS_FILE = "/etc/palabre/custom.css"; }
      // lib.optionalAttrs (lcfg.logo != null) { LANDING_LOGO_FILE = logoTarget; };
      environmentFiles = [
        cfg.rendered.landing.path
      ];
      volumes =
        lib.optional hasCss "${cssFile}:/etc/palabre/custom.css:ro"
        ++ lib.optional (lcfg.logo != null) "${lcfg.logo}:${logoTarget}:ro";
      # Réseau hôte : le conteneur rootless (pasta) ne joint pas l'IP publique
      # de l'hôte (ECONNREFUSED), et doit atteindre PlugNMeet en local.
      extraOptions = [ "--network=host" ];
      autoStart = true;
    };
  };
}
