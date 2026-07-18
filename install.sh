#!/usr/bin/env bash
# irlkit installer — turns a fresh Ubuntu/Debian VPS into an IRL streaming rig.
#
#   curl -fsSL https://raw.githubusercontent.com/tanebufton/irlkit/main/install.sh | bash
#
# Idempotent: safe to re-run. Installs Docker, generates .env with strong random
# secrets (preserving any existing ones), and brings the stack up.
set -euo pipefail

REPO_URL="${IRLKIT_REPO:-https://github.com/tanebufton/irlkit.git}"
INSTALL_DIR="${IRLKIT_DIR:-/opt/irlkit}"

log()  { printf '\033[1;36m[irlkit]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[irlkit]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[irlkit]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Please run as root (or via sudo)."

# ── 1. Docker ────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker…"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 plugin missing."

# ── 2. Source ────────────────────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  log "Updating existing checkout in $INSTALL_DIR…"
  git -C "$INSTALL_DIR" pull --ff-only
elif [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
  log "Using existing files in $INSTALL_DIR (no git)."
else
  command -v git >/dev/null 2>&1 || { log "Installing git…"; apt-get update -qq && apt-get install -y -qq git; }
  # Fail fast with a clear message rather than cloning into a half-provisioned
  # box: a wrong/placeholder REPO_URL otherwise surfaces minutes later as a
  # cryptic "could not read Username" buried in cloud-init's own log.
  log "Checking repo URL is reachable: $REPO_URL"
  git ls-remote "$REPO_URL" >/dev/null 2>&1 || die "Can't reach '$REPO_URL' as a git remote (wrong URL, or a private repo needing auth this non-interactive script can't provide). Set IRLKIT_REPO to your fork's URL, e.g.: IRLKIT_REPO=https://github.com/<you>/irlkit.git bash install.sh"
  log "Cloning irlkit into $INSTALL_DIR…"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ── 3. .env (generate once, preserve on re-run) ──────────────────────────────
gen() { openssl rand -hex "$1"; }
if [ ! -f .env ]; then
  log "Generating .env…"
  cp .env.example .env

  # Prompt for the essentials; everything else keeps its default.
  read -rp "Public domain (DNS A record → this box) [skip for IP-only test]: " DOMAIN || true
  read -rp "Let's Encrypt email: " EMAIL || true
  read -rp "Owner username [owner]: " OWNER; OWNER="${OWNER:-owner}"
  read -rsp "Owner password: " OWNERPW; echo
  [ -n "${OWNERPW:-}" ] || OWNERPW="$(gen 8)"

  set_env() { local k="$1" v="$2"; sed -i "s|^${k}=.*|${k}=${v//|/\\|}|" .env; }
  set_env IRLKIT_DOMAIN   "${DOMAIN:-$(curl -s ifconfig.me || echo localhost)}"
  set_env ACME_EMAIL      "${EMAIL:-me@example.com}"
  set_env OWNER_USERNAME  "$OWNER"
  set_env OWNER_PASSWORD  "$OWNERPW"
  set_env SESSION_SECRET  "$(gen 32)"
  set_env STREAM_KEY      "$(gen 12)"
  set_env OBS_WS_PASSWORD "$(gen 16)"

  log "Owner password: $OWNERPW  (save this now)"
else
  log ".env already present — leaving it untouched."
fi

# ── 4. Render config templates that need secrets from .env ───────────────────
# shellcheck disable=SC1091
set -a; . ./.env; set +a
log "Rendering NOALBS config…"
envsubst < services/noalbs/config.template.json > services/noalbs/config.json

# ── 5. Firewall hint (informational; we don't touch the user's rules) ────────
cat <<EOF

  Open these ports on your provider firewall / ufw:
    tcp  80,443                 web UI + TLS
    tcp  ${RTMP_PORT:-1935}     RTMP ingest
    udp  ${SRT_PORT:-4001}      SRT ingest
    udp  ${SRTLA_PORT:-5000}    SRTLA bonded ingest
    udp  8189                   WebRTC preview

EOF

# ── 6. Build + launch ────────────────────────────────────────────────────────
log "Building images (first run compiles SRT/SLS/srtla — a few minutes)…"
docker compose build
log "Starting stack…"
docker compose up -d

log "Done. Studio + control panel: https://${IRLKIT_DOMAIN}"
log "Stream to:  SRTLA udp/${SRTLA_PORT:-5000} · SRT udp/${SRT_PORT:-4001} · RTMP tcp/${RTMP_PORT:-1935}"
log "Stream key / streamid suffix: ${STREAM_KEY}"
