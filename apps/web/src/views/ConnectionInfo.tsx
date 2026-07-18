// Ingest connection details for the owner's encoder — collapsed by default
// since it embeds the stream key, with the key itself separately masked.
import { useState } from "react";
import { api } from "../lib/api";
import { Button, Card } from "../components/ui";

function mask(s: string): string {
  if (s.length <= 8) return "•".repeat(s.length);
  return `${s.slice(0, 4)}${"•".repeat(s.length - 8)}${s.slice(-4)}`;
}

function CopyableRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const shown = secret && !revealed ? mask(value) : value;
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded-lg bg-ink/60 px-3 py-2 text-sm">{shown}</code>
        {secret && (
          <Button variant="ghost" className="py-2 px-3 text-sm" onClick={() => setRevealed((r) => !r)}>
            {revealed ? "Hide" : "Reveal"}
          </Button>
        )}
        <Button variant="default" className="py-2 px-3 text-sm" onClick={() => navigator.clipboard.writeText(value)}>
          Copy
        </Button>
      </div>
    </div>
  );
}

export function ConnectionInfo() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.connectionInfo>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (!open && !info) {
      try {
        setInfo(await api.connectionInfo());
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setOpen((o) => !o);
  };

  return (
    <Card>
      <button
        type="button"
        onClick={() => void toggle()}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="text-sm font-semibold text-slate-400">Encoder connection info</h2>
        <span className="text-slate-500 text-sm">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {error && <p className="text-live text-sm">{error}</p>}
          {info && (
            <>
              <CopyableRow label="SRTLA (bonded cellular)" value={info.srtla.url} />
              <CopyableRow label="SRT (single link)" value={info.srt.url} secret />
              <CopyableRow label="RTMP (paste whole URL, leave any separate Key field blank)" value={info.rtmp.url} secret />
            </>
          )}
        </div>
      )}
    </Card>
  );
}
