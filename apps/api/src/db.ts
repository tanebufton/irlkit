// SQLite via better-sqlite3. An appliance doesn't need a migration framework —
// the schema is tiny and created idempotently on boot.
import Database from "better-sqlite3";
import { config } from "./config.js";

export const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");

db.exec(`
  -- Scoped operator/moderator access tokens (streamremote-style share links).
  -- The JWT is what's handed out; this row lets the owner list & revoke them.
  CREATE TABLE IF NOT EXISTS operator_tokens (
    jti         TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    scopes      TEXT NOT NULL,           -- JSON array of capability strings
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER,                 -- null = no expiry
    revoked_at  INTEGER
  );

  -- Persisted appliance settings the studio can change at runtime (encoder
  -- preset, destination, etc.), overriding the boot-time env defaults.
  CREATE TABLE IF NOT EXISTS settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  );
`);

export function getSetting(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export interface OperatorTokenRow {
  jti: string;
  label: string;
  scopes: string;
  created_at: number;
  expires_at: number | null;
  revoked_at: number | null;
}
