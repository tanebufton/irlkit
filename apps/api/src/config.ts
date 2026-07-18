// Central env config. Fail fast on anything security-critical that's missing.
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.API_PORT ?? 3000),
  sessionSecret: req("SESSION_SECRET"),

  owner: {
    username: process.env.OWNER_USERNAME ?? "owner",
    password: req("OWNER_PASSWORD"),
  },

  obs: {
    url: process.env.OBS_WS_URL ?? "ws://obs:4455",
    password: req("OBS_WS_PASSWORD"),
    // What OBS pulls as its main feed — kept in sync with the SLS ingest URL.
    ingestSrtUrl: `srt://sls:4001?streamid=play/live/${process.env.STREAM_KEY ?? "feed"}&latency=2000`,
  },

  slsStatsUrl: process.env.SLS_STATS_URL ?? "http://sls:8181/stats",
  mediamtxApiUrl: process.env.MEDIAMTX_API_URL ?? "http://mediamtx:9997",

  databasePath: process.env.DATABASE_PATH ?? "/data/irlkit.sqlite",

  // Canonical scene names irlkit manages.
  scenes: {
    starting: "Starting Soon",
    live: "IRL",
    brb: "BRB",
  },
} as const;
