-- Two-step sign-in (authenticator app). user_key = '__root__' or '<license_key>:<member_id>'.
CREATE TABLE IF NOT EXISTS mfa (
    user_key       TEXT PRIMARY KEY,
    secret         TEXT NOT NULL,
    backup_hashes  JSONB NOT NULL DEFAULT '[]',
    last_step      BIGINT NOT NULL DEFAULT 0,
    enabled_at     TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
