#!/usr/bin/env bash
# Boot a headless OBS: virtual display + audio, expand config from env, launch.
set -euo pipefail

OBS_DIR="$HOME/.config/obs-studio"
PROFILE_DIR="$OBS_DIR/basic/profiles/irlkit"
SCENES_DIR="$OBS_DIR/basic/scenes"
WS_DIR="$OBS_DIR/plugin_config/obs-websocket"
TPL=/opt/config-templates

# ── Map the friendly encoder preset to an x264 preset ────────────────────────
case "${ENCODER_PRESET:-balanced}" in
  low-cpu)  export X264_PRESET=superfast ;;
  quality)  export X264_PRESET=faster ;;
  *)        export X264_PRESET=veryfast ;;   # balanced
esac
# keyframe interval in frames = 2s
export KEYINT=$(( ${OUTPUT_FPS:-60} * 2 ))
# Ingest URL OBS pulls as its main media source. Port 4000 is SLS's
# listen_player port — distinct from 4001 (direct-SRT publish) and 4002
# (SRTLA publish); this fork uses separate ports per role.
export INGEST_SRT_URL="srt://sls:4000?streamid=play/live/${STREAM_KEY}&latency=2000"

render() { envsubst < "$TPL/$1" > "$2"; }

mkdir -p "$PROFILE_DIR" "$SCENES_DIR" "$WS_DIR"

# Always (re)render global + profile + websocket so env changes take effect on
# restart. Scenes are rendered ONCE so scenes edited from the studio persist.
render global.ini            "$OBS_DIR/global.ini"
render basic.ini             "$PROFILE_DIR/basic.ini"
render service.json          "$PROFILE_DIR/service.json"
render streamEncoder.json    "$PROFILE_DIR/streamEncoder.json"
render obs-websocket.json    "$WS_DIR/config.json"
if [ ! -f "$SCENES_DIR/irlkit.json" ]; then
  render scenes.json         "$SCENES_DIR/irlkit.json"
fi

# ── Virtual display ──────────────────────────────────────────────────────────
Xvfb "$DISPLAY" -screen 0 "${OUTPUT_WIDTH:-1920}x${OUTPUT_HEIGHT:-1080}x24" -nolisten tcp &
for i in $(seq 1 30); do xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 && break; sleep 0.2; done

# ── Virtual audio (OBS needs a working PulseAudio graph) ─────────────────────
export PULSE_SERVER=unix:/tmp/pulse.sock
pulseaudio --exit-idle-time=-1 --disable-shm=1 \
           --load="module-native-protocol-unix socket=/tmp/pulse.sock auth-anonymous=1" \
           --load="module-null-sink sink_name=irlkit" \
           --daemonize=no &
sleep 1

echo "[obs] launching (profile=irlkit preset=$X264_PRESET ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}@${OUTPUT_FPS})"
exec obs \
  --profile irlkit \
  --collection irlkit \
  --scene "Starting Soon" \
  --disable-shutdown-check \
  --multi
