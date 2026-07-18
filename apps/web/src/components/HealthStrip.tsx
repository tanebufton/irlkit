import type { StatusSnapshot } from "../lib/types";
import { Pill } from "./ui";

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${tone ?? "text-slate-100"}`}>
        {value}
      </span>
    </div>
  );
}

export function HealthStrip({ status, wsConnected }: { status: StatusSnapshot | null; wsConnected: boolean }) {
  const ingest = status?.ingest;
  const output = status?.output;

  // Congestion drives the ingest tone: green healthy, amber stressed.
  const ingestTone = !ingest?.online ? false : (output && output.congestion > 0.3) ? "warn" : true;

  return (
    <div className="rounded-2xl bg-panel border border-edge p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Pill ok={!!status?.obsConnected && wsConnected}>
          {wsConnected ? (status?.obsConnected ? "OBS online" : "OBS offline") : "Reconnecting…"}
        </Pill>
        {output?.active ? (
          <span className="inline-flex items-center gap-2 text-live font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-live animate-pulse" />
            LIVE {fmtDuration(output.durationSec)}
          </span>
        ) : (
          <span className="text-slate-500 font-medium">Offline</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Ingest"
          value={ingest?.online ? `${ingest.bitrateKbps ?? "—"} kbps` : "no feed"}
          tone={ingestTone === "warn" ? "text-warn" : ingest?.online ? "text-good" : "text-slate-500"}
        />
        <Metric label="RTT" value={ingest?.rttMs != null ? `${ingest.rttMs} ms` : "—"} />
        <Metric
          label="Output"
          value={output?.active ? `${output.bitrateKbps ?? "—"} kbps` : "—"}
        />
        <Metric
          label="Dropped"
          value={output ? String(output.droppedFrames) : "—"}
          tone={output && output.droppedFrames > 0 ? "text-warn" : undefined}
        />
      </div>
    </div>
  );
}
