-- ═══════════════════════════════════════════════════════════════════════════
-- Pass checkout defaults on user_profiles (party size + duration preference).
-- RLS: no new policies — existing user_profiles_update_own (auth.uid() = user_id)
-- already governs UPDATE; admins use user_profiles_admin_update_all.
-- ═══════════════════════════════════════════════════════════════════════════

DO $enum$
BEGIN
  CREATE TYPE public.pass_duration_enum AS ENUM ('short', 'extended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$enum$;

COMMENT ON TYPE public.pass_duration_enum IS
  'Default pass length preference: short (1 calendar day) vs extended (14 days).';

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS party_size smallint,
  ADD COLUMN IF NOT EXISTS preferred_pass_duration public.pass_duration_enum;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_party_size_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_party_size_check
  CHECK (party_size IS NULL OR (party_size >= 1 AND party_size <= 6));

COMMENT ON COLUMN public.user_profiles.party_size IS
  'Optional default group size (1–6) for checkout; null = derive from demographics or auth metadata.';

COMMENT ON COLUMN public.user_profiles.preferred_pass_duration IS
  'Optional default pass length for checkout; null = treat as short unless set elsewhere.';

-- Low cardinality; partial index avoids indexing null-heavy rows if the table grows.
CREATE INDEX IF NOT EXISTS user_profiles_party_size_idx
  ON public.user_profiles (party_size)
  WHERE party_size IS NOT NULL;
