{ config, lib, ... }:
let
  cfg = config.services.palabre;
  ociUser = cfg.user;
  appDir = cfg.stateDir;

  serverVersion = cfg.versions.plugnmeet;
in
{
  config = lib.mkIf cfg.enable {
    sops.secrets.palabre-plugnmeet-api-key = {
      sopsFile = cfg.secrets.plugnmeetFile;
      key = "plugnmeet_api_key";
    };
    sops.secrets.palabre-plugnmeet-secret = {
      sopsFile = cfg.secrets.plugnmeetFile;
      key = "plugnmeet_secret";
    };
    sops.secrets.palabre-nats-user-nkey-seed = {
      sopsFile = cfg.secrets.plugnmeetFile;
      key = "nats_user_nkey_seed";
    };
    sops.secrets.palabre-nats-callout-issuer-seed = {
      sopsFile = cfg.secrets.plugnmeetFile;
      key = "nats_callout_issuer_seed";
    };
    sops.secrets.palabre-nats-callout-xkey-seed = {
      sopsFile = cfg.secrets.plugnmeetFile;
      key = "nats_callout_xkey_seed";
    };

    systemd.tmpfiles.rules = [
      "d ${appDir} 0750 ${ociUser} ${ociUser} -"
    ];

    sops.templates.palabre-plugnmeet-config = {
      content = ''
        client:
          port: ${toString cfg.ports.plugnmeet}
          path: "./client/dist"
          api_key: ${config.sops.placeholder.palabre-plugnmeet-api-key}
          secret: ${config.sops.placeholder.palabre-plugnmeet-secret}
          token_validity: 10m
          webhook_conf:
            enable: true
            url: ""
            enable_for_per_meeting: true
          proxy_conf:
            enabled: true
            proxy_header: "X-Forwarded-For"
            trusted_proxy_ips: [ "127.0.0.1/32" ]
          copyright_conf:
            allow_override: false
          bbb_join_host: "https://${cfg.host}"
          auto_client_download:
            # L'image officielle mynaparrot/plugnmeet-server n'embarque pas le
            # client web (aucun repo ne publie de client déjà construit) : le
            # serveur télécharge lui-même le build officiel de plugNmeet-client
            # à son premier démarrage, dans ${appDir}/client (persistant via le
            # montage /app).
            #
            # from_release doit être un tag de release EXPLICITE : laisser vide
            # ("latest") fait construire l'URL
            # .../releases/download/latest/client.zip, qui n'existe pas (ce
            # n'est pas le raccourci GitHub .../releases/latest/download/...) et
            # fait planter le serveur au démarrage (404, testé en prod). On
            # épingle sur la même version que le serveur.
            enabled: true
            server_url: "https://${cfg.host}"
            from_release: "${serverVersion}"

        room_default_settings:
          max_duration: 0
          max_participants: 0
          max_num_breakout_rooms: 6
          max_preloaded_wb_file_size: 5mb

        log_settings:
          log_file: "./log/plugNmeet.log"
          maxsize: 20
          maxbackups: 4
          maxage: 2
          log_level: "warn"

        livekit_info:
          host: "https://${cfg.host}/livekit"
          api_key: ${config.sops.placeholder.palabre-livekit-api-key}
          secret: ${config.sops.placeholder.palabre-livekit-api-secret}

        redis_info:
          host: 127.0.0.1:${toString cfg.ports.redis}
          db: 0

        database_info:
          driver_name: mysql
          host: ${cfg.database.host}
          port: ${toString cfg.database.port}
          username: ${config.sops.placeholder.${cfg.database.userSecret}}
          password: ${config.sops.placeholder.${cfg.database.passwordSecret}}
          db: ${config.sops.placeholder.${cfg.database.nameSecret}}
          prefix: pnm_
          charset: "utf8mb4"
          loc: "UTC"
          conn_max_lifetime: 4m
          max_open_conns: 10

        nats_info:
          nats_urls:
            - "nats://127.0.0.1:${toString cfg.ports.nats}"
          nats_ws_urls:
            - "https://${cfg.host}/ws"
          account: PNM
          nkey: ${config.sops.placeholder.palabre-nats-user-nkey-seed}
          auth_callout_issuer_private: ${config.sops.placeholder.palabre-nats-callout-issuer-seed}
          auth_callout_xkey_private: ${config.sops.placeholder.palabre-nats-callout-xkey-seed}
          num_replicas: 1
          room_stream_name: "pnm-room-stream"
          subjects:
            system_api_worker: "sysApiWorker"
            system_js_worker: "sysJsWorker"
            system_core_worker: "sysCoreWorker"
            system_public: "sysPublic"
            system_private: "sysPrivate"
            chat: "chat"
            whiteboard: "whiteboard"
            data_channel: "dataChannel"
          recorder:
            recorder_channel: "recorderChannel"
            recorder_info_kv: "pnm-recorderInfo"
            transcoding_jobs_subject: "pnm-RecorderTranscoderJobs"

        upload_file_settings:
          path: "./upload"
          max_size: 50
          max_size_whiteboard_file: 30
          keep_forever: false
          allowed_types: ["jpg","png","jpeg","svg","pdf","docx","txt","xlsx","pptx","zip","mp4","webm","mp3"]

        # Pas de recorder serveur : les enregistrements se font dans le
        # navigateur (voir landing/server.js, isAllowLocal). Le serveur exige
        # tout de même cette section ; le chemin reste dans son volume /app.
        recorder_info:
          recording_files_path: "./recording_files"
          token_validity: 30m
          ping_timeout: 8s

        analytics_settings:
          enabled: true

        artifacts_settings:
          storage_path: "./artifacts"
          token_validity: 10m
          enable_del_artifacts_backup: true
          del_artifacts_backup_duration: 72h
      '';
      owner = ociUser;
      mode = "0400";

      restartUnits = [ "podman-palabre-plugnmeet-server.service" ];
    };

    virtualisation.pin-oci.projects.palabre.enable = true;

    virtualisation.pin-oci.projects.palabre.services.plugnmeet-server = {
      dependsOn = [ "livekit-server" ];
      image = "docker.io/mynaparrot/plugnmeet-server:${serverVersion}";
      podman.user = ociUser;
      volumes = [
        "${appDir}:/app:rw"
        "${config.sops.templates.palabre-plugnmeet-config.path}:/app/config.yaml:ro"
      ];
      extraOptions = [
        # Réseau hôte : joint LiveKit, Redis, MariaDB et NATS (tous en
        # host networking ou natifs sur l'hôte) sans indirection
        # host.docker.internal, comme le déploiement officiel.
        "--network=host"
      ];
      autoStart = true;
    };

    systemd.services.podman-palabre-plugnmeet-server = {
      after = [
        "redis-palabre.service"
        "nats.service"
        cfg.database.unit
      ];
      requires = [
        "redis-palabre.service"
        "nats.service"
        cfg.database.unit
      ];
    };
  };
}
