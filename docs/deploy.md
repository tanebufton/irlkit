# Deploying irlkit

Four paths, easiest first. All target Ubuntu 24.04 with a **dedicated-vCPU**
box — shared/burstable CPU (the "$5 VPS" tier from most providers) will drop
frames the moment x264 has to sustain 1080p60, because those plans oversell
the same physical cores across many tenants.

## Sizing & cost (checked July 2026 — reprice before committing, this moves)

| Tier | Preset | Spec | Cheapest confirmed | Price/mo |
|---|---|---|---|---|
| **Budget** | `low-cpu` (x264 superfast) | 2 dedicated vCPU / 4GB | **DigitalOcean** `c-2` | **$42** |
| Budget (alt) | `low-cpu` | 2 dedicated vCPU / 8GB | Hetzner `CCX13` | ~€43 (~$47) |
| **Recommended** | `balanced` (x264 veryfast) | 4 dedicated vCPU / 8GB | **DigitalOcean** `c-4` | **$84** |
| Recommended (alt) | `balanced` | 4 dedicated vCPU / 16GB | Hetzner `CCX23` | ~€86 (~$94) |
| Not recommended | — | Vultr CPU-Optimized 4 vCPU | Vultr | ~$110+ |

DigitalOcean is the current cheapest genuinely-dedicated option at both tiers —
Hetzner raised CCX pricing ~170% in June 2026 and is no longer the budget pick
it used to be, though it still ships more RAM per dollar if that matters more
to you than the lowest sticker price. Vultr's dedicated ("CPU-Optimized") line
prices per-vCPU higher than both.

**Skip Contabo, OVH's cheap "VPS" line, and any other "$5/mo, 4 vCPU" deal.**
Those vCPUs are oversold shared cores (documented CPU steal of 15–50%+ under
load) — fine for a hobby web app, not for a continuous video encode. If a price
looks too good for "dedicated," it's the same trap: check whether the provider
actually says *dedicated* vCPU, not just vCPU.

2 vCPU is a real floor, not a comfortable one — it has no headroom once SRT/SRTLA
decode and OBS's compositing share the box with the encoder, so a spike (a scene
with more sources, a bitrate bump) can start dropping frames. 4 vCPU is the
tier to actually run on if the box is your main setup.

## 1. DigitalOcean one-command deploy (easiest — no Terraform)

Uses `doctl`, DigitalOcean's own CLI — no HCL, no state file to manage.

```bash
# Install doctl once: https://docs.digitalocean.com/reference/doctl/how-to/install/
doctl auth init            # paste a DO API token (https://cloud.digitalocean.com/account/api/tokens)
./deploy-do.sh              # prompts for domain/email/owner creds, does the rest
```

It reuses (or uploads) an SSH key already on your DO account, opens exactly the
ports irlkit needs via a DO Cloud Firewall, creates the droplet (`c-4` — 4
dedicated vCPU/8GB, ~$84/mo — by default; `IRLKIT_SIZE=c-2 ./deploy-do.sh` for
the $42/mo budget tier), and hands it a cloud-init script that installs Docker
and brings the whole stack up unattended. Takes a few minutes end to end; the
script prints the IP, a command to watch the build, and the owner login.

**Region**: it asks interactively — press enter to auto-detect the closest
region (times a real connection to DigitalOcean Spaces, the only DO service
that still resolves per-region, since DO retired its old speedtest subdomains),
type `list` to see every available region, or type a slug directly (e.g.
`sfo3`). Set `IRLKIT_REGION=nyc3` to skip the prompt entirely for scripted runs.
The auto-detect only times one representative region per continent
(`nyc3 ams3 fra1 sgp1 blr1 syd1`); pick manually if you specifically want, say,
`sfo3` over `sfo2`.

Point a DNS **A record** at the printed IP (or skip it and use the IP directly
over a self-signed cert). Tear down with `doctl compute droplet delete irlkit`.

## 2. Terraform (repeatable infra-as-code, any of the supported providers)

Creates the server, firewall, and runs the installer via cloud-init — same
outcome as `deploy-do.sh`, but declarative and reviewable if you want that.

```bash
cd infra/terraform/digitalocean    # cheapest today — or infra/terraform/hetzner
cp terraform.tfvars.example terraform.tfvars   # fill in token, domain, region, etc.
terraform init
terraform apply
```

Region is just the `region` variable in `terraform.tfvars` (no auto-detect here
— this path is for repeatable, reviewable infra, so pick it deliberately; see
the DigitalOcean region list or Hetzner's location list in each module's
`variables.tf` comment).

Then create a DNS **A record** for your `domain` pointing at the `ipv4` output and
wait ~5 minutes for images to build and TLS to issue. Visit `https://<domain>`.

## 3. One-line installer (any existing server, any provider)

```bash
curl -fsSL https://raw.githubusercontent.com/tanebufton/irlkit/main/install.sh | sudo bash
```

Answer the prompts (domain, email, owner password). Re-running is safe — it
preserves your `.env` and secrets. Use this if you already have a box (DO,
Hetzner, bare metal, whatever) and just want the stack on it.

## 4. Manual (for hacking on it)

```bash
git clone https://github.com/tanebufton/irlkit && cd irlkit
cp .env.example .env         # edit secrets + domain
envsubst < services/noalbs/config.template.json > services/noalbs/config.json
docker compose up -d --build
```

Local dev without Docker: run the API (`cd apps/api && npm i && npm run dev`) and
web (`cd apps/web && npm i && npm run dev`) — Vite proxies `/api` and `/ws` to the
API on :3000. You still need a reachable OBS + SLS for full function.

## Open these ports

| Port | Proto | Purpose |
|---|---|---|
| 80, 443 | tcp | web UI + TLS |
| 1935 | tcp | RTMP ingest |
| 4001 | udp | SRT ingest |
| 5000 | udp | SRTLA bonded ingest |
| 8189 | udp | WebRTC preview |

`deploy-do.sh` and Terraform set these automatically (Cloud Firewall / hcloud
Firewall); the plain installer only prints a reminder since it doesn't touch
your provider's firewall or `ufw` for you.

## Operating it

```bash
cd /opt/irlkit
docker compose ps                 # service health
docker compose logs -f obs        # e.g. watch OBS boot / encoding
git pull && docker compose up -d --build   # update
```

To change `ENCODER_PRESET` / `OUTPUT_BITRATE_KBPS` (or any other `.env` value),
edit `.env` then run `docker compose up -d obs` — **not** `docker compose
restart obs`. `restart` reuses the container's already-baked-in environment and
won't see the edit at all; `up -d` re-reads `.env` and recreates the container
with the new value. (Note: the studio UI's "Save encoder" panel currently
persists your choice for reference but doesn't yet push it into the running OBS
container automatically — edit `.env` directly until that wiring lands.)

## Lost your owner login?

SSH into the box and run the recovery script from the checkout:

```bash
cd /opt/irlkit
./reset-password.sh                     # new random owner password, same username
./reset-password.sh --password 'x'      # or set a specific one
./reset-password.sh --username mod2     # change the username too
```

It only recreates the `api` container, so an active stream is untouched. Two
extra flags for less common cases:

- `--obs` — also rotates the OBS-websocket password. This is the credential
  the api/noalbs containers use to control OBS internally; it's never been
  reachable from outside the box (see below), so you'd only need this if you
  suspect the box itself was compromised. **It restarts OBS, which interrupts
  a live stream** — the script warns and asks to confirm unless you pass `-y`.
- `--revoke-sessions` — rotates `SESSION_SECRET`, which invalidates every
  existing owner session *and every operator share link* immediately. Use this
  if you think a session or a share link leaked; otherwise a plain password
  reset already stops the old password from working, existing sessions just
  age out on their own (7 days).

**Is OBS itself locked down the same way?** Yes, by two independent layers:
`docker-compose.yml` only `expose`s OBS's websocket port (4455) rather than
publishing it, so it's unreachable from outside the Docker host at all — only
the `api` and `noalbs` containers on the same internal network can reach it.
On top of that, OBS's websocket still requires its own password even for those
internal callers (`auth_required: true`, a random 16-byte secret generated at
install time). So there's no public surface to lock down further; `--obs`
above exists for completeness, not because it was ever exposed.

## Troubleshooting

- **OBS offline / obs-websocket refuses connections, and stays that way** —
  `docker compose logs obs` shows dbus warnings then just stops (no further
  output, container stays "Up" but nothing ever binds port 4455). Confirmed
  root cause: OBS 30+ shows a "start in safe mode?" prompt after any shutdown
  it doesn't consider clean (tracked via a `.sentinel` file in its config
  dir) — and a container being killed/recreated is never OBS's own clean
  UI-driven exit, so this could fire on *any* restart. That prompt is a
  dialog with no way to answer it headlessly, hanging the process forever.
  `--disable-shutdown-check` (already in `entrypoint.sh`) used to suppress
  this but was removed in OBS 32.0, so it may be a silent no-op depending on
  the version the PPA installs. **Fixed at the source**: `entrypoint.sh` now
  deletes `$OBS_DIR/.sentinel` before every launch (OBS's own
  community-recommended workaround for exactly this — an automated startup
  script restarting it), so this shouldn't recur. The dbus warnings in the
  log are unrelated noise either way; they're present on every boot,
  successful or not.

  If it still happens for some other reason, the escape hatch is resetting
  OBS's whole persisted volume and letting it rebuild fresh via the API's
  bootstrap (loses manual scene/source customization, not the stream key or
  destination, which live in `.env`/DB):
  ```
  docker compose stop obs
  docker compose rm -f obs   # a *stopped* container still holds its volume —
                             # `docker volume rm` fails with "volume is in use"
                             # until the container itself is removed, not just stopped
  docker volume rm irlkit_obs_config
  docker compose up -d obs
  ```
  Confirm before assuming it's hung, not just slow:
  `docker compose exec obs cat /proc/1/status | grep State` and
  `docker stats --no-stream irlkit-obs-1`. Genuinely hung looks like state
  `S` with 0% CPU sustained for a while; if CPU is active, it's just slow,
  and resetting the volume won't help.
- **Feed not showing in IRL scene** — confirm your `streamid` is
  `publish/live/<KEY>` and the key matches `.env`. Check `docker compose logs sls`.
- **Dropped frames / congestion climbing** — CPU-bound. Move `ENCODER_PRESET` to
  `low-cpu`, lower bitrate, or size up to more vCPU.
- **TLS not issued** — DNS must resolve to the box and ports 80/443 be open before
  Caddy can complete the ACME challenge.
