-- Admin/staff: list live business_offerings whose discount window has lapsed.
-- Used on the Businesses tab so admins can contact owners to renew or replace deals.

DROP FUNCTION IF EXISTS public.get_expired_business_listings_for_admin();

CREATE OR REPLACE FUNCTION public.get_expired_business_listings_for_admin()
RETURNS TABLE (
  offering_id uuid,
  business_id uuid,
  listing_title text,
  category text,
  discount text,
  original_price numeric,
  deal_price numeric,
  discount_valid_from date,
  discount_valid_until date,
  days_expired integer,
  offering_active boolean,
  business_name text,
  owner_id uuid,
  owner_name text,
  owner_email text,
  business_phone text,
  whatsapp_number text,
  whatsapp_marketing_opt_in boolean,
  location text,
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

  IF NOT public.is_staff_or_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS offering_id,
    b.id AS business_id,
    COALESCE(NULLIF(btrim(o.title::text), ''), b.name, 'Listing') AS listing_title,
    COALESCE(NULLIF(btrim(o.tags[1]::text), ''), b.category, 'activities') AS category,
    COALESCE(o.discount, '') AS discount,
    COALESCE(o.original_price, 0) AS original_price,
    COALESCE(o.deal_price, 0) AS deal_price,
    o.discount_valid_from,
    o.discount_valid_until,
    (CURRENT_DATE - o.discount_valid_until)::integer AS days_expired,
    COALESCE(o.active, false) AS offering_active,
    b.name AS business_name,
    b.owner_id,
    COALESCE(up.full_name, up.name, up.display_name) AS owner_name,
    COALESCE(up.business_email, up.email, b.email, au.email::text) AS owner_email,
    COALESCE(
      NULLIF(btrim(b.phone::text), ''),
      NULLIF(btrim(up.business_phone::text), ''),
      NULLIF(btrim(up.phone::text), '')
    ) AS business_phone,
    COALESCE(
      NULLIF(btrim(o.whatsapp_number::text), ''),
      NULLIF(btrim(b.whatsapp_number::text), ''),
      NULLIF(btrim(up.whatsapp_number::text), '')
    ) AS whatsapp_number,
    COALESCE(up.whatsapp_marketing_opt_in, false) AS whatsapp_marketing_opt_in,
    b.location,
    b.created_at AS profile_created_at
  FROM public.business_offerings o
  INNER JOIN public.businesses b ON b.id = o.business_id
  LEFT JOIN public.user_profiles up ON up.user_id = b.owner_id
  LEFT JOIN auth.users au ON au.id = b.owner_id
  WHERE o.discount_valid_until IS NOT NULL
    AND o.discount_valid_until < CURRENT_DATE
  ORDER BY o.discount_valid_until ASC, b.name ASC, o.title ASC;
END;
$$;

COMMENT ON FUNCTION public.get_expired_business_listings_for_admin() IS
  'Returns offerings past discount_valid_until with owner contact details for admin renewal outreach.';

GRANT EXECUTE ON FUNCTION public.get_expired_business_listings_for_admin() TO authenticated;
