// Studio routes — owner-only scene/source editing and output configuration.
// This is the API behind the browser scene editor.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { obs } from "../obs.js";
import { requireOwner } from "../auth.js";
import { getSetting, listSceneChanges, setSetting } from "../db.js";

// Friendly source types → OBS input kinds (Linux / OBS 30).
const KIND_MAP: Record<string, string> = {
  media: "ffmpeg_source",
  browser: "browser_source",
  image: "image_source",
  text: "text_ft2_source_v2",
  color: "color_source_v3",
};

export async function studioRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireOwner);

  // Ingest endpoints + stream key for the owner's encoder. Host is derived
  // from the request itself (whatever domain/IP is actually reaching this
  // box right now) rather than a configured value, so it's never stale.
  app.get("/studio/connection-info", async (req) => {
    const host = req.hostname;
    const { streamKey, srtlaPort, srtPort, rtmpPort } = config.ingest;
    return {
      streamKey,
      srtla: { url: `udp://${host}:${srtlaPort}` },
      srt: {
        url: `srt://${host}:${srtPort}?streamid=publish/live/${streamKey}&latency=2000`,
      },
      // MediaMTX authenticates RTMP publishers via user/pass query params
      // (confirmed against its own docs) — not a path-appended "stream key"
      // like Twitch/YouTube. One full URL to paste into the app's
      // Server/URL field; any separate "Stream Key" field should stay blank.
      rtmp: { url: `rtmp://${host}:${rtmpPort}/ingest?user=publish&pass=${streamKey}` },
    };
  });

  // Scene-change history — sourced from OBS's own event stream (see obs.ts),
  // so it includes NOALBS's automatic switches, not just ones made here.
  app.get("/studio/audit-log", async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(500).optional() }).safeParse(req.query);
    return { entries: listSceneChanges(q.success ? q.data.limit : undefined) };
  });

  app.post("/studio/scene", async (req, reply) => {
    const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "name required" });
    await obs.createScene(body.data.name);
    return { ok: true };
  });

  app.delete("/studio/scene", async (req, reply) => {
    const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "name required" });
    await obs.removeScene(body.data.name);
    return { ok: true };
  });

  app.get("/studio/inputs", async () => {
    return obs.getInputList();
  });

  app.post("/studio/input", async (req, reply) => {
    const body = z
      .object({
        sceneName: z.string().min(1),
        inputName: z.string().min(1),
        type: z.enum(["media", "browser", "image", "text", "color"]),
        settings: z.record(z.unknown()).default({}),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    const kind = KIND_MAP[body.data.type];
    await obs.createInput(body.data.sceneName, body.data.inputName, kind, body.data.settings);
    return { ok: true };
  });

  app.patch("/studio/input", async (req, reply) => {
    const body = z
      .object({ inputName: z.string().min(1), settings: z.record(z.unknown()) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    await obs.setInputSettings(body.data.inputName, body.data.settings);
    return { ok: true };
  });

  // What's actually placed in a scene (vs. /studio/input, which creates a new
  // source) — list it, remove one, or reposition/rescale one.
  app.get("/studio/scene-items", async (req, reply) => {
    const q = z.object({ sceneName: z.string().min(1) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "sceneName required" });
    return obs.getSceneItems(q.data.sceneName);
  });

  app.delete("/studio/scene-item", async (req, reply) => {
    const body = z
      .object({ sceneName: z.string().min(1), sceneItemId: z.number().int() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    await obs.removeSceneItem(body.data.sceneName, body.data.sceneItemId);
    return { ok: true };
  });

  app.patch("/studio/scene-item/transform", async (req, reply) => {
    const body = z
      .object({
        sceneName: z.string().min(1),
        sceneItemId: z.number().int(),
        positionX: z.number().optional(),
        positionY: z.number().optional(),
        scaleX: z.number().optional(),
        scaleY: z.number().optional(),
        rotation: z.number().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    const { sceneName, sceneItemId, ...transform } = body.data;
    await obs.setSceneItemTransform(sceneName, sceneItemId, transform);
    return { ok: true };
  });

  // Current destination/encoder settings, so the studio can populate its form
  // on load instead of always showing blank fields after a refresh.
  app.get("/studio/destination", async () => {
    return {
      server: getSetting("dest_rtmp_url") ?? "",
      key: getSetting("dest_stream_key") ?? "",
    };
  });

  app.get("/studio/encoder", async () => {
    return {
      preset: getSetting("encoder_preset") ?? "balanced",
      bitrateKbps: Number(getSetting("output_bitrate_kbps") ?? 6000),
    };
  });

  // Where the finished program is sent. Applied to OBS immediately and persisted
  // so it survives restarts.
  app.post("/studio/destination", async (req, reply) => {
    const body = z
      .object({ server: z.string().min(1), key: z.string().default("") })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    setSetting("dest_rtmp_url", body.data.server);
    setSetting("dest_stream_key", body.data.key);
    await obs.setDestination(body.data.server, body.data.key);
    return { ok: true };
  });

  // Encoder preset/bitrate live in the OBS profile; persisted here and applied
  // on the next OBS (container) restart.
  app.post("/studio/encoder", async (req, reply) => {
    const body = z
      .object({
        preset: z.enum(["low-cpu", "balanced", "quality"]).optional(),
        bitrateKbps: z.number().int().min(500).max(20000).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    if (body.data.preset) setSetting("encoder_preset", body.data.preset);
    if (body.data.bitrateKbps) setSetting("output_bitrate_kbps", String(body.data.bitrateKbps));
    return { ok: true, note: "applies on OBS restart" };
  });
}
