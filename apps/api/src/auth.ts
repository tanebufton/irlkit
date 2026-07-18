// Auth: owner login (env credentials) + scoped operator tokens.
//
// Two principal types, both carried as JWTs signed with SESSION_SECRET:
//   owner    — full access; obtained by logging in with the env credentials.
//   operator — a share link the owner hands to a moderator; carries a subset of
//              capabilities and an optional expiry, and is revocable by `jti`.
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";
import { db, OperatorTokenRow } from "./db.js";

export const SESSION_COOKIE = "irlkit_session";

// Capabilities an operator link can be granted. The remote control panel needs
// these; the studio editor and token management are owner-only (not scopes).
export const ALL_SCOPES = ["scene:switch", "stream:toggle", "audio:mute"] as const;
export type Scope = (typeof ALL_SCOPES)[number];

export interface Principal {
  role: "owner" | "operator";
  scopes: Scope[];
  jti?: string;
  label?: string;
}

// ── Owner credentials ──────────────────────────────────────────────────────
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifyOwnerLogin(username: string, password: string): boolean {
  return (
    safeEqual(username, config.owner.username) &&
    safeEqual(password, config.owner.password)
  );
}

export function issueOwnerSession(): string {
  return jwt.sign({ role: "owner" }, config.sessionSecret, { expiresIn: "7d" });
}

// ── Operator tokens ─────────────────────────────────────────────────────────
export function createOperatorToken(
  label: string,
  scopes: Scope[],
  ttlHours?: number,
): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = ttlHours ? now + ttlHours * 3600_000 : null;

  db.prepare(
    `INSERT INTO operator_tokens (jti, label, scopes, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(jti, label, JSON.stringify(scopes), now, expiresAt);

  const opts: jwt.SignOptions = { jwtid: jti };
  if (ttlHours) opts.expiresIn = `${ttlHours}h`;
  const token = jwt.sign({ role: "operator", scopes }, config.sessionSecret, opts);
  return { token, jti };
}

export function revokeOperatorToken(jti: string): void {
  db.prepare("UPDATE operator_tokens SET revoked_at = ? WHERE jti = ?").run(
    Date.now(),
    jti,
  );
}

// ── Request authentication ──────────────────────────────────────────────────
function extractToken(req: FastifyRequest): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  return cookie;
}

function principalFromToken(token: string): Principal | null {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.sessionSecret) as jwt.JwtPayload;
  } catch {
    return null;
  }

  if (payload.role === "owner") {
    return { role: "owner", scopes: [...ALL_SCOPES] };
  }

  if (payload.role === "operator" && typeof payload.jti === "string") {
    // Operator tokens are revocable — check the DB row is still live.
    const row = db
      .prepare("SELECT * FROM operator_tokens WHERE jti = ?")
      .get(payload.jti) as OperatorTokenRow | undefined;
    if (!row || row.revoked_at) return null;
    if (row.expires_at && row.expires_at < Date.now()) return null;
    return {
      role: "operator",
      scopes: JSON.parse(row.scopes) as Scope[],
      jti: row.jti,
      label: row.label,
    };
  }
  return null;
}

// Attaches req.principal; call from a preHandler. Returns null principal when
// unauthenticated (route guards decide whether that's fatal).
declare module "fastify" {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

export function authenticate(req: FastifyRequest): Principal | null {
  const token = extractToken(req);
  const principal = token ? principalFromToken(token) : null;
  req.principal = principal;
  return principal;
}

// preHandler guards. These must resolve to void (not the reply) so Fastify's
// hook typing is satisfied — hence the explicit `return;` after sending.
export function requireAuth(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
  if (!authenticate(req)) {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
  done();
}

export function requireOwner(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
  const p = authenticate(req);
  if (!p) {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
  if (p.role !== "owner") {
    reply.code(403).send({ error: "owner only" });
    return;
  }
  done();
}

export function requireScope(scope: Scope) {
  return (req: FastifyRequest, reply: FastifyReply, done: () => void): void => {
    const p = authenticate(req);
    if (!p) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    if (!p.scopes.includes(scope)) {
      reply.code(403).send({ error: `missing scope ${scope}` });
      return;
    }
    done();
  };
}
