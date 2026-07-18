# Deploying irlkit

Three paths, easiest first. All target Ubuntu 24.04 with a **dedicated-vCPU**
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

## 1. Terraform (provision + configure in one step)

Creates the server, firewall, and runs the installer via cloud-init.

```bash
cd infra/terraform/digitalocean    # cheapest today — or infra/terraform/hetzner
cp terraform.tfvars.example terraform.tfvars   # fill in token, domain, etc.
terraform init
terraform apply
```

Then create a DNS **A record** for your `domain` pointing at the `ipv4` output and
wait ~5 minutes for images to build and TLS to issue. Visit `https://<domain>`.

## 2. One-line installer (existing server)

```bash
curl -fsSL https://raw.githubusercontent.com/YOU/irlkit/main/install.sh | sudo bash
```

Answer the prompts (domain, email, owner password). Re-running is safe — it
preserves your `.env` and secrets.

## 3. Manual (for hacking on it)

```bash
git clone https://github.com/YOU/irlkit && cd irlkit
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

Terraform sets these automatically; the installer only prints a reminder (it
doesn't touch your firewall rules).

## Operating it

```bash
cd /opt/irlkit
docker compose ps                 # service health
docker compose logs -f obs        # e.g. watch OBS boot / encoding
docker compose restart obs        # apply encoder preset/bitrate changes
git pull && docker compose up -d --build   # update
```

## Troubleshooting

- **No preview / OBS offline** — `docker compose logs obs`. Software GL init or a
  bad scene collection are the usual causes. `docker volume rm irlkit_obs_config`
  then restart to reset scenes to the seed.
- **Feed not showing in IRL scene** — confirm your `streamid` is
  `publish/live/<KEY>` and the key matches `.env`. Check `docker compose logs sls`.
- **Dropped frames / congestion climbing** — CPU-bound. Move `ENCODER_PRESET` to
  `low-cpu`, lower bitrate, or size up to more vCPU.
- **TLS not issued** — DNS must resolve to the box and ports 80/443 be open before
  Caddy can complete the ACME challenge.
