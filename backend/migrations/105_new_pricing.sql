-- New pricing: a 7-day trial (no permanent free plan), Basic / Pro / Ultra, a contact-sales Custom plan, monthly and annual prices.
-- Old plans stay as "retired" rows: nobody can buy them any more, but an account already on one keeps its limits until it changes plan.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_year NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_price_id_year TEXT NOT NULL DEFAULT '';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'paid';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS retired BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_kind_check;
ALTER TABLE plans ADD CONSTRAINT plans_kind_check CHECK (kind IN ('trial', 'paid', 'custom'));

ALTER TABLE checkout_sessions ADD COLUMN IF NOT EXISTS billing_interval TEXT NOT NULL DEFAULT 'month';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_interval TEXT NOT NULL DEFAULT 'month';

UPDATE plans SET retired = true, featured = false, sort = CASE id WHEN 'free' THEN 10 WHEN 'business' THEN 11 ELSE 12 END
WHERE id IN ('free', 'business', 'organization');

-- limits: storage in MB (1 GB = 1000 MB), daily_contacts is per user, members = included users - 1 (the owner is the first user).
INSERT INTO plans (id, name, price_month, price_year, kind, limits, sort, featured) VALUES
  ('trial', 'Free trial', 0, 0, 'trial',
   '{"websites": 3, "pages": 5, "members": 0, "storage_mb": 1000, "data_storage_mb": 2000, "submissions_month": -1, "custom_domain": false, "daily_contacts": 1000}', 0, false),
  ('basic', 'Basic', 39, 390, 'paid',
   '{"websites": 3, "pages": 5, "members": 1, "storage_mb": 4000, "data_storage_mb": 10000, "submissions_month": -1, "custom_domain": false, "daily_contacts": 3000}', 1, false),
  ('ultra', 'Ultra', 199, 1990, 'paid',
   '{"websites": 10, "pages": 25, "members": 9, "storage_mb": 20000, "data_storage_mb": 50000, "submissions_month": -1, "custom_domain": true, "daily_contacts": 10000}', 3, false),
  ('custom', 'Custom', 0, 0, 'custom',
   '{"websites": -1, "pages": -1, "members": -1, "storage_mb": -1, "data_storage_mb": -1, "submissions_month": -1, "custom_domain": true, "daily_contacts": -1}', 4, false)
ON CONFLICT (id) DO NOTHING;

-- Pro keeps its id (existing Pro accounts move to the new Pro limits) and becomes the middle plan.
UPDATE plans SET name = 'Pro', price_month = 89, price_year = 890, kind = 'paid', sort = 2, featured = false, retired = false,
  limits = '{"websites": 5, "pages": 12, "members": 4, "storage_mb": 10000, "data_storage_mb": 20000, "submissions_month": -1, "custom_domain": true, "daily_contacts": 5000}'
WHERE id = 'pro';
