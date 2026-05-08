-- Add businesses.logo_url (separate from listing cover image).
-- This prevents the profile logo being overwritten by per-listing images.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS logo_url text DEFAULT '';

COMMENT ON COLUMN public.businesses.logo_url IS
  'Business brand logo URL (shown on deal pages and owner dashboard). Separate from listing cover image.';

-- Backfill: if logo_url is empty, copy from legacy businesses.image.
UPDATE public.businesses
SET logo_url = COALESCE(NULLIF(btrim(image::text), ''), '')
WHERE COALESCE(NULLIF(btrim(logo_url::text), ''), '') = '';

-- Update business_listings_view to expose profile logo (do not merge into listing cover).
DROP VIEW IF EXISTS public.business_listings_view CASCADE;

CREATE VIEW public.business_listings_view
WITH (security_invoker = true) AS
SELECT
  o.id,
  o.business_id,
  b.id AS profile_business_id,
  o.title,
  -- Listing copy: prefer offering when non-empty / non-null, else profile columns
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
  -- Profile / venue
  b.name AS profile_name,
  b.category,
  b.owner_id,
  b.location,
  b.lat,
  b.lng,
  b.hours,
  b.opening_hours,
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
  -- Raw slices
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
  b.logo_url AS business_logo_url_raw
FROM public.business_offerings o
INNER JOIN public.businesses b ON b.id = o.business_id;

GRANT SELECT ON public.business_listings_view TO anon;
GRANT SELECT ON public.business_listings_view TO authenticated;
GRANT SELECT ON public.business_listings_view TO service_role;

