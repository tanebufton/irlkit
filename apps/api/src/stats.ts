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

// SLS's /stats shape varies across builds; dig out the first publisher's
// bitrate/rtt wherever they live rather than assuming an exact schema.
async function readIngest(): Promise<{ online: boolean; bitrateKbps: number | null; rttMs: number | null }> {
  try {
    const res = await fetch(config.slsStatsUrl, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { online: false, bitrateKbps: null, rttMs: null };
    const data = (await res.json()) as Record<string, unknown>;

    const pub = findPublisher(data);
    if (!pub) return { online: false, bitrateKbps: null, rttMs: null };

    const bitrate = num(pub, ["bitrate", "mbpsRecvRate", "rBandwidth"]);
    const rtt = num(pub, ["rtt", "msRTT", "rttMs"]);
    // SLS may report Mbps; normalise anything < 100 as Mbps → Kbps.
    const kbps = bitrate == null ? null : bitrate < 100 ? Math.round(bitrate * 1000) : Math.round(bitrate);
    return { online: true, bitrateKbps: kbps, rttMs: rtt == null ? null : Math.round(rtt) };
  } catch {
    return { online: false, bitrateKbps: null, rttMs: null };
  }
}

function findPublisher(data: Record<string, unknown>): Record<string, unknown> | null {
  // Common shapes: { publishers: { "<sid>": {...} } } or { streams: [...] }.
  const pubs = data.publishers as Record<string, unknown> | undefined;
  if (pubs && typeof pubs === "object") {
    const first = Object.values(pubs)[0];
    if (first && typeof first === "object") return first as Record<string, unknown>;
  }
  const streams = data.streams as unknown[] | undefined;
  if (Array.isArray(streams) && streams[0] && typeof streams[0] === "object") {
    return streams[0] as Record<string, unknown>;
  }
  return null;
}

function num(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
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
