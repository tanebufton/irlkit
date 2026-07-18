// Operator share-link management. The owner mints scoped links (streamremote
// style) and hands them to moderators; each is independently revocable.
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button, Card } from "../components/ui";

const SCOPES = [
  { id: "scene:switch", label: "Switch scenes" },
  { id: "stream:toggle", label: "Start/stop stream" },
  { id: "audio:mute", label: "Mute audio" },
];

interface TokenRow {
  jti: string;
  label: string;
  scopes: string[];
  expiresAt: number | null;
  revoked: boolean;
}

export function TokensPanel() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<string[]>(["scene:switch"]);
  const [ttl, setTtl] = useState<number>(24);
  const [minted, setMinted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setTokens((await api.tokens()).tokens);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const toggleScope = (id: string) =>
    setScopes((cur) => (cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]));

  const create = async () => {
    setError(null);
    try {
      const { shareUrl } = await api.createToken(label, scopes, ttl || undefined);
      setMinted(`${location.origin}${shareUrl}`);
      setLabel("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-400 mb-3">Operator share links</h2>

      <div className="space-y-3">
        <input
          className="w-full rounded-xl bg-ink border border-edge px-3 py-3"
          placeholder="Label (e.g. 'Mod - Alex')"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleScope(s.id)}
              className={`rounded-full px-3 py-1.5 text-sm border transition ${
                scopes.includes(s.id)
                  ? "bg-accent/20 border-accent text-accent"
                  : "border-edge text-slate-400"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">Expires in</label>
          <input
            className="w-20 rounded-lg bg-ink border border-edge px-2 py-1.5"
            type="number"
            min={1}
            value={ttl}
            onChange={(e) => setTtl(Number(e.target.value))}
          />
          <span className="text-sm text-slate-400">hours</span>
          <Button variant="primary" className="ml-auto py-2" disabled={!label || scopes.length === 0} onClick={create}>
            Create link
          </Button>
        </div>
      </div>

      {error && <p className="text-live text-sm mt-3">{error}</p>}

      {minted && (
        <div className="mt-3 rounded-xl bg-good/10 border border-good/40 p-3">
          <p className="text-xs text-slate-400 mb-1">Share this link (shown once):</p>
          <div className="flex items-center gap-2">
            <code className="text-xs break-all flex-1 text-good">{minted}</code>
            <Button variant="default" className="py-1.5 px-3 text-sm" onClick={() => navigator.clipboard.writeText(minted)}>
              Copy
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {tokens.filter((t) => !t.revoked).map((t) => (
          <div key={t.jti} className="flex items-center justify-between rounded-xl bg-ink/60 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm truncate">{t.label}</p>
              <p className="text-xs text-slate-500">{t.scopes.join(", ")}</p>
            </div>
            <Button
              variant="ghost"
              className="py-1.5 px-3 text-sm text-slate-400 hover:text-live"
              onClick={async () => {
                await api.revokeToken(t.jti);
                await refresh();
              }}
            >
              Revoke
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
