-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 (schema only): business_offerings — per-deal / per-listing rows linked to
-- public.businesses (master profile). Includes one-time backfill from current
-- businesses columns so data is not lost.
--
-- IMPORTANT: The live app still reads listing fields from public.businesses until
-- you ship a frontend/backend refactor. Do NOT drop offering columns from
-- businesses in this migration.
--
-- Next steps (application work):
--   - Read/write offers via business_offerings; optionally keep businesses in sync
--     via triggers or deprecate duplicate columns later.
--   - Point business_photos at offering id (add column + migrate) when ready.
--   - Add pending rows for new offers (new table or pending_businesses.business_id).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.business_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Main offer',
  description text DEFAULT '',
  description_fr text,
  description_bi text,
  discount text DEFAULT '',
  original_price numeric(12,2) NOT NULL DEFAULT 0,
  deal_price numeric(12,2) NOT NULL DEFAULT 0,
  image text DEFAULT '',
  map_url text,
  website text,
  discount_valid_from date,
  discount_valid_until date,
  whatsapp_number text,
  pricing_tiers jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  featured boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_offerings_business_id ON public.business_offerings(business_id);
CREATE INDEX IF NOT EXISTS idx_business_offerings_active ON public.business_offerings(active);

COMMENT ON TABLE public.business_offerings IS
  'Discount / tour / deal line items owned by a row in public.businesses.';

-- Optional: submissions tied to an existing profile (multi-offering workflow)
ALTER TABLE public.pending_businesses
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pending_businesses_business_id ON public.pending_businesses(business_id);

-- One row per existing business (mirrors current “single listing per row” model)
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
SELECT
  b.id,
  COALESCE(NULLIF(TRIM(b.name), ''), 'Main offer'),
  COALESCE(b.description, ''),
  b.description_fr,
  b.description_bi,
  COALESCE(b.discount, ''),
  COALESCE(b.original_price, 0),
  COALESCE(b.deal_price, 0),
  COALESCE(b.image, ''),
  b.map_url,
  b.website,
  b.discount_valid_from,
  b.discount_valid_until,
  b.whatsapp_number,
  b.pricing_tiers,
  COALESCE(b.tags, '{}'),
  COALESCE(b.featured, false),
  COALESCE(b.active, true)
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_offerings o WHERE o.business_id = b.id
);

ALTER TABLE public.business_offerings ENABLE ROW LEVEL SECURITY;

-- Public: only active offerings (owners see all of theirs via second policy)
DROP POLICY IF EXISTS "business_offerings_select_public" ON public.business_offerings;
CREATE POLICY "business_offerings_select_public"
  ON public.business_offerings FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS "business_offerings_all_service" ON public.business_offerings;
CREATE POLICY "business_offerings_all_service"
  ON public.business_offerings FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Owners: manage offerings for their businesses
DROP POLICY IF EXISTS "business_offerings_owner_select" ON public.business_offerings;
CREATE POLICY "business_offerings_owner_select"
  ON public.business_offerings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_offerings.business_id AND b.owner_id = auth.uid()
    )
  );

COMMENT ON POLICY "business_offerings_owner_select" ON public.business_offerings IS
  'Owner may read all offerings (including inactive) for their businesses.';

DROP POLICY IF EXISTS "business_offerings_admin_select" ON public.business_offerings;
CREATE POLICY "business_offerings_admin_select"
  ON public.business_offerings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "business_offerings_owner_insert" ON public.business_offerings;
CREATE POLICY "business_offerings_owner_insert"
  ON public.business_offerings FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_offerings.business_id AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "business_offerings_owner_update" ON public.business_offerings;
CREATE POLICY "business_offerings_owner_update"
  ON public.business_offerings FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_offerings.business_id AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_offerings.business_id AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "business_offerings_owner_delete" ON public.business_offerings;
CREATE POLICY "business_offerings_owner_delete"
  ON public.business_offerings FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_offerings.business_id AND b.owner_id = auth.uid()
    )
  );

GRANT SELECT ON public.business_offerings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_offerings TO authenticated;
GRANT ALL ON public.business_offerings TO service_role;
