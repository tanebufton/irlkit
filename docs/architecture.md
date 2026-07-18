# Architecture

irlkit is a set of Docker Compose services on one box. One deployment serves one
streamer; hand a moderator a scoped link to co-pilot the same box.

## Services

| Service | Image / build | Role | Exposed |
|---|---|---|---|
| `caddy` | caddy:2 | TLS edge, routes web/api/preview | 80, 443 |
| `mediamtx` | bluenviron/mediamtx | RTMP ingest + WebRTC/HLS preview | 1935/tcp, 8189/udp |
| `sls` | build `services/ingest/sls` | SRT Live Server (single-link SRT + srtla target) | 4001/udp |
| `srtla` | build `services/ingest/srtla` | BELABOX bonding receiver → SLS | 5000/udp |
| `obs` | build `services/obs` | headless OBS: composite + x264 encode → destination | 4455 (internal) |
| `noalbs` | 715209/noalbs | auto-switch to BRB when the feed drops | — |
| `api` | build `apps/api` | control plane: obs-websocket, auth, stats, tokens | 3000 (internal) |
| `web` | build `apps/web` | SPA: studio + remote control panel | 80 (internal) |

## Data flow

1. The streamer's encoder publishes over **SRTLA** (bonded), **SRT**, or **RTMP**.
2. `srtla` de-bonds to `sls`; `sls`/`mediamtx` hold the live feed.
3. Headless **OBS** pulls the feed as a Media Source (`srt://sls:4001?streamid=play/live/<KEY>`),
   composites scenes/overlays, and x264-encodes the program to the destination.
4. The **api** drives OBS over obs-websocket v5 and aggregates health from SLS +
   OBS, pushing it to the browser once a second over `/ws`.
5. **noalbs** independently watches SLS stats and flips OBS to **BRB** on loss.

## Scenes

The OBS container boots with a minimal seed collection; the api creates the
canonical scenes idempotently on first connect:

- **Starting Soon** — standby text (default program scene at boot).
- **IRL** — the live feed (`IRL Feed` media source).
- **BRB** — shown automatically by NOALBS when the feed drops.

Everything else (extra scenes, overlays, sources) is created live from the studio
via obs-websocket, so there's no fragile hand-authored OBS JSON to maintain.

## Auth

- **Owner** — env credentials → session cookie (JWT, 7 days). Full access.
- **Operator** — owner mints a scoped JWT (`scene:switch`, `stream:toggle`,
  `audio:mute`) with optional expiry, delivered as `/panel#token=…`. Revocable by
  `jti`. Operators only ever see the control panel, never the studio.

## Encoding

x264 software encoding, no GPU required. `ENCODER_PRESET` maps to an x264 preset
(`low-cpu`→superfast, `balanced`→veryfast, `quality`→faster). 1080p60 needs 4–8
dedicated vCPU. Dropping in an NVENC GPU later is a config change, not a rewrite.
