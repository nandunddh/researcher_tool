CREATE TABLE collector_runs (
    owner_key text NOT NULL,
    id uuid NOT NULL,
    topic text NOT NULL,
    target integer NOT NULL CHECK (target BETWEEN 1 AND 50000),
    min_score integer NOT NULL CHECK (min_score BETWEEN 0 AND 100),
    from_date date NOT NULL,
    to_date date NOT NULL CHECK (to_date >= from_date),
    status text NOT NULL CHECK (status IN ('running','stopped','completed','partial','interrupted','failed')),
    source text NOT NULL DEFAULT '',
    source_errors jsonb NOT NULL DEFAULT '[]',
    collected integer NOT NULL DEFAULT 0 CHECK (collected BETWEEN 0 AND target),
    started_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_key, id)
);
CREATE UNIQUE INDEX collector_one_active ON collector_runs(owner_key) WHERE status='running';
CREATE INDEX collector_history ON collector_runs(owner_key, started_at DESC);
CREATE TABLE collector_contacts (
    owner_key text NOT NULL,
    email text NOT NULL,
    record jsonb NOT NULL,
    PRIMARY KEY (owner_key, email)
);
CREATE TABLE collector_evidence (
    owner_key text NOT NULL,
    email text NOT NULL,
    fingerprint text NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (owner_key,email,fingerprint),
    FOREIGN KEY (owner_key,email) REFERENCES collector_contacts(owner_key,email)
);
CREATE TABLE collector_results (
    owner_key text NOT NULL,
    run_id uuid NOT NULL,
    email text NOT NULL,
    record jsonb NOT NULL,
    PRIMARY KEY (owner_key,run_id,email),
    FOREIGN KEY (owner_key,run_id) REFERENCES collector_runs(owner_key,id),
    FOREIGN KEY (owner_key,email) REFERENCES collector_contacts(owner_key,email)
);
