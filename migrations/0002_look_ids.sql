-- Looks are now ids from the look library (for example "adult-03"), picked by the page.
-- The members table has no guest rows yet, so it is rebuilt instead of copied.
DROP TRIGGER members_insert;
DROP TRIGGER members_update;
DROP TRIGGER members_delete;
DROP INDEX members_family_id;
DROP TABLE members;

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('adult', 'kid', 'baby', 'dog', 'cat')),
  look TEXT NOT NULL DEFAULT '',
  bubble TEXT NOT NULL DEFAULT '',
  bubble_hidden INTEGER NOT NULL DEFAULT 0,
  UNIQUE (family_id, position)
);

CREATE INDEX members_family_id ON members (family_id);

ALTER TABLE families ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER members_insert AFTER INSERT ON members BEGIN UPDATE party_version SET version = version + 1; END;
CREATE TRIGGER members_update AFTER UPDATE ON members BEGIN UPDATE party_version SET version = version + 1; END;
CREATE TRIGGER members_delete AFTER DELETE ON members BEGIN UPDATE party_version SET version = version + 1; END;
