-- Visitor submissions from website forms (contact, registration, abstract, ...).
CREATE TABLE IF NOT EXISTS form_submissions (
    id          BIGSERIAL PRIMARY KEY,
    site_id     TEXT NOT NULL REFERENCES websites (site_id) ON DELETE CASCADE,
    form_id     TEXT NOT NULL,
    form_type   TEXT NOT NULL,
    page_id     TEXT,
    data        JSONB NOT NULL,
    status      TEXT NOT NULL DEFAULT 'new',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_submissions_site_idx ON form_submissions (site_id, created_at DESC);
