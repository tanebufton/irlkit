#!/usr/bin/env bash
# Reset the irlkit owner login when you've lost it. Run this ON the box, from
# the irlkit checkout (or set IRLKIT_DIR). Only recreates the containers that
# actually need the new credential — ingest/OBS keep running untouched, so a
# live stream isn't interrupted unless you pass --obs.
#
#   ./reset-password.sh                     # new random owner password, same username
#   ./reset-password.sh --password 'x'      # set a specific owner password
#   ./reset-password.sh --username mod2     # also change the owner username
#   ./reset-password.sh --obs               # also rotate the OBS-websocket password
#                                            #   (internal-only credential; restarts OBS,
#                                            #   which WILL interrupt a live stream)
#   ./reset-password.sh --revoke-sessions   # also rotate SESSION_SECRET — logs out every
#                                            #   owner session AND revokes every operator
#                                            #   share link (use if you suspect compromise)
set -euo pipefail

log()  { printf '\033[1;36m[irlkit]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[irlkit]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[irlkit]\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }

NEW_USERNAME=""
NEW_PASSWORD=""
ROTATE_OBS=0
REVOKE_SESSIONS=0
ASSUME_YES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --username) NEW_USERNAME="${2:?--username needs a value}"; shift 2 ;;
    --password) NEW_PASSWORD="${2:?--password needs a value}"; shift 2 ;;
    --obs) ROTATE_OBS=1; shift ;;
    --revoke-sessions) REVOKE_SESSIONS=1; shift ;;
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
# Portable across GNU sed (the box, Ubuntu) and BSD sed (macOS, if run locally)
# — `sed -i` takes a mandatory backup-suffix arg on BSD but not GNU, so avoid
# -i entirely rather than special-case both.
set_env() {
  local k="$1" v="$2" esc tmp
  esc="${v//\\/\\\\}"; esc="${esc//|/\\|}"
  tmp="$(mktemp)"
  sed "s|^${k}=.*|${k}=${esc}|" .env > "$tmp" && mv "$tmp" .env
}
get_env() { grep "^$1=" .env | head -1 | cut -d= -f2-; }

[ -n "$NEW_PASSWORD" ] || NEW_PASSWORD="$(gen 8)"

if [ "$ROTATE_OBS" = "1" ] && [ "$ASSUME_YES" != "1" ]; then
  warn "--obs restarts the OBS container, which WILL interrupt an active stream."
  read -rp "Continue? [y/N] " confirm || true
  case "${confirm:-}" in y|Y|yes|YES) ;; *) die "Aborted." ;; esac
fi

# ── Apply changes to .env ────────────────────────────────────────────────────
RESTART_SERVICES=(api)

set_env OWNER_PASSWORD "$NEW_PASSWORD"
if [ -n "$NEW_USERNAME" ]; then
  set_env OWNER_USERNAME "$NEW_USERNAME"
fi

if [ "$ROTATE_OBS" = "1" ]; then
  NEW_OBS_PASSWORD="$(gen 16)"
  set_env OBS_WS_PASSWORD "$NEW_OBS_PASSWORD"
  RESTART_SERVICES+=(obs noalbs)
fi

if [ "$REVOKE_SESSIONS" = "1" ]; then
  set_env SESSION_SECRET "$(gen 32)"
fi

# `restart` re-uses the container's already-baked-in env and would NOT pick up
# the new .env values — `up -d` re-reads .env and recreates only what changed.
log "Applying: ${RESTART_SERVICES[*]}"
docker compose up -d "${RESTART_SERVICES[@]}"

echo
log "Owner login: $(get_env OWNER_USERNAME) / ${NEW_PASSWORD}"
[ "$ROTATE_OBS" = "1" ] && log "OBS-websocket password rotated (internal-only credential; nothing public was ever exposed to it)."
[ "$REVOKE_SESSIONS" = "1" ] && warn "SESSION_SECRET rotated: every owner session AND every operator share link is now invalid — re-issue links to your moderators from the studio."
