// Studio routes — owner-only scene/source editing and output configuration.
// This is the API behind the browser scene editor.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { obs } from "../obs.js";
import { requireOwner } from "../auth.js";
import { setSetting } from "../db.js";

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
