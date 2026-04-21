CREATE TABLE bundles (
  id          TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX idx_bundles_expires ON bundles(expires_at);

CREATE TABLE items (
  id          TEXT PRIMARY KEY,
  bundle_id   TEXT NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('file', 'snippet')),
  name        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  mime        TEXT,
  language    TEXT,
  content     TEXT,
  r2_key      TEXT,
  position    INTEGER NOT NULL
);

CREATE INDEX idx_items_bundle ON items(bundle_id);
