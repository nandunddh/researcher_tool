-- Form submissions are unlimited on every plan; spam is stopped by a per-visitor (IP) limit instead.
UPDATE plans SET limits = jsonb_set(limits, '{submissions_month}', '-1'::jsonb), updated_at = now();
