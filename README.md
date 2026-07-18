# irlkit

Your own IRL streaming rig, self-hosted on a cheap VPS. An open alternative to
managed services like IRLToolkit / irlhosting / antiscuff.

Spin up a dedicated-vCPU cloud server, run one command, and you get:

- **Ingest** from your phone/encoder over **SRTLA** (BELABOX / IRL Pro bonded
  cellular), plain **SRT**, or **RTMP**.
- A **headless OBS** on the server that composites your feed with overlays and
  streams the finished program to Twitch / YouTube / Kick / any RTMP target.
- A **studio** you edit from the browser (desktop or phone) — build and arrange
  scenes, sources, and overlays live.
- A **remote control panel** (like streamremote.fr) to switch scenes, start/stop,
  mute, and watch live health — shareable with a moderator via a scoped link.
- **Auto BRB**: drops to a "be right back" scene the moment your feed cuts out.
- **1080p60** on an affordable box using x264 software encoding.

## Quick start

On a fresh Ubuntu 22.04+ / Debian 12 VPS with a **dedicated vCPU** (not the
oversold "$5/mo" shared-vCPU tier — see [`docs/deploy.md`](docs/deploy.md#sizing--cost-checked-july-2026--reprice-before-committing-this-moves)
for current pricing; as of July 2026 a DigitalOcean 4 vCPU/8GB CPU-Optimized
droplet at $84/mo is the cheapest confirmed box that runs 1080p60 comfortably,
with a thinner-margin $42/mo 2 vCPU floor below it):

```bash
curl -fsSL https://raw.githubusercontent.com/YOU/irlkit/main/install.sh | sudo bash
```

The installer sets up Docker, generates secrets, and launches the stack. Point a
DNS record at the box first for automatic HTTPS (or use the bare IP for a
self-signed local test). Open ports: `80,443/tcp`, `1935/tcp`, `4001/udp`,
`5000/udp`, `8189/udp`.

Then open `https://<your-domain>`, log in as the owner, set your stream
destination in the studio, and point your encoder at:

| Protocol | Endpoint | Notes |
|---|---|---|
| SRTLA  | `udp://<host>:5000` | bonded cellular (BELABOX / IRL Pro) |
| SRT    | `srt://<host>:4001?streamid=publish/live/<KEY>&latency=2000` | single link |
| RTMP   | `rtmp://<host>:1935/ingest?key=<KEY>` | app / OBS |

## Architecture

```
 phone/encoder ─SRTLA─▶ srtla ─▶ sls ─┐
               ─SRT────────────▶ sls ──┼─▶ headless OBS ─x264─▶ Twitch/YT/Kick/RTMP
               ─RTMP──────────▶ mediamtx┘        ▲
 browser ─HTTPS─▶ caddy ─▶ web (SPA) + api ──obs-websocket v5
                                    │
                             noalbs ┘ (auto-BRB on feed loss)
```

Everything runs as Docker Compose services. See `docs/` for service details and
the full plan in the repo history.

## Repo layout

| Path | What |
|---|---|
| `docker-compose.yml` | the whole stack |
| `install.sh` | one-command installer |
| `Caddyfile` | TLS edge + routing |
| `services/ingest/` | MediaMTX (RTMP), SLS (SRT), srtla (bonding) |
| `services/obs/` | headless OBS image + preloaded scenes |
| `services/noalbs/` | auto scene-switch config |
| `apps/api/` | Fastify control-plane API (obs-websocket, auth, stats) |
| `apps/web/` | React studio + remote control panel |
| `infra/` | Terraform + cloud-init for Hetzner / DigitalOcean |

## Status

Under active construction — see the task list / milestones. Not yet production-ready.

## Legal

irlkit only provides streaming infrastructure. Complying with the terms of
service of the platforms you stream to, and any local laws, is your responsibility.
