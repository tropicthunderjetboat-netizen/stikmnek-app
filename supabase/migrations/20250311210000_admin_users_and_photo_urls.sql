-- ═══════════════════════════════════════════════════════════════
-- get_all_users_for_admin RPC
-- Returns all user_profiles for admin (bypasses RLS).
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_all_users_for_admin()
RETURNS SETOF public.user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.user_profiles
  ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_users_for_admin TO authenticated;
