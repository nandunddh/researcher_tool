-- Website plans (SciStudio limits). -1 = unlimited. Root edits them on the Plans page.
CREATE TABLE IF NOT EXISTS plans (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    price_month NUMERIC(10, 2) NOT NULL DEFAULT 0,
    limits      JSONB NOT NULL,
    sort        INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO plans (id, name, price_month, limits, sort) VALUES
  ('free', 'Free', 0, '{"websites": 1, "pages": 3, "members": 0, "storage_mb": 100, "submissions_month": 50, "custom_domain": false}', 1),
  ('pro', 'Pro', 29, '{"websites": 5, "pages": 20, "members": 3, "storage_mb": 2000, "submissions_month": 2000, "custom_domain": true}', 2),
  ('organization', 'Organization', 99, '{"websites": 25, "pages": 50, "members": 25, "storage_mb": 10000, "submissions_month": 20000, "custom_domain": true}', 3)
ON CONFLICT (id) DO NOTHING;
