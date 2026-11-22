CREATE TABLE families (
  id TEXT PRIMARY KEY,
  household TEXT NOT NULL,
  family_text TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('adult', 'kid', 'baby', 'dog', 'cat')),
  look INTEGER NOT NULL DEFAULT 0,
  bubble TEXT NOT NULL DEFAULT '',
  bubble_hidden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX members_family_id ON members (family_id);

-- Pages poll the version and fetch the full party only when it changes.
CREATE TABLE party_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);

INSERT INTO party_version (id, version) VALUES (1, 0);

CREATE TRIGGER families_insert AFTER INSERT ON families BEGIN UPDATE party_version SET version = version + 1; END;
CREATE TRIGGER families_update AFTER UPDATE ON families BEGIN UPDATE party_version SET version = version + 1; END;
CREATE TRIGGER families_delete AFTER DELETE ON families BEGIN UPDATE party_version SET version = version + 1; END;
CREATE TRIGGER members_insert AFTER INSERT ON members BEGIN UPDATE party_version SET version = version + 1; END;
CREATE TRIGGER members_update AFTER UPDATE ON members BEGIN UPDATE party_version SET version = version + 1; END;
CREATE TRIGGER members_delete AFTER DELETE ON members BEGIN UPDATE party_version SET version = version + 1; END;
