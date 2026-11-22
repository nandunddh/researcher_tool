-- Optional collection filters: ISO country code of the researcher's institution, and institution name text.
ALTER TABLE collector_runs ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';
ALTER TABLE collector_runs ADD COLUMN IF NOT EXISTS institution text NOT NULL DEFAULT '';
