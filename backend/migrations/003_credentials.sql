-- Password hashes move out of the account JSON into their own table.
-- member_id = '' for the account owner; account_key = '__root__' for the root administrator.
CREATE TABLE IF NOT EXISTS credentials (
    account_key    TEXT NOT NULL,
    member_id      TEXT NOT NULL DEFAULT '',
    password_hash  TEXT NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_key, member_id)
);

INSERT INTO credentials (account_key, password_hash)
SELECT license_key, data->>'password_hash' FROM accounts
WHERE coalesce(data->>'password_hash', '') <> ''
ON CONFLICT DO NOTHING;

INSERT INTO credentials (account_key, member_id, password_hash)
SELECT a.license_key, m->>'member_id', m->>'password_hash'
FROM accounts a,
     jsonb_array_elements(CASE WHEN jsonb_typeof(a.data->'members') = 'array' THEN a.data->'members' ELSE '[]'::jsonb END) AS m
WHERE coalesce(m->>'password_hash', '') <> '' AND coalesce(m->>'member_id', '') <> ''
ON CONFLICT DO NOTHING;

INSERT INTO credentials (account_key, password_hash)
SELECT '__root__', value->>'root_password_hash' FROM app_settings
WHERE key = 'license_metadata' AND coalesce(value->>'root_password_hash', '') <> ''
ON CONFLICT DO NOTHING;

-- Strip the hashes from the JSON (members without an id keep theirs, so they can still log in).
UPDATE accounts SET data = (data - 'password_hash') ||
    CASE WHEN jsonb_typeof(data->'members') = 'array' THEN jsonb_build_object('members',
        (SELECT coalesce(jsonb_agg(CASE WHEN coalesce(m->>'member_id', '') <> '' THEN m - 'password_hash' ELSE m END), '[]'::jsonb)
         FROM jsonb_array_elements(data->'members') AS m))
    ELSE '{}'::jsonb END;

UPDATE app_settings SET value = value - 'root_password_hash' WHERE key = 'license_metadata';
