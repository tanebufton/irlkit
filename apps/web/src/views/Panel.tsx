// Remote control panel — the phone-friendly surface a streamer or a moderator
// uses to run the show: switch scenes, start/stop, mute, watch live health.
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Me } from "../lib/types";
import { useStatus } from "../lib/useStatus";
import { HealthStrip } from "../components/HealthStrip";
import { Button, Card } from "../components/ui";

export function Panel({ me }: { me: Me }) {
  const { status, connected } = useStatus();
  const [scenes, setScenes] = useState<string[]>([]);
  const [audio, setAudio] = useState<{ name: string; muted: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const can = (s: string) => me.role === "owner" || (me.scopes ?? []).includes(s as never);

  const refresh = async () => {
    try {
      const [sc, au] = await Promise.all([api.scenes(), can("audio:mute") ? api.audio() : Promise.resolve({ inputs: [] })]);
      setScenes(sc.scenes);
      setAudio(au.inputs);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 10000);
    return () => clearInterval(t);
  }, []);

  const guard = async (fn: () => Promise<unknown>) => {
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

  const live = status?.output.active ?? false;
  const current = status?.currentScene;

  return (
    <div className="mx-auto max-w-md p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">irlkit</h1>
        <span className="text-xs text-slate-500">
          {me.role === "operator" ? me.label ?? "operator" : "owner"}
        </span>
      </header>

      <HealthStrip status={status} wsConnected={connected} />

      {error && (
        <div className="rounded-xl bg-live/15 border border-live/40 text-live text-sm px-3 py-2">
          {error}
        </div>
      )}

      {/* Scenes */}
      {can("scene:switch") && (
        <Card>
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Scenes</h2>
          <div className="grid grid-cols-2 gap-2">
            {scenes.map((s) => (
              <Button
                key={s}
                variant={s === current ? "active" : "default"}
                disabled={busy}
                onClick={() => guard(() => api.setScene(s))}
                className="h-16 text-base"
              >
                {s}
              </Button>
            ))}
            {scenes.length === 0 && <p className="text-slate-500 text-sm col-span-2">No scenes yet.</p>}
          </div>
        </Card>
      )}

      {/* Stream toggle */}
      {can("stream:toggle") && (
        <Button
          variant={live ? "danger" : "primary"}
          disabled={busy || !status?.obsConnected}
          onClick={() => guard(() => (live ? api.stopStream() : api.startStream()))}
          className="w-full h-16 text-lg"
        >
          {live ? "■ Stop stream" : "● Go live"}
        </Button>
      )}

      {/* Audio */}
      {can("audio:mute") && audio.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-slate-400 mb-3">Audio</h2>
          <div className="space-y-2">
            {audio.map((a) => (
              <div key={a.name} className="flex items-center justify-between">
                <span className="text-sm truncate mr-3">{a.name}</span>
                <Button
                  variant={a.muted ? "danger" : "default"}
                  disabled={busy}
                  onClick={() => guard(() => api.setMute(a.name, !a.muted))}
                  className="py-2 px-3 text-sm"
                >
                  {a.muted ? "Muted" : "Live"}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
