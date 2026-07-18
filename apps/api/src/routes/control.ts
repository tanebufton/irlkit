// Control routes — the actions the remote panel exposes. Reads need only a
// valid principal; state-changing actions require the matching operator scope.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { obs } from "../obs.js";
import { requireAuth, requireScope } from "../auth.js";

export async function controlRoutes(app: FastifyInstance) {
  app.get("/control/scenes", { preHandler: requireAuth }, async () => {
    const { currentProgramSceneName, scenes } = await obs.getSceneList();
    return { current: currentProgramSceneName, scenes: scenes.map((s) => s.sceneName) };
  });

  app.post("/control/scene", { preHandler: requireScope("scene:switch") }, async (req, reply) => {
    const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "name required" });
    const p = req.principal!;
    obs.markPendingActor(p.role === "owner" ? "owner" : `operator:${p.label ?? p.jti}`);
    await obs.setScene(body.data.name);
    return { ok: true, current: body.data.name };
  });

  app.get("/control/stream", { preHandler: requireAuth }, async () => {
    const s = await obs.streamStatus();
    return { active: s.outputActive, durationSec: Math.round(s.outputDuration / 1000) };
  });

  app.post("/control/stream/start", { preHandler: requireScope("stream:toggle") }, async () => {
    await obs.startStream();
    return { ok: true };
  });

  app.post("/control/stream/stop", { preHandler: requireScope("stream:toggle") }, async () => {
    await obs.stopStream();
    return { ok: true };
  });

  app.get("/control/audio", { preHandler: requireAuth }, async () => {
    const names = await obs.getAudioInputs();
    const rows = await Promise.all(
      names.map(async (name) => ({ name, muted: (await obs.getMute(name)).inputMuted })),
    );
    return { inputs: rows };
  });

  app.post("/control/audio/mute", { preHandler: requireScope("audio:mute") }, async (req, reply) => {
    const body = z.object({ name: z.string().min(1), muted: z.boolean() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "name and muted required" });
    await obs.setMute(body.data.name, body.data.muted);
    return { ok: true };
  });

  // Low-fps JPEG preview — the screenshot fallback for the control panel when a
  // WebRTC preview isn't wired up.
  app.get("/control/preview.jpg", { preHandler: requireAuth }, async (req, reply) => {
    const { currentProgramSceneName } = await obs.getSceneList();
    const shot = await obs.screenshot(currentProgramSceneName, 640);
    const b64 = shot.imageData.replace(/^data:image\/\w+;base64,/, "");
    reply.header("Content-Type", "image/jpeg").header("Cache-Control", "no-store");
    return reply.send(Buffer.from(b64, "base64"));
  });
}
