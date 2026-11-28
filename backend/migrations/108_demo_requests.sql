-- "Book a demo" requests from the public website. The team replies by email and marks each one as handled.
CREATE TABLE IF NOT EXISTS demo_requests (
    id           BIGSERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL,
    organization TEXT NOT NULL DEFAULT '',
    interest     TEXT NOT NULL DEFAULT '',
    message      TEXT NOT NULL DEFAULT '',
    times        TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'done')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demo_requests_created ON demo_requests (created_at DESC);
