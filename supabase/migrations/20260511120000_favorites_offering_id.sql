-- Per-listing favorites: optional offering_id (business_offerings.id).
-- business_id remains the profile businesses.id for FKs and legacy rows (offering_id IS NULL).

ALTER TABLE public.favorites
  ADD COLUMN IF NOT EXISTS offering_id uuid REFERENCES public.business_offerings(id) ON DELETE CASCADE;

ALTER TABLE public.favorites DROP CONSTRAINT IF EXISTS favorites_user_id_business_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_profile_uidx
  ON public.favorites (user_id, business_id)
  WHERE offering_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_offering_uidx
  ON public.favorites (user_id, offering_id)
  WHERE offering_id IS NOT NULL;

COMMENT ON COLUMN public.favorites.offering_id IS
  'When set, favorite is this specific listing; when null, favorite is the whole venue (legacy).';
