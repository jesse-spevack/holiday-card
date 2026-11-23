-- A custom link for a friend whose address Jesse has (pnpm invite). The address lives only in the Sheet, never here.
-- id is also the family_id of the friend's Sheet row, and the id of the family after the friend confirms.
-- The link holds a random token. D1 keeps only its hash, and the family that the friend makes gets the same hash,
-- so the link opens the party as that family in any browser.
-- No party_version trigger: an invite is not at the party until the friend confirms.
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  envelope TEXT NOT NULL,
  family_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT
);
