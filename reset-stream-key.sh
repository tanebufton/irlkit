#!/usr/bin/env bash
# Rotate the irlkit stream key if it's leaked (shared by accident, or you
# suspect someone unauthorized has it). Run this ON the box, from the irlkit
# checkout (or set IRLKIT_DIR).
#
#   ./reset-stream-key.sh           # new random stream key
#   ./reset-stream-key.sh --key xyz # set a specific key
#   ./reset-stream-key.sh -y        # skip the confirmation prompt
#
# WARNING: this breaks your current publish connection — your phone/encoder
# must be reconfigured with the new key/streamid to reconnect, regardless of
# protocol (SRT/SRTLA route by streamid string match; RTMP actually enforces
# the key as MediaMTX's publish password). It restarts mediamtx, api, and obs
# (interrupting any active stream), and re-renders + restarts noalbs.
set -euo pipefail

log()  { printf '\033[1;36m[irlkit]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[irlkit]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[irlkit]\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }

NEW_KEY=""
ASSUME_YES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --key) NEW_KEY="${2:?--key needs a value}"; shift 2 ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1 (see --help)" ;;
  esac
done

# ── Locate the checkout ──────────────────────────────────────────────────────
if [ -f "./docker-compose.yml" ] && [ -f "./.env" ]; then
  INSTALL_DIR="$(pwd)"
else
  INSTALL_DIR="${IRLKIT_DIR:-/opt/irlkit}"
fi
[ -f "$INSTALL_DIR/.env" ] || die "No .env found at $INSTALL_DIR. Run this from your irlkit checkout, or set IRLKIT_DIR=/path/to/irlkit."
cd "$INSTALL_DIR"

gen() { openssl rand -hex "$1"; }
# Portable across GNU sed (the box) and BSD sed (macOS, if run locally).
set_env() {
  local k="$1" v="$2" esc tmp
  esc="${v//\\/\\\\}"; esc="${esc//|/\\|}"
  tmp="$(mktemp)"
  sed "s|^${k}=.*|${k}=${esc}|" .env > "$tmp" && mv "$tmp" .env
}

[ -n "$NEW_KEY" ] || NEW_KEY="$(gen 12)"

if [ "$ASSUME_YES" != "1" ]; then
  warn "This breaks your current publish connection — your phone/encoder must be"
  warn "reconfigured with the new key to reconnect. It also restarts obs, which"
  warn "WILL interrupt an active stream."
  read -rp "Continue? [y/N] " confirm || true
  case "${confirm:-}" in y|Y|yes|YES) ;; *) die "Aborted." ;; esac
fi

set_env STREAM_KEY "$NEW_KEY"

# `up -d` (not `restart`) re-reads .env and recreates only what changed.
log "Recreating mediamtx, api, obs with the new key…"
docker compose up -d mediamtx api obs

log "Re-rendering NOALBS config…"
set -a; . ./.env; set +a
envsubst < services/noalbs/config.template.json > services/noalbs/config.json
docker compose up -d noalbs

# The "IRL Feed" media source was bootstrapped once with the OLD key baked
# into its URL — the API only creates it when it doesn't already exist, so a
# plain container recreate won't touch an already-existing input. Patch it
# directly instead, waiting for obs-websocket to come back up after the
# recreate above (fresh OBS boot takes a few seconds).
log "Waiting for obs-websocket…"
READY=0
for i in $(seq 1 60); do
  if docker compose exec -T api node --input-type=module -e "
    import OBSWebSocket from 'obs-websocket-js';
    const obs = new OBSWebSocket();
    await obs.connect(process.env.OBS_WS_URL, process.env.OBS_WS_PASSWORD);
    process.exit(0);
  " >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
[ "$READY" = "1" ] || die "obs-websocket didn't come back up after 60s — check: docker compose logs obs"

docker compose exec -T api node --input-type=module -e "
import OBSWebSocket from 'obs-websocket-js';
const obs = new OBSWebSocket();
await obs.connect(process.env.OBS_WS_URL, process.env.OBS_WS_PASSWORD);
await obs.call('SetInputSettings', {
  inputName: 'IRL Feed',
  inputSettings: { input: 'srt://sls:4000?streamid=play/live/${NEW_KEY}&latency=2000' },
  overlay: true
});
console.log('IRL Feed media source updated');
process.exit(0);
"

echo
log "New stream key: $NEW_KEY"
log "Update your phone/encoder's streamid/key to this value to reconnect:"
log "  SRTLA: udp://<host>:5000"
log "  SRT:   srt://<host>:4001?streamid=publish/live/${NEW_KEY}&latency=2000"
log "  RTMP:  rtmp://<host>:1935/ingest?user=publish&pass=${NEW_KEY}"
