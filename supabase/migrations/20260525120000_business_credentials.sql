-- Business credentials: optional insurance, permits, association docs, first aid.
-- Admin verifies each item; verified flags feed leaderboard and public "My credentials" tile.

CREATE TABLE IF NOT EXISTS public.business_credentials (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,

  liability_insurance_url text,
  liability_insurance_path text,
  liability_insurance_uploaded_at timestamptz,
  verified_liability_insurance boolean NOT NULL DEFAULT false,
  verified_liability_insurance_at timestamptz,
  verified_liability_insurance_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  tourism_permit_url text,
  tourism_permit_path text,
  tourism_permit_uploaded_at timestamptz,
  verified_tourism_permit boolean NOT NULL DEFAULT false,
  verified_tourism_permit_at timestamptz,
  verified_tourism_permit_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  association_credentials_url text,
  association_credentials_path text,
  association_credentials_uploaded_at timestamptz,
  verified_association_credentials boolean NOT NULL DEFAULT false,
  verified_association_credentials_at timestamptz,
  verified_association_credentials_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  first_aid_certificate_url text,
  first_aid_certificate_path text,
  first_aid_completed_at date,
  first_aid_uploaded_at timestamptz,
  verified_first_aid boolean NOT NULL DEFAULT false,
  verified_first_aid_at timestamptz,
  verified_first_aid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_credentials IS
  'Optional business credentials (insurance, permits, association, first aid). Admin-verified items boost leaderboard rank.';

CREATE INDEX IF NOT EXISTS business_credentials_updated_at_idx
  ON public.business_credentials (updated_at DESC);

ALTER TABLE public.business_credentials ENABLE ROW LEVEL SECURITY;

-- Owners read/write their profile credentials
DROP POLICY IF EXISTS business_credentials_owner_all ON public.business_credentials;
CREATE POLICY business_credentials_owner_all
  ON public.business_credentials
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_credentials.business_id
        AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_credentials.business_id
        AND b.owner_id = auth.uid()
    )
  );

-- Admins full access (user_profiles.role = admin)
DROP POLICY IF EXISTS business_credentials_admin_all ON public.business_credentials;
CREATE POLICY business_credentials_admin_all
  ON public.business_credentials
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  );

-- Document URLs are not exposed publicly; tourists see flags via business_listings_view only.
-- Data API: explicit GRANTs required (Supabase May/Oct 2026 — see supabase/migrations/README.md).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_credentials TO authenticated;
GRANT ALL ON public.business_credentials TO service_role;

-- ─── Storage bucket: business-credentials (private documents) ───
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-credentials',
  'business-credentials',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

DROP POLICY IF EXISTS "Authenticated upload business-credentials" ON storage.objects;
CREATE POLICY "Authenticated upload business-credentials"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'business-credentials');

DROP POLICY IF EXISTS "Owner read own business-credentials" ON storage.objects;
CREATE POLICY "Owner read own business-credentials"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'business-credentials'
    AND (
      EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.user_id = auth.uid() AND up.role = 'admin'
      )
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Owner delete own business-credentials" ON storage.objects;
CREATE POLICY "Owner delete own business-credentials"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'business-credentials'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Extend business_listings_view with public credential flags (no document URLs) ───
DROP VIEW IF EXISTS public.business_listings_view CASCADE;

CREATE VIEW public.business_listings_view
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
  COALESCE(c.verified_tourism_permit, false) AS cred_verified_tourism_permit,
  COALESCE(c.verified_liability_insurance, false) AS cred_verified_liability_insurance,
  COALESCE(c.verified_association_credentials, false) AS cred_verified_association_credentials,
  COALESCE(c.verified_first_aid, false) AS cred_verified_first_aid,
  (
    (CASE WHEN COALESCE(c.verified_tourism_permit, false)
      AND NULLIF(btrim(c.tourism_permit_path::text), '') IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(c.verified_liability_insurance, false)
      AND NULLIF(btrim(c.liability_insurance_path::text), '') IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(c.verified_association_credentials, false)
      AND NULLIF(btrim(c.association_credentials_path::text), '') IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN COALESCE(c.verified_first_aid, false)
      AND NULLIF(btrim(c.first_aid_certificate_path::text), '') IS NOT NULL
      AND c.first_aid_completed_at IS NOT NULL
      AND c.first_aid_completed_at >= (CURRENT_DATE - INTERVAL '24 months') THEN 1 ELSE 0 END)
  )::int AS cred_verified_count,
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
INNER JOIN public.businesses b ON b.id = o.business_id
LEFT JOIN public.business_credentials c ON c.business_id = b.id;

GRANT SELECT ON public.business_listings_view TO anon;
GRANT SELECT ON public.business_listings_view TO authenticated;
GRANT SELECT ON public.business_listings_view TO service_role;
