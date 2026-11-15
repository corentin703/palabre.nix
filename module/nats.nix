{ config, lib, ... }:
let
  cfg = config.services.palabre;
in
{
  # NATS natif (comme Redis -- voir redis.nix), pas un
  # conteneur : requis par PlugNMeet pour son bus d'événements temps réel
  # (chat, tableau blanc, présence...) et le "auth callout" qui autorise
  # dynamiquement chaque client à se connecter en WebSocket avec un scope
  # limité à sa réunion.
  #
  # Les 3 paires de clés nkey/xkey sont générées une fois avec
  # `nsc generate nkey --user|--account|--curve`, en suivant exactement la
  # procédure de l'installeur officiel (mynaparrot/plugNmeet-install). Seules
  # les clés PUBLIQUES passent par les options `nats.*` ; les graines
  # correspondantes sont dans `secrets.plugnmeetFile` (nats_user_nkey_seed /
  # nats_callout_issuer_seed / nats_callout_xkey_seed) et servent côté
  # PlugNMeet (serveur) à prouver qu'il a le droit d'agir en tant que cette
  # identité.
  #
  # Attention aux préfixes nkey (imposés par nats-server -t, qui valide ce
  # fichier au build) : `users[].nkey` / `auth_callout.auth_users` veulent une
  # clé "user" (préfixe U), `auth_callout.issuer` veut une clé "account"
  # (préfixe A) -- ce n'est PAS le même nkey que celui du compte "PNM"
  # lui-même (qui n'a pas de clé propre dans cette config non-operator-mode).
  config.services.nats = lib.mkIf cfg.enable {
    enable = true;
    jetstream = true;
    port = cfg.ports.nats;

    settings = {
      websocket = {
        port = cfg.ports.natsWebsocket;
        no_tls = true;
      };

      accounts = {
        SYS = {
          exports = [
            {
              stream = "$SYS.ACCOUNT.PNM.>";
              accounts = [ "PNM" ];
            }
          ];
        };

        PNM = {
          jetstream = true;
          imports = [
            {
              stream = {
                account = "SYS";
                subject = "$SYS.ACCOUNT.PNM.>";
              };
            }
          ];
          users = [
            { nkey = cfg.nats.userNkey; }
          ];
        };
      };

      system_account = "SYS";

      authorization = {
        timeout = 5;
        auth_callout = {
          issuer = cfg.nats.calloutIssuer;
          auth_users = [ cfg.nats.userNkey ];
          account = "PNM";
          xkey = cfg.nats.calloutXkey;
        };
      };
    };
  };
}
