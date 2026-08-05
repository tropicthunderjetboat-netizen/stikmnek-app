-- Backfill marketing opt-in for business owners who already gave a WhatsApp number
-- on their profile or listing (admin/field onboard never showed the checkbox).
-- Review before running in production if you want explicit consent only.

UPDATE public.user_profiles up
SET
  whatsapp_marketing_opt_in = true,
  whatsapp_marketing_opt_in_at = COALESCE(up.whatsapp_marketing_opt_in_at, now()),
  updated_at = now()
WHERE COALESCE(up.whatsapp_marketing_opt_in, false) = false
  AND (
    NULLIF(btrim(COALESCE(up.whatsapp_number, '')), '') IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.owner_id = up.user_id
        AND NULLIF(btrim(COALESCE(b.whatsapp_number, '')), '') IS NOT NULL
    )
  )
  AND (
    up.role = 'business'
    OR EXISTS (SELECT 1 FROM public.businesses b2 WHERE b2.owner_id = up.user_id)
  );
