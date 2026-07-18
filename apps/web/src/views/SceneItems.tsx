// What's actually placed in a scene — list, remove, and reposition/rescale
// existing sources. Numeric fields rather than drag-and-drop: the studio's
// only preview is a periodically-refreshed JPEG screenshot, not an
// interactive canvas, so true drag repositioning would need a much larger
// rework (an actual live canvas to click/drag against) — a separate project
// from this, not a corner cut here.
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button, Card } from "../components/ui";

type Transform = { positionX: number; positionY: number; scaleX: number; scaleY: number; rotation: number };
type SceneItem = {
  sceneItemId: number;
  sourceName: string;
  inputKind: string | null;
  sceneItemTransform: Transform;
};

function TransformFields({
  value,
  onSave,
  busy,
}: {
  value: Transform;
  onSave: (t: Partial<Transform>) => void;
  busy: boolean;
}) {
  const [x, setX] = useState(value.positionX);
  const [y, setY] = useState(value.positionY);
  const [scale, setScale] = useState(value.scaleX);
  const [rotation, setRotation] = useState(value.rotation);

  return (
    <div className="grid grid-cols-4 gap-2 mt-2">
      <label className="text-xs text-slate-500 col-span-4 sm:col-span-1 sm:self-center">Position / scale / rotation</label>
      <input
        type="number"
        className="rounded-lg bg-ink border border-edge px-2 py-1.5 text-sm"
        value={x}
        onChange={(e) => setX(Number(e.target.value))}
        placeholder="X"
      />
      <input
        type="number"
        className="rounded-lg bg-ink border border-edge px-2 py-1.5 text-sm"
        value={y}
        onChange={(e) => setY(Number(e.target.value))}
        placeholder="Y"
      />
      <input
        type="number"
        step="0.05"
        className="rounded-lg bg-ink border border-edge px-2 py-1.5 text-sm"
        value={scale}
        onChange={(e) => setScale(Number(e.target.value))}
        placeholder="Scale"
      />
      <input
        type="number"
        className="rounded-lg bg-ink border border-edge px-2 py-1.5 text-sm"
        value={rotation}
        onChange={(e) => setRotation(Number(e.target.value))}
        placeholder="°"
      />
      <Button
        variant="default"
        disabled={busy}
        className="col-span-4 py-1.5 text-sm"
        onClick={() => onSave({ positionX: x, positionY: y, scaleX: scale, scaleY: scale, rotation })}
      >
        Apply
      </Button>
    </div>
  );
}

export function SceneItems({ sceneName }: { sceneName: string }) {
  const [items, setItems] = useState<SceneItem[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!sceneName) {
      setItems(null);
      return;
    }
    try {
      setItems((await api.sceneItems(sceneName)).sceneItems);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
    setExpanded(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneName]);

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

  if (!sceneName) return null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-400">Sources in "{sceneName}"</h2>
        <Button variant="ghost" className="py-1.5 px-3 text-sm" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      {error && <p className="text-live text-sm mb-2">{error}</p>}
      {items && items.length === 0 && <p className="text-slate-500 text-sm">No sources in this scene yet.</p>}
      <div className="space-y-2">
        {items?.map((item) => (
          <div key={item.sceneItemId} className="rounded-lg bg-ink/60 px-3 py-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-left text-sm truncate flex-1"
                onClick={() => setExpanded((e) => (e === item.sceneItemId ? null : item.sceneItemId))}
              >
                <span className="font-medium">{item.sourceName}</span>
                {item.inputKind && <span className="text-slate-500 ml-2 text-xs">{item.inputKind}</span>}
              </button>
              <Button
                variant="ghost"
                disabled={busy}
                title="Remove from scene"
                onClick={() => run(() => api.removeSceneItem(sceneName, item.sceneItemId))}
                className="px-3 py-1 text-slate-500 hover:text-live text-sm"
              >
                ✕
              </Button>
            </div>
            {expanded === item.sceneItemId && (
              <TransformFields
                value={item.sceneItemTransform}
                busy={busy}
                onSave={(t) => run(() => api.setSceneItemTransform(sceneName, item.sceneItemId, t))}
              />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
