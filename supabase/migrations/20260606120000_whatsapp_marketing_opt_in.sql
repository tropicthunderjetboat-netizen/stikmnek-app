-- Business-owner WhatsApp outreach: explicit opt-in + admin contact export.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_marketing_opt_in boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_marketing_opt_in_at timestamptz;

COMMENT ON COLUMN public.user_profiles.whatsapp_marketing_opt_in IS
  'Business owner consented to StikmNek WhatsApp tips (listing setup, education).';
COMMENT ON COLUMN public.user_profiles.whatsapp_marketing_opt_in_at IS
  'When whatsapp_marketing_opt_in was last set to true.';

-- Extend incomplete-profile admin RPC with WhatsApp fields.
CREATE OR REPLACE FUNCTION public.get_incomplete_business_profiles_for_admin()
RETURNS TABLE (
  id uuid,
  name text,
  category text,
  owner_id uuid,
  created_at timestamptz,
  email text,
  phone text,
  whatsapp_number text,
  whatsapp_marketing_opt_in boolean,
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
    COALESCE(NULLIF(btrim(b.whatsapp_number::text), ''), NULLIF(btrim(up.whatsapp_number::text), '')) AS whatsapp_number,
    COALESCE(up.whatsapp_marketing_opt_in, false) AS whatsapp_marketing_opt_in,
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

-- All business owners with contact + onboarding status (admin CSV / WhatsApp outreach).
CREATE OR REPLACE FUNCTION public.get_business_whatsapp_contacts_for_admin()
RETURNS TABLE (
  business_id uuid,
  owner_id uuid,
  business_name text,
  owner_name text,
  owner_email text,
  business_phone text,
  whatsapp_number text,
  whatsapp_marketing_opt_in boolean,
  whatsapp_marketing_opt_in_at timestamptz,
  onboarding_complete boolean,
  listing_status text,
  location text,
  category text,
  profile_created_at timestamptz
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
    b.id AS business_id,
    b.owner_id,
    b.name AS business_name,
    COALESCE(up.full_name, up.name, up.display_name) AS owner_name,
    COALESCE(up.business_email, up.email, b.email, au.email::text) AS owner_email,
    COALESCE(NULLIF(btrim(b.phone::text), ''), NULLIF(btrim(up.business_phone::text), ''), NULLIF(btrim(up.phone::text), '')) AS business_phone,
    COALESCE(NULLIF(btrim(b.whatsapp_number::text), ''), NULLIF(btrim(up.whatsapp_number::text), '')) AS whatsapp_number,
    COALESCE(up.whatsapp_marketing_opt_in, false) AS whatsapp_marketing_opt_in,
    up.whatsapp_marketing_opt_in_at,
    COALESCE(up.onboarding_complete, false) AS onboarding_complete,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.business_offerings o
        WHERE o.business_id = b.id AND COALESCE(o.active, false) = true
      ) THEN 'live'
      WHEN EXISTS (
        SELECT 1 FROM public.pending_businesses pb
        WHERE pb.owner_id = b.owner_id AND pb.status = 'pending'
      ) THEN 'pending_review'
      WHEN EXISTS (
        SELECT 1 FROM public.business_offerings o
        WHERE o.business_id = b.id
      ) THEN 'listing_inactive'
      ELSE 'no_listing'
    END AS listing_status,
    b.location,
    b.category,
    b.created_at AS profile_created_at
  FROM public.businesses b
  LEFT JOIN public.user_profiles up ON up.user_id = b.owner_id
  LEFT JOIN auth.users au ON au.id = b.owner_id
  WHERE b.owner_id IS NOT NULL
  ORDER BY b.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_business_whatsapp_contacts_for_admin() TO authenticated;
