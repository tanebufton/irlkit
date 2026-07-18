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

  -- Scene-change history. Populated from OBS's own CurrentProgramSceneChanged
  -- event (catches every switch regardless of source — studio, remote panel,
  -- NOALBS auto-switching, or OBS itself), not from the API's own switch
  -- route, so nothing is missed just because it didn't go through our POST.
  CREATE TABLE IF NOT EXISTS scene_changes (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      INTEGER NOT NULL,
    scene   TEXT NOT NULL,
    actor   TEXT NOT NULL              -- "owner" | "operator:<label>" | "auto"
  );
  CREATE INDEX IF NOT EXISTS scene_changes_ts ON scene_changes(ts DESC);
`);

const MAX_SCENE_CHANGE_ROWS = 500;

export function logSceneChange(scene: string, actor: string): void {
  db.prepare("INSERT INTO scene_changes (ts, scene, actor) VALUES (?, ?, ?)").run(
    Date.now(),
    scene,
    actor,
  );
  // Keep the table from growing unbounded on a long-running appliance.
  db.prepare(
    `DELETE FROM scene_changes WHERE id NOT IN (
       SELECT id FROM scene_changes ORDER BY id DESC LIMIT ?
     )`,
  ).run(MAX_SCENE_CHANGE_ROWS);
}

export interface SceneChangeRow {
  id: number;
  ts: number;
  scene: string;
  actor: string;
}

export function listSceneChanges(limit = 100): SceneChangeRow[] {
  return db
    .prepare("SELECT * FROM scene_changes ORDER BY id DESC LIMIT ?")
    .all(limit) as SceneChangeRow[];
}

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
