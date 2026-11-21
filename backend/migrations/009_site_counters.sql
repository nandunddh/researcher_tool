-- Numbered things per website (abstract submissions ABS-0001, ...).
CREATE TABLE IF NOT EXISTS site_counters (
    site_id  TEXT NOT NULL REFERENCES websites (site_id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    last     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (site_id, name)
);
