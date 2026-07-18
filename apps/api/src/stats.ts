// Aggregates live health from SLS (ingest side) and OBS (output side) once a
// second and pushes a compact snapshot to all connected clients via the hub.
import { config } from "./config.js";
import { obs } from "./obs.js";
import { hub } from "./ws.js";

export interface StatusSnapshot {
  ts: number;
  obsConnected: boolean;
  currentScene: string | null;
  ingest: {
    online: boolean;
    bitrateKbps: number | null;
    rttMs: number | null;
  };
  output: {
    active: boolean;
    bitrateKbps: number | null;
    droppedFrames: number;
    congestion: number;
    durationSec: number;
  };
}

let lastOutputBytes = 0;
let lastOutputTs = 0;

// SLS's /stats shape, confirmed from the irlserver/irl-srt-server source (the
// NOALBS stream-server integration for this same endpoint parses the exact
// same fields): { publishers: { "<streamid>": { bitrate, rtt, ... } } },
// bitrate already in kbps, rtt already in ms — no unit conversion needed.
async function readIngest(): Promise<{ online: boolean; bitrateKbps: number | null; rttMs: number | null }> {
  try {
    const res = await fetch(config.slsStatsUrl, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { online: false, bitrateKbps: null, rttMs: null };
    const data = (await res.json()) as { publishers?: Record<string, { bitrate?: number; rtt?: number }> };

    // Single-tenant appliance: at most one active publisher at a time, so the
    // first entry (regardless of its exact streamid) is the one we want.
    const pub = data.publishers ? Object.values(data.publishers)[0] : undefined;
    if (!pub) return { online: false, bitrateKbps: null, rttMs: null };

    const bitrateKbps = typeof pub.bitrate === "number" ? Math.round(pub.bitrate) : null;
    const rttMs = typeof pub.rtt === "number" ? Math.round(pub.rtt) : null;
    return { online: true, bitrateKbps, rttMs };
  } catch {
    return { online: false, bitrateKbps: null, rttMs: null };
  }
}

async function collect(): Promise<StatusSnapshot> {
  const now = Date.now();
  const ingest = await readIngest();

  let currentScene: string | null = null;
  const output: StatusSnapshot["output"] = {
    active: false,
    bitrateKbps: null,
    droppedFrames: 0,
    congestion: 0,
    durationSec: 0,
  };

  if (obs.connected) {
    try {
      const [scene, status] = await Promise.all([obs.getSceneList(), obs.streamStatus()]);
      currentScene = scene.currentProgramSceneName;
      output.active = status.outputActive;
      output.droppedFrames = status.outputSkippedFrames;
      output.congestion = Math.round(status.outputCongestion * 100) / 100;
      output.durationSec = Math.round(status.outputDuration / 1000);

      // Derive output bitrate from the byte delta between polls.
      if (status.outputActive && lastOutputTs > 0 && status.outputBytes >= lastOutputBytes) {
        const dtSec = (now - lastOutputTs) / 1000;
        if (dtSec > 0) {
          output.bitrateKbps = Math.round(((status.outputBytes - lastOutputBytes) * 8) / dtSec / 1000);
        }
      }
      lastOutputBytes = status.outputBytes;
      lastOutputTs = now;
    } catch {
      /* leave defaults */
    }
  }

  return { ts: now, obsConnected: obs.connected, currentScene, ingest, output };
}

export function startStatsLoop() {
  const tick = async () => {
    try {
      hub.broadcast(await collect());
    } catch (err) {
      console.warn("[stats] collect error:", (err as Error).message);
    }
  };
  void tick();
  return setInterval(tick, 1000);
}
