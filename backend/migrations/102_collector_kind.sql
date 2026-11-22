-- What a collection searches: research publications (OpenAlex, bioRxiv) or NIH-funded grant PIs (NIH RePORTER).
ALTER TABLE collector_runs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'publications';
ALTER TABLE collector_runs DROP CONSTRAINT IF EXISTS collector_runs_kind_check;
ALTER TABLE collector_runs ADD CONSTRAINT collector_runs_kind_check CHECK (kind IN ('publications','nih'));
