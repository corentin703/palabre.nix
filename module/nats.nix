{ config, lib, ... }:
let
  cfg = config.services.palabre;
in
{
  # Native NATS (like Redis, see redis.nix), not a container: required by
  # PlugNMeet for its real-time event bus (chat, whiteboard, presence...)
  # and the "auth callout" that dynamically authorizes each client to
  # connect over WebSocket with a scope limited to its meeting.
  #
  # The 3 nkey/xkey pairs are generated once with
  # `nsc generate nkey --user|--account|--curve`, following the official
  # installer's procedure exactly (mynaparrot/plugNmeet-install). Only the
  # PUBLIC keys go through the `nats.*` options; the matching seeds are in
  # the files given to `secrets.natsUserSeedFile` /
  # `secrets.natsCalloutIssuerSeedFile` / `secrets.natsCalloutXkeySeedFile`,
  # and let the PlugNMeet server prove it may act as that identity.
  #
  # Mind the nkey prefixes (enforced by nats-server -t, which validates this
  # file at build time): `users[].nkey` / `auth_callout.auth_users` want a
  # "user" key (prefix U), `auth_callout.issuer` wants an "account" key
  # (prefix A) -- it is NOT the same nkey as the "PNM" account itself (which
  # has no key of its own in this non-operator-mode config).
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
