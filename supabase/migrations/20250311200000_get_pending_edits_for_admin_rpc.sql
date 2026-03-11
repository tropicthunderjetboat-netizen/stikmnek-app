-- ═══════════════════════════════════════════════════════════════
-- get_pending_edits_for_admin RPC
--
-- Bypasses RLS so admins can fetch pending listing edits.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_pending_edits_for_admin()
RETURNS SETOF public.pending_edits
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
  FROM public.pending_edits
  WHERE status = 'pending'
  ORDER BY submitted_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_edits_for_admin TO authenticated;
