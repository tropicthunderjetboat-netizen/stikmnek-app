-- Production may never have applied 20260606120000_whatsapp_marketing_opt_in.sql.
-- Add columns first, then backfill owners who already gave a WhatsApp number
-- (admin/field onboard never showed the checkbox).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_number text;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_marketing_opt_in boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_marketing_opt_in_at timestamptz;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMENT ON COLUMN public.user_profiles.whatsapp_marketing_opt_in IS
  'Business owner consented to StikmNek WhatsApp tips (listing setup, education).';
COMMENT ON COLUMN public.user_profiles.whatsapp_marketing_opt_in_at IS
  'When whatsapp_marketing_opt_in was last set to true.';

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
