-- Which publication sources a collection (or saved search) uses. Empty means all of them, so existing rows keep working.
ALTER TABLE collector_runs ADD COLUMN IF NOT EXISTS sources TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE collector_saved_searches ADD COLUMN IF NOT EXISTS sources TEXT[] NOT NULL DEFAULT '{}';
