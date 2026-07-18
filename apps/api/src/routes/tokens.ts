// Operator token management (owner-only). The owner mints scoped share links a
// moderator opens to run the remote control panel.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, OperatorTokenRow } from "../db.js";
import {
  ALL_SCOPES,
  createOperatorToken,
  requireOwner,
  revokeOperatorToken,
} from "../auth.js";

export async function tokenRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireOwner);

  app.get("/tokens", async () => {
    const rows = db
      .prepare("SELECT * FROM operator_tokens ORDER BY created_at DESC")
      .all() as OperatorTokenRow[];
    return {
      tokens: rows.map((r) => ({
        jti: r.jti,
        label: r.label,
        scopes: JSON.parse(r.scopes),
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        revoked: !!r.revoked_at,
      })),
    };
  });

  app.post("/tokens", async (req, reply) => {
    const body = z
      .object({
        label: z.string().min(1).max(80),
        scopes: z.array(z.enum(ALL_SCOPES)).min(1),
        ttlHours: z.number().int().min(1).max(24 * 90).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });

    const { token } = createOperatorToken(body.data.label, body.data.scopes, body.data.ttlHours);
    // The moderator opens the panel with the token in the URL fragment.
    return { token, shareUrl: `/panel#token=${token}` };
  });

  app.delete("/tokens/:jti", async (req) => {
    const { jti } = req.params as { jti: string };
    revokeOperatorToken(jti);
    return { ok: true };
  });
}
