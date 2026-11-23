-- Saved collector searches, optionally run on a schedule. The date window is stored as a length in days
-- and always ends on the day of the run, so a scheduled search keeps finding recent researchers.
CREATE TABLE IF NOT EXISTS collector_saved_searches (
    owner_key text NOT NULL,
    id uuid NOT NULL,
    name text NOT NULL,
    kind text NOT NULL DEFAULT 'publications' CHECK (kind IN ('publications','nih')),
    topic text NOT NULL,
    target integer NOT NULL CHECK (target BETWEEN 1 AND 50000),
    min_score integer NOT NULL CHECK (min_score BETWEEN 0 AND 100),
    window_days integer NOT NULL CHECK (window_days BETWEEN 0 AND 3660),
    country text NOT NULL DEFAULT '',
    institution text NOT NULL DEFAULT '',
    frequency text NOT NULL DEFAULT 'off' CHECK (frequency IN ('off','daily','weekly')),
    license_key text NOT NULL DEFAULT '',
    next_run_at timestamptz,
    last_run_id uuid,
    last_run_at timestamptz,
    last_error text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_key, id)
);
CREATE INDEX IF NOT EXISTS collector_saved_due ON collector_saved_searches (next_run_at) WHERE frequency <> 'off';
