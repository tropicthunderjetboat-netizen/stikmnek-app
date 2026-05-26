-- Admins: owners who saved a business profile but have not submitted a listing for review yet.
-- These rows do not appear in pending_businesses until they use "Submit a listing".

CREATE OR REPLACE FUNCTION public.get_incomplete_business_profiles_for_admin()
RETURNS TABLE (
  id uuid,
  name text,
  category text,
  owner_id uuid,
  created_at timestamptz,
  email text,
  phone text,
  location text,
  logo_url text,
  owner_email text,
  owner_name text
)
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
  SELECT
    b.id,
    b.name,
    b.category,
    b.owner_id,
    b.created_at,
    b.email,
    b.phone,
    b.location,
    COALESCE(NULLIF(btrim(b.logo_url::text), ''), NULLIF(btrim(b.image::text), '')) AS logo_url,
    COALESCE(up.business_email, up.email, au.email::text) AS owner_email,
    COALESCE(up.full_name, up.name, up.display_name) AS owner_name
  FROM public.businesses b
  LEFT JOIN public.user_profiles up ON up.user_id = b.owner_id
  LEFT JOIN auth.users au ON au.id = b.owner_id
  WHERE COALESCE(b.active, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.pending_businesses pb
      WHERE pb.owner_id = b.owner_id AND pb.status = 'pending'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.business_offerings o
      WHERE o.business_id = b.id
    )
  ORDER BY b.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_incomplete_business_profiles_for_admin() TO authenticated;
