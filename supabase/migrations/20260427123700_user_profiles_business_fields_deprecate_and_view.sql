-- ═══════════════════════════════════════════════════════════════════════════
-- user_profiles: deprecate legacy business_* fields + provide consolidated view
--
-- Context:
-- - The canonical business data lives in:
--   - public.businesses (profile/contact/location)
--   - public.business_offerings (per-deal listing content like description/discount/prices)
-- - Some older app flows stored business onboarding fields on public.user_profiles
--   (business_name, business_category, business_description, business_location,
--    business_phone, business_email).
--
-- This migration is intentionally backwards compatible:
-- - It DOES NOT drop any columns (dropping would break existing frontend code paths).
-- - It adds deprecation comments so future cleanups are safe and explicit.
-- - It creates a consolidated owner-facing view that reads from businesses/offers first,
--   with legacy user_profiles fallbacks.
--
-- Follow-up (future):
-- - After the frontend stops reading/writing these user_profiles fields, create a
--   separate migration to DROP the deprecated columns.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0) Ensure legacy columns exist (for mixed/older DBs) ───────────────────
-- Some environments may not have all `business_*` columns on user_profiles.
-- We keep them nullable for backwards compatibility and to avoid breaking views/app code.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS business_category text,
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS business_location text,
  ADD COLUMN IF NOT EXISTS business_phone text,
  ADD COLUMN IF NOT EXISTS business_email text;

-- ── 1) Deprecation comments (safe if some columns are missing) ─────────────
DO $$
DECLARE
  v_col text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY[
    'business_name',
    'business_category',
    'business_description',
    'business_location',
    'business_phone',
    'business_email'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_profiles'
        AND column_name = v_col
    ) THEN
      EXECUTE format(
        'COMMENT ON COLUMN public.user_profiles.%I IS %L',
        v_col,
        'DEPRECATED: legacy business onboarding snapshot. Canonical business data lives in public.businesses and public.business_offerings. Keep for backwards compatibility; remove after app migration.'
      );
    END IF;
  END LOOP;
END $$;

-- ── 2) Consolidated view for owner dashboards / admin tooling ──────────────
-- One row per user profile. If the user owns a business row, prefer those fields.
-- For multi-business owners, the view returns the most recently updated business row.
CREATE OR REPLACE VIEW public.user_profiles_business_owner
WITH (security_invoker = true) AS
SELECT
  up.user_id,
  up.role,
  -- Prefer canonical business profile fields, fallback to legacy user_profiles columns.
  COALESCE(b.name, up.business_name) AS business_name,
  COALESCE(b.category, up.business_category) AS business_category,
  COALESCE(b.location, up.business_location) AS business_location,
  COALESCE(b.phone, up.business_phone) AS business_phone,
  COALESCE(b.contact_email, b.business_email, up.business_email) AS business_email,
  -- Description belongs to offerings; prefer the most recently updated offering for that business.
  COALESCE(o.description, up.business_description) AS business_description,
  -- Additional canonical business fields (only columns confirmed to exist)
  b.active AS business_active,
  b.is_verified AS business_is_verified,
  b.rating AS business_rating,
  b.review_count AS business_review_count,
  b.whatsapp_number AS business_whatsapp_number,
  b.map_url AS business_map_url,
  b.website AS business_website,
  b.lat AS business_lat,
  b.lng AS business_lng,
  b.hours AS business_hours,
  b.opening_hours AS business_opening_hours,
  -- Offering snapshot (only columns confirmed to exist)
  o.title AS offering_title,
  o.discount AS offering_discount,
  o.original_price AS offering_original_price,
  o.deal_price AS offering_deal_price,
  o.image AS offering_image,
  o.map_url AS offering_map_url,
  o.website AS offering_website,
  o.whatsapp_number AS offering_whatsapp_number,
  o.pricing_tiers AS offering_pricing_tiers,
  o.tags AS offering_tags,
  o.featured AS offering_featured,
  o.active AS offering_active,
  o.discount_valid_from AS offering_discount_valid_from,
  o.discount_valid_until AS offering_discount_valid_until,
  b.id AS profile_business_id,
  o.id AS offering_id,
  b.updated_at AS business_updated_at,
  o.updated_at AS offering_updated_at
FROM public.user_profiles up
LEFT JOIN LATERAL (
  SELECT *
  FROM public.businesses b
  WHERE b.owner_id = up.user_id
  ORDER BY b.updated_at DESC NULLS LAST, b.created_at DESC NULLS LAST
  LIMIT 1
) b ON true
LEFT JOIN LATERAL (
  SELECT *
  FROM public.business_offerings o
  WHERE b.id IS NOT NULL AND o.business_id = b.id
  ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC NULLS LAST
  LIMIT 1
) o ON true;

COMMENT ON VIEW public.user_profiles_business_owner IS
  'Owner-facing consolidated business snapshot: prefers public.businesses + latest public.business_offerings, with legacy user_profiles.business_* fallbacks for backwards compatibility.';

GRANT SELECT ON public.user_profiles_business_owner TO authenticated, service_role;

