-- Which hidden extras each family plays with: one row for each family and egg, with a count.
-- No party_version trigger: a tap must not make every page fetch the party again.
CREATE TABLE interactions (
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  egg TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  first_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (family_id, egg)
);
