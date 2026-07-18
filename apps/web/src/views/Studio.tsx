// Studio — owner-only. Build/switch scenes, add sources, set the stream
// destination + encoder, and mint operator share links. Live JPEG preview
// (the robust fallback; WebRTC preview can be layered on later).
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useStatus } from "../lib/useStatus";
import { HealthStrip } from "../components/HealthStrip";
import { Button, Card } from "../components/ui";
import { AuditLog } from "./AuditLog";
import { ConnectionInfo } from "./ConnectionInfo";
import { SceneItems } from "./SceneItems";
import { TokensPanel } from "./TokensPanel";

function Preview({ active }: { active: boolean }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    const tick = () => setSrc(`/api/control/preview.jpg?t=${Date.now()}`);
    tick();
    const id = setInterval(tick, active ? 1000 : 2000);
    return () => clearInterval(id);
  }, [active]);
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black grid place-items-center">
      {src ? (
        <img src={src} alt="program preview" className="h-full w-full object-contain" />
      ) : (
        <span className="text-slate-600 text-sm">no preview</span>
      )}
    </div>
  );
}

const SOURCE_TYPES = ["media", "browser", "image", "text"] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

function buildSettings(type: SourceType, value: string): object {
  switch (type) {
    case "media":
      return { is_local_file: false, input: value, reconnect_delay_sec: 2 };
    case "browser":
      return { url: value, width: 1920, height: 1080 };
    case "image":
      return { file: value };
    case "text":
      return { text: value, font: { face: "DejaVu Sans", size: 72 } };
  }
}

export function Studio({ onLogout }: { onLogout: () => void }) {
  const { status, connected } = useStatus();
  const [scenes, setScenes] = useState<string[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const sc = await api.scenes();
      setScenes(sc.scenes);
      setCurrent(sc.current);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Add-source form state
  const [srcScene, setSrcScene] = useState("");
  const [srcName, setSrcName] = useState("");
  const [srcType, setSrcType] = useState<SourceType>("browser");
  const [srcValue, setSrcValue] = useState("");

  // Destination form state
  const [destUrl, setDestUrl] = useState("");
  const [destKey, setDestKey] = useState("");

  // Encoder form state
  const [preset, setPreset] = useState("balanced");
  const [bitrate, setBitrate] = useState(6000);

  // Load whatever's currently configured, so a refresh doesn't show blank
  // fields for settings that are actually already saved.
  useEffect(() => {
    void (async () => {
      try {
        const [dest, enc] = await Promise.all([api.getDestination(), api.getEncoder()]);
        setDestUrl(dest.server);
        setDestKey(dest.key);
        setPreset(enc.preset);
        setBitrate(enc.bitrateKbps);
      } catch {
        // Non-fatal — leave the form at its blank defaults.
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">irlkit studio</h1>
        <div className="flex gap-2">
          <a href="/panel" target="_blank" rel="noreferrer">
            <Button variant="ghost" className="py-2 text-sm">Open panel ↗</Button>
          </a>
          <Button variant="ghost" className="py-2 text-sm" onClick={onLogout}>Sign out</Button>
        </div>
      </header>

      <HealthStrip status={status} wsConnected={connected} />

      {error && (
        <div className="rounded-xl bg-live/15 border border-live/40 text-live text-sm px-3 py-2">{error}</div>
      )}

      <Card>
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Program preview</h2>
        <Preview active={status?.output.active ?? false} />
      </Card>

      {/* Scenes */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400">Scenes</h2>
          <AddScene busy={busy} onAdd={(name) => run(() => api.createScene(name))} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {scenes.map((s) => (
            <div key={s} className="flex items-stretch gap-1">
              <Button
                variant={s === current ? "active" : "default"}
                disabled={busy}
                onClick={() => run(() => api.setScene(s))}
                className="flex-1 text-sm"
              >
                {s}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                title="Delete scene"
                onClick={() => run(() => api.deleteScene(s))}
                className="px-3 text-slate-500 hover:text-live"
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Add source */}
      <Card>
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Add source</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            className="rounded-xl bg-ink border border-edge px-3 py-3"
            value={srcScene}
            onChange={(e) => setSrcScene(e.target.value)}
          >
            <option value="">Choose scene…</option>
            {scenes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            className="rounded-xl bg-ink border border-edge px-3 py-3"
            value={srcType}
            onChange={(e) => setSrcType(e.target.value as SourceType)}
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            className="rounded-xl bg-ink border border-edge px-3 py-3"
            placeholder="Source name"
            value={srcName}
            onChange={(e) => setSrcName(e.target.value)}
          />
          <input
            className="rounded-xl bg-ink border border-edge px-3 py-3"
            placeholder={srcType === "text" ? "Text to show" : srcType === "image" ? "Image path" : "URL"}
            value={srcValue}
            onChange={(e) => setSrcValue(e.target.value)}
          />
        </div>
        <Button
          variant="primary"
          disabled={busy || !srcScene || !srcName}
          className="mt-3"
          onClick={() =>
            run(async () => {
              await api.addInput(srcScene, srcName, srcType, buildSettings(srcType, srcValue));
              setSrcName("");
              setSrcValue("");
            })
          }
        >
          Add to scene
        </Button>
      </Card>

      <SceneItems sceneName={srcScene} />

      {/* Output config */}
      <Card>
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Stream destination</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-xl bg-ink border border-edge px-3 py-3"
            placeholder="rtmp://live.twitch.tv/app"
            value={destUrl}
            onChange={(e) => setDestUrl(e.target.value)}
          />
          <input
            className="rounded-xl bg-ink border border-edge px-3 py-3"
            placeholder="stream key"
            type="password"
            value={destKey}
            onChange={(e) => setDestKey(e.target.value)}
          />
        </div>
        <Button
          variant="primary"
          disabled={busy || !destUrl}
          className="mt-3"
          onClick={() => run(() => api.setDestination(destUrl, destKey))}
        >
          Save destination
        </Button>

        <h2 className="text-sm font-semibold text-slate-400 mt-6 mb-3">Encoder</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            className="rounded-xl bg-ink border border-edge px-3 py-3"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            <option value="low-cpu">low-cpu (fastest)</option>
            <option value="balanced">balanced</option>
            <option value="quality">quality (heavier)</option>
          </select>
          <input
            className="rounded-xl bg-ink border border-edge px-3 py-3"
            type="number"
            min={500}
            max={20000}
            value={bitrate}
            onChange={(e) => setBitrate(Number(e.target.value))}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">Encoder changes apply on the next OBS restart.</p>
        <Button
          variant="primary"
          disabled={busy}
          className="mt-3"
          onClick={() => run(() => api.setEncoder(preset, bitrate))}
        >
          Save encoder
        </Button>
      </Card>

      <ConnectionInfo />
      <AuditLog />
      <TokensPanel />
    </div>
  );
}

function AddScene({ busy, onAdd }: { busy: boolean; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="flex gap-2">
      <input
        className="rounded-lg bg-ink border border-edge px-2 py-1 text-sm w-32"
        placeholder="New scene"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button
        variant="default"
        disabled={busy || !name}
        className="py-1 px-3 text-sm"
        onClick={() => {
          onAdd(name);
          setName("");
        }}
      >
        Add
      </Button>
    </div>
  );
}
