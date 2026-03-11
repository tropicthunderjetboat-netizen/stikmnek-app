-- ═══════════════════════════════════════════════════════════════
-- get_pending_businesses_for_admin RPC
--
-- Bypasses RLS so admins can reliably fetch pending submissions.
-- Verifies caller is admin via user_profiles before returning data.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_pending_businesses_for_admin()
RETURNS SETOF public.pending_businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Must be admin (check user_profiles)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.pending_businesses
  WHERE status = 'pending'
  ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_businesses_for_admin TO authenticated;
