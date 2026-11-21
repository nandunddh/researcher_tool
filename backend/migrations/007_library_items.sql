-- Designs imported by the root admin (sections and templates), shown to every workspace.
CREATE TABLE IF NOT EXISTS library_items (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL CHECK (kind IN ('section', 'template')),
    name        TEXT NOT NULL,
    payload     JSONB NOT NULL,
    created_by  TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
