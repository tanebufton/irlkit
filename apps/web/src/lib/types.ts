// Mirrors the API's StatusSnapshot (apps/api/src/stats.ts).
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

export type Scope = "scene:switch" | "stream:toggle" | "audio:mute";

export interface Me {
  authenticated: boolean;
  role?: "owner" | "operator";
  scopes?: Scope[];
  label?: string | null;
}
