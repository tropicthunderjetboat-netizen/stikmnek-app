-- ═══════════════════════════════════════════════════════════════
-- get_business_photos_for_admin RPC
--
-- Returns ALL rows from business_photos (bypasses RLS) so the Admin
-- Panel can display and moderate every uploaded photo for pending
-- listings. Verifies caller is admin by email (auth.users) so it
-- works even if you do not have a user_profiles table.
-- Add more emails to the list below if you have other admins.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_business_photos_for_admin()
RETURNS SETOF public.business_photos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT LOWER(email) INTO user_email
  FROM auth.users
  WHERE id = auth.uid();

  -- Admin allowlist (same as frontend ADMIN_EMAILS). Add your admin emails here.
  IF user_email IS NULL OR user_email NOT IN (
    'admin@stikmnek.com',
    'testadmin@example.com',
    'stikmnek@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.business_photos
  ORDER BY created_at ASC;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.get_business_photos_for_admin() TO authenticated;
