-- Self sign-up waits for the 6-digit email code. Only hashes are stored.
CREATE TABLE IF NOT EXISTS signup_requests (
    email       TEXT PRIMARY KEY,
    payload     JSONB NOT NULL,
    code_hash   TEXT NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Billing. Works with the built-in test provider now and Stripe later (same tables, same events).
ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_price_id TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS subscriptions (
    account_key             TEXT PRIMARY KEY,
    plan_id                 TEXT NOT NULL,
    status                  TEXT NOT NULL,              -- active, canceled, past_due
    current_period_end      TIMESTAMPTZ,
    cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
    provider                TEXT NOT NULL,              -- test or stripe
    provider_customer_id    TEXT NOT NULL DEFAULT '',
    provider_subscription_id TEXT NOT NULL DEFAULT '',
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checkout_sessions (
    id           TEXT PRIMARY KEY,                      -- cs_test_… (test) or Stripe's session id
    account_key  TEXT NOT NULL,
    plan_id      TEXT NOT NULL,
    amount       NUMERIC(10, 2) NOT NULL,
    currency     TEXT NOT NULL DEFAULT 'USD',
    status       TEXT NOT NULL DEFAULT 'open',          -- open, complete, expired
    provider     TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
    id                  BIGSERIAL PRIMARY KEY,
    number              TEXT NOT NULL UNIQUE,           -- INV-000001
    account_key         TEXT NOT NULL,
    plan_id             TEXT NOT NULL,
    amount              NUMERIC(10, 2) NOT NULL,
    currency            TEXT NOT NULL DEFAULT 'USD',
    status              TEXT NOT NULL DEFAULT 'paid',
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    provider            TEXT NOT NULL,
    provider_invoice_id TEXT NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_account_idx ON invoices (account_key, created_at DESC);
CREATE SEQUENCE IF NOT EXISTS invoice_numbers;
