-- Reset links became 6-digit codes; count wrong tries so a code can't be guessed.
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
UPDATE password_resets SET used_at = now() WHERE used_at IS NULL;
