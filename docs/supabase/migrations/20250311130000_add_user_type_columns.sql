-- ═══════════════════════════════════════════════════════════════
-- Add user_type, name, full_name to user_profiles (if missing)
-- AppContext resolveRole() uses user_type || role for role resolution.
-- directProfileInsert() writes to these columns.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS name text,
ADD COLUMN IF NOT EXISTS full_name text,
ADD COLUMN IF NOT EXISTS user_type text;

-- Sync existing role to user_type for backwards compatibility
UPDATE public.user_profiles
SET user_type = role
WHERE user_type IS NULL AND role IS NOT NULL;

COMMENT ON COLUMN public.user_profiles.user_type IS 'User type: tourist, business, or admin. Used with role for role resolution.';
COMMENT ON COLUMN public.user_profiles.name IS 'Display name (preferred over display_name)';
COMMENT ON COLUMN public.user_profiles.full_name IS 'Full name (synced with name)';
