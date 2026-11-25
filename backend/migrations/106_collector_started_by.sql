-- Team members collect into their organisation's shared workspace. Each run remembers who started it, so the daily limit is per user.
-- Empty = the account owner (all earlier runs).
ALTER TABLE collector_runs ADD COLUMN IF NOT EXISTS started_by TEXT NOT NULL DEFAULT '';
