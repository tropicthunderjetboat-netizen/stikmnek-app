-- Allow saved checkout default party_size up to 20 (matches pass MAX_PARTY_SIZE).

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_party_size_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_party_size_check
  CHECK (party_size IS NULL OR (party_size >= 1 AND party_size <= 20));

COMMENT ON COLUMN public.user_profiles.party_size IS
  'Optional default group size (1–20) for checkout; null = derive from demographics or auth metadata.';
