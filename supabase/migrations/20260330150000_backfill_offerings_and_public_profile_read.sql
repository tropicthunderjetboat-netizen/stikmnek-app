-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Backfill business_offerings when approval did not create a row (e.g. manual
--    status update, or RPC not applied). Uses latest approved pending per profile
--    only when that profile has zero offerings.
-- 2) Let anon (and authenticated) read master profile rows that back at least one
--    active offering, so PostgREST `business_offerings` embed `businesses!inner`
--    works when businesses.active = false (onboarding stub).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Backfill ───
INSERT INTO public.business_offerings (
  business_id,
  title,
  description,
  description_fr,
  description_bi,
  discount,
  original_price,
  deal_price,
  image,
  map_url,
  website,
  discount_valid_from,
  discount_valid_until,
  whatsapp_number,
  pricing_tiers,
  tags,
  featured,
  active
)
SELECT DISTINCT ON (p.business_id)
  p.business_id,
  COALESCE(NULLIF(TRIM(p.name), ''), 'Main offer'),
  COALESCE(p.description, ''),
  COALESCE(p.description, ''),
  COALESCE(p.description, ''),
  COALESCE(NULLIF(TRIM(p.discount), ''), ''),
  COALESCE(p.original_price::numeric, 0),
  COALESCE(p.deal_price::numeric, 0),
  COALESCE(p.image, ''),
  p.map_url,
  p.website,
  p.discount_valid_from,
  p.discount_valid_until,
  p.whatsapp_number,
  p.pricing_tiers,
  ARRAY[COALESCE(NULLIF(TRIM(p.category), ''), 'dining')],
  false,
  true
FROM public.pending_businesses p
WHERE p.status = 'approved'
  AND p.business_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.business_offerings o WHERE o.business_id = p.business_id
  )
ORDER BY p.business_id, p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST;

COMMENT ON TABLE public.business_offerings IS
  'Discount / tour / deal line items owned by a row in public.businesses.';

-- ─── RLS: read profile row when it has an active public listing ───
-- Use SECURITY DEFINER helper so we do not subquery business_offerings under the
-- invoker's RLS (owner_* policies on offerings reference businesses → recursion).
DROP POLICY IF EXISTS "businesses_select_for_active_offerings" ON public.businesses;

CREATE OR REPLACE FUNCTION public.business_has_active_public_offering(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_offerings o
    WHERE o.business_id = p_business_id AND o.active IS TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.business_has_active_public_offering(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_has_active_public_offering(uuid) TO anon, authenticated;

CREATE POLICY "businesses_select_for_active_offerings"
  ON public.businesses FOR SELECT
  TO anon, authenticated
  USING (public.business_has_active_public_offering(id));

COMMENT ON FUNCTION public.business_has_active_public_offering(uuid) IS
  'RLS helper: true if profile has at least one active offering (bypasses offering↔business policy cycle).';

COMMENT ON POLICY "businesses_select_for_active_offerings" ON public.businesses IS
  'Public/app can load master profile for embed joins when at least one active offering exists (stub profiles may have active = false).';
