#!/usr/bin/env bash
# One-command irlkit deploy to DigitalOcean — no Terraform, no HCL, just doctl.
#
#   ./deploy-do.sh
#
# Requires: doctl installed and authenticated (`doctl auth init`).
# Creates: an SSH-key-secured, firewalled droplet that self-provisions the full
# irlkit stack via cloud-init, then prints the IP and owner login.
set -euo pipefail

log()  { printf '\033[1;36m[irlkit]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[irlkit]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[irlkit]\033[0m %s\n' "$*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v doctl >/dev/null 2>&1 || die "doctl not found. Install: https://docs.digitalocean.com/reference/doctl/how-to/install/"
command -v envsubst >/dev/null 2>&1 || die "envsubst not found (part of gettext). Install it and re-run."
doctl account get >/dev/null 2>&1 || die "doctl isn't authenticated. Run: doctl auth init"

REPO_URL="${IRLKIT_REPO:-https://github.com/YOU/irlkit.git}"
NAME="${IRLKIT_NAME:-irlkit}"
# c-2 = 2 vCPU/4GB (~$42/mo, budget floor). c-4 = 4 vCPU/8GB (~$84/mo, recommended
# for reliable 1080p60). See docs/deploy.md for current pricing across providers.
SIZE="${IRLKIT_SIZE:-c-4}"
IMAGE="ubuntu-24-04-x64"

log "Sizing: $SIZE. Override with IRLKIT_SIZE (see docs/deploy.md for tiers)."

# ── Region ────────────────────────────────────────────────────────────────
# DigitalOcean retired its official per-region speedtest subdomains, but Spaces
# still resolves per-region (the only DO service that does), so we time a real
# TCP connection to each Spaces-enabled region as a stand-in for ping. That
# covers one region per continent; anything more specific (e.g. sfo3 vs sfo2)
# still needs a manual pick.
SPACES_REGIONS=(nyc3 ams3 fra1 sgp1 blr1 syd1)

list_regions() {
  doctl compute region list --format Slug,Name,Available --no-header | awk '$NF=="true"'
}

probe_closest_region() {
  log "Timing a connection to each region (via DigitalOcean Spaces)…" >&2
  local best="" best_ms=999999 r ms ms_int
  for r in "${SPACES_REGIONS[@]}"; do
    ms="$(curl -o /dev/null -s -m 3 -w '%{time_connect}' "https://${r}.digitaloceanspaces.com/" 2>/dev/null || true)"
    if [ -n "$ms" ]; then
      ms_int="$(awk -v t="$ms" 'BEGIN{printf "%d", t*1000}')"
      printf '    %-6s %sms\n' "$r" "$ms_int" >&2
      if [ "$ms_int" -lt "$best_ms" ]; then best_ms="$ms_int"; best="$r"; fi
    else
      printf '    %-6s (unreachable)\n' "$r" >&2
    fi
  done
  [ -n "$best" ] || die "Couldn't reach any region to time — check your connection or set IRLKIT_REGION yourself."
  log "Closest: $best (~${best_ms}ms round-trip to its Spaces endpoint)" >&2
  echo "$best"
}

pick_region() {
  if [ -n "${IRLKIT_REGION:-}" ]; then
    echo "$IRLKIT_REGION"
    return
  fi
  while true; do
    read -rp "Region [enter = auto-detect closest, 'list' = see all, or type a slug e.g. nyc3]: " ans || true
    case "${ans:-}" in
      "")
        probe_closest_region
        return
        ;;
      list)
        list_regions >&2
        ;;
      *)
        if list_regions | awk '{print $1}' | grep -qx "$ans"; then
          echo "$ans"
          return
        fi
        warn "'$ans' isn't a currently-available region slug. Try 'list' to see valid ones."
        ;;
    esac
  done
}

REGION="$(pick_region)"
log "Using region: $REGION"

read -rp "Domain (DNS A record -> this droplet) [blank = IP-only test, self-signed TLS]: " DOMAIN || true
read -rp "Let's Encrypt email [me@example.com]: " EMAIL || true
read -rp "Owner username [owner]: " OWNER_USERNAME || true
OWNER_USERNAME="${OWNER_USERNAME:-owner}"
read -rsp "Owner password [blank = random]: " OWNER_PASSWORD || true
echo
[ -n "${OWNER_PASSWORD:-}" ] || OWNER_PASSWORD="$(openssl rand -hex 8)"

# ── SSH key: reuse one already on the DO account, else upload a local one ────
log "Checking for an SSH key on your DO account…"
SSH_KEY_ID="$(doctl compute ssh-key list --format ID --no-header | head -1 || true)"
if [ -z "$SSH_KEY_ID" ]; then
  PUBKEY_PATH="$HOME/.ssh/id_ed25519.pub"
  [ -f "$PUBKEY_PATH" ] || PUBKEY_PATH="$HOME/.ssh/id_rsa.pub"
  [ -f "$PUBKEY_PATH" ] || die "No SSH key on your DO account and none found locally at ~/.ssh. Generate one (ssh-keygen) or add one: doctl compute ssh-key import irlkit --public-key-file <path>"
  log "No key on the account yet — uploading $PUBKEY_PATH…"
  SSH_KEY_ID="$(doctl compute ssh-key import "$NAME" --public-key-file "$PUBKEY_PATH" --format ID --no-header)"
fi

# ── Tag + firewall (idempotent: reuse if this script already ran once) ──────
doctl compute tag get "$NAME" >/dev/null 2>&1 || doctl compute tag create "$NAME" >/dev/null

if ! doctl compute firewall list --format Name --no-header | grep -qx "$NAME"; then
  log "Creating firewall…"
  doctl compute firewall create \
    --name "$NAME" \
    --tag-names "$NAME" \
    --inbound-rules "protocol:tcp,ports:22,address:0.0.0.0/0 protocol:tcp,ports:22,address:::/0 protocol:tcp,ports:80,address:0.0.0.0/0 protocol:tcp,ports:80,address:::/0 protocol:tcp,ports:443,address:0.0.0.0/0 protocol:tcp,ports:443,address:::/0 protocol:tcp,ports:1935,address:0.0.0.0/0 protocol:tcp,ports:1935,address:::/0 protocol:udp,ports:4001,address:0.0.0.0/0 protocol:udp,ports:4001,address:::/0 protocol:udp,ports:5000,address:0.0.0.0/0 protocol:udp,ports:5000,address:::/0 protocol:udp,ports:8189,address:0.0.0.0/0 protocol:udp,ports:8189,address:::/0" \
    --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0 protocol:tcp,ports:all,address:::/0 protocol:udp,ports:all,address:0.0.0.0/0 protocol:udp,ports:all,address:::/0" \
    >/dev/null
else
  log "Firewall '$NAME' already exists — reusing it."
fi

# ── Render cloud-init from the shared bootstrap template ────────────────────
TMP_UD="$(mktemp)"
trap 'rm -f "$TMP_UD"' EXIT
export repo_url="$REPO_URL" domain="${DOMAIN:-}" acme_email="${EMAIL:-me@example.com}" \
       owner_username="$OWNER_USERNAME" owner_password="$OWNER_PASSWORD"
envsubst '${repo_url} ${domain} ${acme_email} ${owner_username} ${owner_password}' \
  < "$SCRIPT_DIR/infra/cloud-init/bootstrap.sh.tmpl" > "$TMP_UD"

# ── Create the droplet ───────────────────────────────────────────────────────
log "Creating droplet ($SIZE, $REGION, tagged '$NAME')… this can take a minute."
doctl compute droplet create "$NAME" \
  --image "$IMAGE" \
  --size "$SIZE" \
  --region "$REGION" \
  --ssh-keys "$SSH_KEY_ID" \
  --tag-names "$NAME" \
  --user-data-file "$TMP_UD" \
  --wait

IP="$(doctl compute droplet list --format Name,PublicIPv4 --no-header | awk -v n="$NAME" '$1==n{print $2}')"

cat <<EOF

  Droplet is up: $IP

EOF
if [ -n "${DOMAIN:-}" ]; then
  log "Create a DNS A record now:  ${DOMAIN} -> ${IP}"
else
  log "No domain given — irlkit will serve over https://${IP} with a self-signed cert (browser warning expected)."
fi
log "The stack is still building in the background (a few minutes: it compiles SRT/SLS/srtla)."
log "Watch it:   ssh root@${IP} 'cd /opt/irlkit && docker compose logs -f'"
log "Owner login: ${OWNER_USERNAME} / ${OWNER_PASSWORD}"
log "Tear down:   doctl compute droplet delete ${NAME}"
