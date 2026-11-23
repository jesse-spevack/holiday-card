-- The error log: one row for each failed API request (source "worker") and each failure that the page reports
-- (source "page", POST /api/log). `pnpm errors` reads it. src/log.ts deletes rows older than 30 days, and keeps
-- at most 5000 rows. It holds codes, field names, and booleans only: no address, no name, no token, no IP.
CREATE TABLE errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
  source TEXT NOT NULL CHECK (source IN ('page', 'worker')),
  route TEXT NOT NULL,
  code TEXT NOT NULL,
  status INTEGER,
  detail TEXT NOT NULL DEFAULT '',
  ua TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  family_id TEXT,
  version TEXT NOT NULL DEFAULT ''
);
CREATE INDEX errors_at ON errors (at);
