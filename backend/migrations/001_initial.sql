-- SciProspect application tables. Runs inside the application schema (search_path).

-- Key/value settings, e.g. the root administrator password hash.
CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per account (license). Organisation members stay inside `data`.
CREATE TABLE IF NOT EXISTS accounts (
    license_key TEXT PRIMARY KEY,
    email       TEXT NOT NULL DEFAULT '',
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounts_email_idx ON accounts (lower(email));

-- Login sessions. Only a SHA-256 hash of each token is stored.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    data        JSONB NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS conferences (
    conference_id TEXT PRIMARY KEY,
    owner_email   TEXT NOT NULL,
    data          JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conferences_owner_idx ON conferences (lower(owner_email));

-- Websites. `document` holds pages, sections, theme and SEO settings.
CREATE TABLE IF NOT EXISTS websites (
    site_id        TEXT PRIMARY KEY,
    owner_email    TEXT NOT NULL,
    slug           TEXT NOT NULL UNIQUE,
    custom_domain  TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'draft',
    conference_id  TEXT,
    document       JSONB NOT NULL,
    compiled_html  TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS websites_owner_idx ON websites (lower(owner_email));
CREATE INDEX IF NOT EXISTS websites_conference_idx ON websites (conference_id);
CREATE UNIQUE INDEX IF NOT EXISTS websites_domain_idx ON websites (lower(custom_domain)) WHERE custom_domain <> '';

-- Earlier versions of each website, kept on every save (newest 50 per site).
CREATE TABLE IF NOT EXISTS website_versions (
    id          BIGSERIAL PRIMARY KEY,
    site_id     TEXT NOT NULL REFERENCES websites (site_id) ON DELETE CASCADE,
    document    JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS website_versions_site_idx ON website_versions (site_id, id DESC);

-- Uploaded images. The file itself stays in server storage; this is its record.
CREATE TABLE IF NOT EXISTS media (
    id          TEXT PRIMARY KEY,
    site_id     TEXT NOT NULL REFERENCES websites (site_id) ON DELETE CASCADE,
    mime        TEXT NOT NULL,
    size_bytes  INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_site_idx ON media (site_id);
