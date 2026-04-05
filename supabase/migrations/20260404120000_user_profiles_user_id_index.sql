-- Speeds up PostgREST queries: .from('user_profiles').eq('user_id', ...) used on auth hot path (resolveRole).
-- B-tree index on user_id; IF NOT EXISTS avoids failure if an equivalent index was added manually.
CREATE INDEX IF NOT EXISTS user_profiles_user_id_idx ON public.user_profiles (user_id);

COMMENT ON INDEX public.user_profiles_user_id_idx IS
  'Lookup by auth user id (resolveRole, RLS-heavy selects).';
