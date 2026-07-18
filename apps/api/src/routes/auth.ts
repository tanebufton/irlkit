// Owner login/logout and principal introspection.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  SESSION_COOKIE,
  authenticate,
  issueOwnerSession,
  verifyOwnerLogin,
} from "../auth.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (req, reply) => {
    const body = z
      .object({ username: z.string(), password: z.string() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "username and password required" });

    if (!verifyOwnerLogin(body.data.username, body.data.password)) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    const token = issueOwnerSession();
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 7 * 24 * 3600,
    });
    return { ok: true, role: "owner" };
  });

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  // Both the studio and the panel call this on load to learn who they are and
  // what they're allowed to do.
  app.get("/auth/me", async (req) => {
    const p = authenticate(req);
    if (!p) return { authenticated: false };
    return { authenticated: true, role: p.role, scopes: p.scopes, label: p.label ?? null };
  });
}
