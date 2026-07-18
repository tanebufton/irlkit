// Scene-change history — who switched what, and when, including NOALBS's
// automatic switches (see apps/api/src/obs.ts's CurrentProgramSceneChanged
// listener, the single source of truth this is read from).
import { useState } from "react";
import { api } from "../lib/api";
import { Button, Card } from "../components/ui";

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString()} ${time}`;
}

function actorLabel(actor: string): string {
  if (actor === "owner") return "Owner";
  if (actor === "auto") return "Auto (NOALBS)";
  if (actor.startsWith("operator:")) return `Operator (${actor.slice("operator:".length)})`;
  return actor;
}

export function AuditLog() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<{ id: number; ts: number; scene: string; actor: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setEntries((await api.auditLog(100)).entries);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggle = async () => {
    if (!open && !entries) await refresh();
    setOpen((o) => !o);
  };

  return (
    <Card>
      <button
        type="button"
        onClick={() => void toggle()}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="text-sm font-semibold text-slate-400">Scene-change history</h2>
        <span className="text-slate-500 text-sm">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex justify-end">
            <Button variant="ghost" className="py-1.5 px-3 text-sm" onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>
          {error && <p className="text-live text-sm">{error}</p>}
          {entries && entries.length === 0 && <p className="text-slate-500 text-sm">No scene changes yet.</p>}
          <div className="max-h-80 overflow-y-auto space-y-1">
            {entries?.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg bg-ink/60 px-3 py-2 text-sm">
                <span className="font-medium">{e.scene}</span>
                <span className="text-slate-500">{actorLabel(e.actor)}</span>
                <span className="text-slate-600 text-xs tabular-nums">{fmtTime(e.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
