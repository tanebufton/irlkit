# Streaming guide

Replace `<HOST>` with your domain/IP and `<KEY>` with the `STREAM_KEY` from `.env`.

## Point your encoder at the box

### SRTLA — bonded cellular (recommended for IRL)
Best resilience on mobile: bond several modems/SIMs. Use **BELABOX** or an app
that speaks SRTLA (IRL Pro, Moblin).

- Receiver (SRTLA): `<HOST>` port `5000` (UDP)
- Stream id / SRT streamid: `publish/live/<KEY>`
- Latency: `2000` ms (match the server)

### SRT — single link
```
srt://<HOST>:4001?streamid=publish/live/<KEY>&latency=2000
```

### RTMP — apps / desktop OBS
```
URL: rtmp://<HOST>:1935/ingest
Key: <KEY>
```

> The higher the SRT latency, the more cellular jitter it absorbs (at the cost of
> delay). 2000 ms is a good IRL default; drop it for a stable wired uplink.

## Set your output destination

In the **studio** (`https://<HOST>`, sign in as owner):

1. **Stream destination** → paste the platform's RTMP URL + stream key, e.g.
   - Twitch: `rtmp://live.twitch.tv/app` + your key
   - YouTube: `rtmp://a.rtmp.youtube.com/live2` + your key
   - Kick / custom: their RTMP ingest URL + key
2. **Encoder** → pick `low-cpu` / `balanced` / `quality` and a bitrate
   (6000 kbps is a solid 1080p60 default). Encoder changes apply on OBS restart:
   `docker compose restart obs`.

## Go live

From the **studio** or the **remote control panel** (`/panel`):

- Switch to the **IRL** scene once your feed is up (or let NOALBS do it).
- Hit **Go live** to start sending to your destination.
- Watch **Ingest bitrate / RTT** and **Output** health in the top strip.
- If the feed drops, NOALBS flips to **BRB** automatically.

## Hand the controls to a moderator

Studio → **Operator share links** → choose capabilities (switch scenes, start/stop,
mute) and an expiry → **Create link** → copy and send. They open it on any phone
and get just the control panel. Revoke any time.
