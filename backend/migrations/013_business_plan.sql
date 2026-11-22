-- A Business plan between Pro and Organization, highlighted as "Most popular". Pro becomes the smaller step.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;

INSERT INTO plans (id, name, price_month, limits, sort, featured) VALUES
  ('business', 'Business', 59, '{"websites": 10, "pages": 50, "members": 10, "storage_mb": 10000, "submissions_month": -1, "custom_domain": true}', 3, true)
ON CONFLICT (id) DO NOTHING;

UPDATE plans SET limits = '{"websites": 3, "pages": 15, "members": 2, "storage_mb": 2000, "submissions_month": -1, "custom_domain": false}', featured = false
WHERE id = 'pro';
UPDATE plans SET sort = 4, featured = false WHERE id = 'organization';
