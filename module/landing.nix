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
      # Without this, axios (used by plugnmeet-sdk-js to call the PlugNMeet
      # API over HTTPS) fails with "unable to get local issuer certificate":
      # a minimal dockerTools image has no CA store where Node.js/OpenSSL
      # look for it by default (seen in production).
      Env = [
        "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
        "NODE_EXTRA_CA_CERTS=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
      ];
    };
  };

  # Customization: store files mounted read-only in the container (the
  # image only holds the application).
  cssFile = pkgs.writeText "palabre-landing.css" lcfg.css;
  hasCss = lib.trim lcfg.css != "";
  logoExt = lib.last (lib.splitString "." (baseNameOf (toString lcfg.logo)));
  logoTarget = "/etc/palabre/logo.${logoExt}";

in
{
  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = !lcfg.pwa.enable || lcfg.logo != null;
        message = "services.palabre.landing.pwa.enable requires services.palabre.landing.logo: the installed app's icons are made from it.";
      }
      {
        assertion = lcfg.mail.host == null || lcfg.mail.from != null;
        message = "services.palabre.landing.mail.from is required with services.palabre.landing.mail.host.";
      }
      {
        assertion = (lcfg.mail.user == null) == (lcfg.mail.passwordFile == null);
        message = "services.palabre.landing.mail.user and services.palabre.landing.mail.passwordFile go together.";
      }
    ];

    services.palabre.rendered.landing = {
      unit = "podman-palabre-landing";
      secrets = {
        PLUGNMEET_API_KEY = cfg.secrets.plugnmeetApiKeyFile;
        PLUGNMEET_API_SECRET = cfg.secrets.plugnmeetApiSecretFile;
        ADMIN_TOKEN = cfg.secrets.adminTokenFile;
      }
      // lib.optionalAttrs (lcfg.mail.passwordFile != null) { MAIL_PASSWORD = lcfg.mail.passwordFile; };
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
      ''
      + lib.optionalString (lcfg.mail.passwordFile != null) ''
        MAIL_PASSWORD=@MAIL_PASSWORD@
      '';
    };

    virtualisation.oci-containers.containers.palabre-landing = {
      image = "${imageName}:${imageTag}";
      imageStream = palabre-landing-image;
      podman.user = ociUser;
      environment = {
        # Value kept out of the environment file: it is not secret, and may
        # contain characters this format does not like.
        LANDING_BRAND_NAME = lcfg.brandName;
      }
      // lib.optionalAttrs lcfg.pwa.enable (
        {
          LANDING_PWA = "1";
          LANDING_BACKGROUND_COLOR = lcfg.pwa.backgroundColor;
        }
        // lib.optionalAttrs (lcfg.pwa.shortName != null) { LANDING_SHORT_NAME = lcfg.pwa.shortName; }
      )
      // lib.optionalAttrs (lcfg.mail.host != null) (
        {
          MAIL_HOST = lcfg.mail.host;
          MAIL_SECURITY = lcfg.mail.security;
          MAIL_FROM = lcfg.mail.from;
        }
        // lib.optionalAttrs (lcfg.mail.port != null) { MAIL_PORT = toString lcfg.mail.port; }
        // lib.optionalAttrs (lcfg.mail.user != null) { MAIL_USER = lcfg.mail.user; }
      )
      // lib.optionalAttrs hasCss { LANDING_CSS_FILE = "/etc/palabre/custom.css"; }
      // lib.optionalAttrs (lcfg.logo != null) { LANDING_LOGO_FILE = logoTarget; };
      environmentFiles = [
        cfg.rendered.landing.path
      ];
      volumes =
        lib.optional hasCss "${cssFile}:/etc/palabre/custom.css:ro"
        ++ lib.optional (lcfg.logo != null) "${lcfg.logo}:${logoTarget}:ro";
      # Host network: the rootless container (pasta) cannot reach the host's
      # public IP (ECONNREFUSED), and has to reach PlugNMeet locally.
      extraOptions = [ "--network=host" ];
      autoStart = true;
    };
  };
}
