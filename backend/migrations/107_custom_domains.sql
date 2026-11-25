-- A website's own domain. Ownership is proven by a DNS TXT record holding the token; only then is the claim "verified".
-- Anyone may claim a name, but a name can be verified by one website only, so nobody can block a real owner by claiming first.
CREATE TABLE IF NOT EXISTS custom_domains (
    site_id     TEXT PRIMARY KEY REFERENCES websites (site_id) ON DELETE CASCADE,
    hostname    TEXT NOT NULL,
    token       TEXT NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS custom_domains_verified_hostname ON custom_domains (lower(hostname)) WHERE verified_at IS NOT NULL;
