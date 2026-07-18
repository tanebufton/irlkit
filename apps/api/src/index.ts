import Fastify from "fastify";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { obs } from "./obs.js";
import { authenticate } from "./auth.js";
import { hub } from "./ws.js";
import { startStatsLoop } from "./stats.js";
import { authRoutes } from "./routes/auth.js";
import { controlRoutes } from "./routes/control.js";
import { studioRoutes } from "./routes/studio.js";
import { tokenRoutes } from "./routes/tokens.js";

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

await app.register(cookie);
await app.register(websocket);

app.get("/health", async () => ({ ok: true, obsConnected: obs.connected }));

await app.register(authRoutes, { prefix: "/api" });
await app.register(controlRoutes, { prefix: "/api" });
await app.register(studioRoutes, { prefix: "/api" });
await app.register(tokenRoutes, { prefix: "/api" });

// Live status stream. Auth via session cookie (owner) or ?token= (operator).
app.register(async (scoped) => {
  scoped.get("/ws", { websocket: true }, (socket, req) => {
    const token = (req.query as { token?: string })?.token;
    if (token) req.headers.authorization = `Bearer ${token}`;
    if (!authenticate(req)) {
      socket.close(1008, "unauthorized");
      return;
    }
    hub.add(socket);
  });
});

await obs.start();
const statsTimer = startStatsLoop();

const shutdown = async () => {
  clearInterval(statsTimer);
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ host: "0.0.0.0", port: config.port });
app.log.info(`irlkit api listening on :${config.port}`);
