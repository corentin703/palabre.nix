#!/usr/bin/env bash
# Writes the configuration of the whole stack (NATS, LiveKit, PlugNMeet, Caddy) in $PNM_STATE.
# The ports come from devenv.nix (environment variables). Keys are generated once and kept.
set -euo pipefail

state=$PNM_STATE
mkdir -p "$state"/{keys,nats,plugnmeet}
cd "$state"

# --- Keys: the 3 nkey/xkey pairs of NATS (as in nats.nix), generated once ----------------------
gen() { # gen <name> <nsc flag>
  if [ ! -s "keys/$1.seed" ]; then
    nsc generate nkey "$2" > "keys/$1.tmp"
    # nsc prints the seed, then the public key (then an empty line).
    sed -n 1p "keys/$1.tmp" | tr -d '\n' > "keys/$1.seed"
    sed -n 2p "keys/$1.tmp" | tr -d '\n' > "keys/$1.pub"
    rm "keys/$1.tmp"
  fi
}
gen user --user
gen issuer --account
gen xkey --curve
user_pub=$(<keys/user.pub); user_seed=$(<keys/user.seed)
issuer_pub=$(<keys/issuer.pub); issuer_seed=$(<keys/issuer.seed)
xkey_pub=$(<keys/xkey.pub); xkey_seed=$(<keys/xkey.seed)

public="http://localhost:$PNM_PUBLIC_PORT"

# --- NATS (nats.nix) ---------------------------------------------------------------------------
cat > nats.conf <<CONF
port: $PNM_NATS_PORT
http_port: -1
jetstream: { store_dir: "$state/nats" }
websocket: { port: $PNM_NATS_WS_PORT, no_tls: true }
accounts: {
  SYS: { exports: [ { stream: "\$SYS.ACCOUNT.PNM.>", accounts: ["PNM"] } ] }
  PNM: {
    jetstream: true
    imports: [ { stream: { account: "SYS", subject: "\$SYS.ACCOUNT.PNM.>" } } ]
    users: [ { nkey: "$user_pub" } ]
  }
}
system_account: SYS
authorization: {
  timeout: 5
  auth_callout: { issuer: "$issuer_pub", auth_users: ["$user_pub"], account: "PNM", xkey: "$xkey_pub" }
}
CONF

# --- LiveKit (livekit.nix) ---------------------------------------------------------------------
cat > livekit.yaml <<CONF
port: $PNM_LIVEKIT_PORT
keys:
  $PNM_LIVEKIT_KEY: $PNM_LIVEKIT_SECRET
redis:
  address: 127.0.0.1:$PNM_REDIS_PORT
logging:
  level: info
rtc:
  port_range_start: $PNM_RTC_FROM
  port_range_end: $PNM_RTC_TO
  tcp_port: $PNM_RTC_TCP
  use_external_ip: false
webhook:
  api_key: $PNM_LIVEKIT_KEY
  urls:
    - http://127.0.0.1:$PNM_PLUGNMEET_PORT/webhook
CONF

# --- PlugNMeet (plugnmeet.nix), with http://localhost instead of the public https host ----------
cat > plugnmeet.yaml <<CONF
client:
  # debug: without it the server hides why it fails to start (fx.NopLogger).
  debug: true
  port: $PNM_PLUGNMEET_PORT
  path: "./client/dist"
  api_key: $PNM_API_KEY
  secret: $PNM_API_SECRET
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
  bbb_join_host: "$public"
  auto_client_download:
    enabled: true
    server_url: "$public"
    from_release: "$PNM_VERSION"

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
  log_level: "info"

livekit_info:
  host: "$public/livekit"
  api_key: $PNM_LIVEKIT_KEY
  secret: $PNM_LIVEKIT_SECRET

redis_info:
  host: 127.0.0.1:$PNM_REDIS_PORT
  db: 0

database_info:
  driver_name: mysql
  host: 127.0.0.1
  port: $PNM_MYSQL_PORT
  username: plugnmeet
  password: plugnmeet
  db: plugnmeet
  prefix: pnm_
  charset: "utf8mb4"
  loc: "UTC"
  conn_max_lifetime: 4m
  max_open_conns: 10

nats_info:
  nats_urls:
    - "nats://127.0.0.1:$PNM_NATS_PORT"
  nats_ws_urls:
    - "$public/ws"
  account: PNM
  nkey: $user_seed
  auth_callout_issuer_private: $issuer_seed
  auth_callout_xkey_private: $xkey_seed
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
CONF

# --- Caddy: the path routing of caddy.nix, without TLS ------------------------------------------
cat > Caddyfile <<CONF
{
	auto_https off
	admin off
}
:$PNM_PUBLIC_PORT {
	@livekit path /livekit /livekit/*
	handle @livekit {
		uri strip_prefix /livekit
		reverse_proxy 127.0.0.1:$PNM_LIVEKIT_PORT
	}
	@natsWs path /ws /ws/*
	handle @natsWs {
		uri strip_prefix /ws
		reverse_proxy 127.0.0.1:$PNM_NATS_WS_PORT
	}
	@landing path /join /join/* /r/* /admin /admin/* /visio-assets/* /visio-api/*
	handle @landing {
		reverse_proxy 127.0.0.1:$PNM_LANDING_PORT
	}
	@landingRoot {
		path /
		not query access_token=*
	}
	handle @landingRoot {
		reverse_proxy 127.0.0.1:$PNM_LANDING_PORT
	}
	# Everything else is PlugNMeet (the vhost's default in the real deployment).
	handle {
		reverse_proxy 127.0.0.1:$PNM_PLUGNMEET_PORT
	}
}
CONF

echo "stack configuration written in $state"
