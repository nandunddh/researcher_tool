-- One receipt number sequence per website (AIML-2027-0001, 0002, ...).
CREATE TABLE IF NOT EXISTS receipt_counters (
    site_id  TEXT PRIMARY KEY REFERENCES websites (site_id) ON DELETE CASCADE,
    last     INTEGER NOT NULL DEFAULT 0
);
