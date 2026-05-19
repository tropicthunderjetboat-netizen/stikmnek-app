-- Per-listing schedule / operating hours on business_offerings (not shared via businesses profile).

ALTER TABLE public.business_offerings
  ADD COLUMN IF NOT EXISTS hours text DEFAULT '',
  ADD COLUMN IF NOT EXISTS opening_hours text DEFAULT '';

COMMENT ON COLUMN public.business_offerings.hours IS
  'Listing-specific schedule (tour departures, activity times). Falls back to businesses.hours when empty.';
COMMENT ON COLUMN public.business_offerings.opening_hours IS
  'Optional alternate schedule text for this listing; same fallback rules as hours.';

-- Single-listing businesses: copy profile hours onto the offering once (multi-listing profiles stay blank until edited per deal).
UPDATE public.business_offerings o
SET hours = COALESCE(NULLIF(btrim(b.hours::text), ''), NULLIF(btrim(b.opening_hours::text), ''), '')
FROM public.businesses b
WHERE o.business_id = b.id
  AND COALESCE(NULLIF(btrim(o.hours::text), ''), '') = ''
  AND COALESCE(NULLIF(btrim(b.hours::text), ''), NULLIF(btrim(b.opening_hours::text), ''), '') <> ''
  AND (
    SELECT count(*)::int FROM public.business_offerings o2 WHERE o2.business_id = b.id
  ) = 1;

-- business_listings_view: prefer offering hours when set
DROP VIEW IF EXISTS public.business_listings_view CASCADE;

CREATE OR REPLACE VIEW public.business_listings_view
WITH (security_invoker = true) AS
SELECT
  o.id,
  o.business_id,
  b.id AS profile_business_id,
  o.title,
  COALESCE(NULLIF(btrim(o.description::text), ''), b.description) AS description,
  COALESCE(NULLIF(btrim(o.description_fr::text), ''), b.description_fr, o.description_fr) AS description_fr,
  COALESCE(NULLIF(btrim(o.description_bi::text), ''), b.description_bi, o.description_bi) AS description_bi,
  COALESCE(NULLIF(btrim(o.discount::text), ''), b.discount, o.discount) AS discount,
  COALESCE(o.original_price, b.original_price) AS original_price,
  COALESCE(o.deal_price, b.deal_price) AS deal_price,
  COALESCE(NULLIF(btrim(o.image::text), ''), b.image, o.image) AS image,
  COALESCE(NULLIF(btrim(o.map_url::text), ''), b.map_url, o.map_url) AS map_url,
  COALESCE(NULLIF(btrim(o.website::text), ''), b.website, o.website) AS website,
  COALESCE(o.discount_valid_from, b.discount_valid_from) AS discount_valid_from,
  COALESCE(o.discount_valid_until, b.discount_valid_until) AS discount_valid_until,
  COALESCE(NULLIF(btrim(o.whatsapp_number::text), ''), b.whatsapp_number, o.whatsapp_number) AS whatsapp_number,
  COALESCE(o.pricing_tiers, b.pricing_tiers) AS pricing_tiers,
  COALESCE(o.tags, b.tags, '{}'::text[]) AS tags,
  (COALESCE(o.featured, false) OR COALESCE(b.featured, false)) AS featured,
  o.active AS active,
  b.active AS profile_active,
  o.created_at AS offering_created_at,
  o.updated_at AS offering_updated_at,
  b.name AS profile_name,
  b.category,
  b.owner_id,
  b.location,
  b.lat,
  b.lng,
  COALESCE(NULLIF(btrim(o.hours::text), ''), NULLIF(btrim(o.opening_hours::text), ''), b.hours) AS hours,
  COALESCE(NULLIF(btrim(o.opening_hours::text), ''), b.opening_hours) AS opening_hours,
  b.phone,
  b.email,
  b.contact_email,
  b.business_email,
  b.rating,
  b.review_count,
  b.is_verified,
  b.logo_url AS profile_logo_url,
  b.created_at AS business_created_at,
  b.updated_at AS business_updated_at,
  o.description AS offering_description_raw,
  o.description_fr AS offering_description_fr_raw,
  o.description_bi AS offering_description_bi_raw,
  o.discount AS offering_discount_raw,
  o.original_price AS offering_original_price_raw,
  o.deal_price AS offering_deal_price_raw,
  o.image AS offering_image_raw,
  o.map_url AS offering_map_url_raw,
  o.website AS offering_website_raw,
  o.discount_valid_from AS offering_discount_valid_from_raw,
  o.discount_valid_until AS offering_discount_valid_until_raw,
  o.whatsapp_number AS offering_whatsapp_number_raw,
  o.pricing_tiers AS offering_pricing_tiers_raw,
  o.tags AS offering_tags_raw,
  o.featured AS offering_featured_raw,
  o.active AS offering_active_raw,
  o.hours AS offering_hours_raw,
  o.opening_hours AS offering_opening_hours_raw,
  b.description AS business_description_raw,
  b.description_fr AS business_description_fr_raw,
  b.description_bi AS business_description_bi_raw,
  b.discount AS business_discount_raw,
  b.original_price AS business_original_price_raw,
  b.deal_price AS business_deal_price_raw,
  b.image AS business_image_raw,
  b.map_url AS business_map_url_raw,
  b.website AS business_website_raw,
  b.discount_valid_from AS business_discount_valid_from_raw,
  b.discount_valid_until AS business_discount_valid_until_raw,
  b.whatsapp_number AS business_whatsapp_number_raw,
  b.pricing_tiers AS business_pricing_tiers_raw,
  b.tags AS business_tags_raw,
  b.featured AS business_featured_raw,
  b.hours AS business_hours_raw,
  b.opening_hours AS business_opening_hours_raw,
  b.logo_url AS business_logo_url_raw
FROM public.business_offerings o
INNER JOIN public.businesses b ON b.id = o.business_id;

GRANT SELECT ON public.business_listings_view TO anon;
GRANT SELECT ON public.business_listings_view TO authenticated;
GRANT SELECT ON public.business_listings_view TO service_role;
