-- Pro carries the "Most popular" badge on the pricing cards. 105_new_pricing left every plan unfeatured.
-- Only when no plan is featured yet, so a choice made later in Root -> Plans is never overridden.
UPDATE plans SET featured = true, updated_at = now()
WHERE id = 'pro' AND NOT retired AND NOT EXISTS (SELECT 1 FROM plans WHERE featured);
