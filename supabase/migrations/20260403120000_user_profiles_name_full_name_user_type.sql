-- Align user_profiles with AppContext / directProfileInsert (columns were missing from prior migrations).
-- Without these, PostgREST returns 400 when selecting unknown column names.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS user_type text;

COMMENT ON COLUMN public.user_profiles.name IS 'Display / legal-style name (app signup metadata)';
COMMENT ON COLUMN public.user_profiles.full_name IS 'Duplicate-friendly full name (often same as name)';
COMMENT ON COLUMN public.user_profiles.user_type IS 'tourist | business | admin — mirrors role for app logic';
