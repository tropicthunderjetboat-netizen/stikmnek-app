-- Admins need every submission status on the Approvals tab (pending, approved stuck rows, rejected).
-- Previously get_pending_businesses_for_admin only returned status = 'pending'.

CREATE OR REPLACE FUNCTION public.get_pending_businesses_for_admin()
RETURNS SETOF public.pending_businesses
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
  FROM public.pending_businesses
  ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_businesses_for_admin() TO authenticated;
