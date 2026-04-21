-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 (architecture): business_photos — separate pending from live
--
-- Historically pending submission photos reused business_id to store
-- pending_businesses.id. This migration adds pending_id, migrates those rows,
-- and enforces exactly one parent (live profile OR pending submission).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) New column (FK added after data is clean — orphan uuids cannot reference pending)
ALTER TABLE public.business_photos
  ADD COLUMN IF NOT EXISTS pending_id uuid;

-- 2) Live rows may keep business_id; pending-linked rows will clear business_id — must be nullable
ALTER TABLE public.business_photos
  ALTER COLUMN business_id DROP NOT NULL;

-- 3) Move “fake business_id” rows that are actually pending_businesses ids
--    Only when that uuid exists in pending_businesses (satisfies FK we add next).
UPDATE public.business_photos bp
SET
  pending_id = bp.business_id,
  business_id = NULL
WHERE bp.business_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = bp.business_id)
  AND EXISTS (SELECT 1 FROM public.pending_businesses p WHERE p.id = bp.business_id);

-- 4) Remove true orphans (uuid not in businesses and not migrated to pending_id)
DELETE FROM public.business_photos bp
WHERE bp.business_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = bp.business_id);

-- 5) Rows with neither parent cannot satisfy the XOR check below
DELETE FROM public.business_photos
WHERE business_id IS NULL AND pending_id IS NULL;

-- 6) FK: pending rows cascade when submission is removed
ALTER TABLE public.business_photos
  DROP CONSTRAINT IF EXISTS business_photos_pending_id_fkey;

ALTER TABLE public.business_photos
  ADD CONSTRAINT business_photos_pending_id_fkey
  FOREIGN KEY (pending_id) REFERENCES public.pending_businesses (id) ON DELETE CASCADE;

-- 7) Exactly one of (live business, pending submission) — not both, not neither
ALTER TABLE public.business_photos
  DROP CONSTRAINT IF EXISTS business_photos_single_parent;

ALTER TABLE public.business_photos
  ADD CONSTRAINT business_photos_single_parent CHECK (
    (business_id IS NOT NULL AND pending_id IS NULL)
    OR (business_id IS NULL AND pending_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_business_photos_pending_id
  ON public.business_photos (pending_id);

-- 8) Live rows: business_id must be a real businesses.id (prevents storing pending uuid here)
ALTER TABLE public.business_photos
  DROP CONSTRAINT IF EXISTS business_photos_business_id_fkey;

ALTER TABLE public.business_photos
  ADD CONSTRAINT business_photos_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES public.businesses (id) ON DELETE CASCADE;

COMMENT ON COLUMN public.business_photos.pending_id IS
  'Moderation queue: photo belongs to this pending_businesses row. Mutually exclusive with business_id.';

COMMENT ON COLUMN public.business_photos.business_id IS
  'Live gallery: references public.businesses.id when pending_id is null.';

-- B) Align review_pending_business with pending_id on business_photos

DROP FUNCTION IF EXISTS public.review_pending_business(uuid, text, text);

CREATE OR REPLACE FUNCTION public.review_pending_business(
  p_pending_id uuid,
  p_decision text,
  p_admin_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_pending record;
  v_new_biz_id uuid;
  v_new_offering_id uuid;
  v_primary_offering_id uuid;
  v_stub_id uuid;
  v_email text;
  v_desc text;
  v_elem jsonb;
  v_op_t numeric;
  v_dp_t numeric;
  v_orig numeric;
  v_deal numeric;
  v_cat text;
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

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected';
  END IF;

  SELECT * INTO v_pending
  FROM public.pending_businesses
  WHERE id = p_pending_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending business not found or already reviewed';
  END IF;

  IF p_decision = 'approved' THEN
    IF length(trim(coalesce(v_pending.description, ''))) = 0 THEN
      RAISE EXCEPTION 'Description cannot be empty.'
        USING ERRCODE = 'P0001';
    END IF;

    IF coalesce(trim(v_pending.image), '') = '' AND NOT EXISTS (
      SELECT 1 FROM public.business_photos bp
      WHERE (bp.pending_id = p_pending_id OR (bp.pending_id IS NULL AND bp.business_id = p_pending_id))
        AND length(trim(coalesce(bp.url, ''))) > 0
        AND bp.status IS DISTINCT FROM 'rejected'
    ) THEN
      RAISE EXCEPTION 'Offering must have at least one image (cover image or non-rejected gallery photo).'
        USING ERRCODE = 'P0001';
    END IF;

    v_cat := lower(trim(coalesce(v_pending.category, '')));
    v_orig := coalesce(v_pending.original_price::numeric, 0);
    v_deal := coalesce(v_pending.deal_price::numeric, 0);

    IF v_pending.pricing_tiers IS NOT NULL
       AND jsonb_typeof(v_pending.pricing_tiers) = 'array'
       AND jsonb_array_length(v_pending.pricing_tiers) > 0 THEN
      FOR v_elem IN SELECT jsonb_array_elements(v_pending.pricing_tiers)
      LOOP
        BEGIN
          v_op_t := trim(coalesce(v_elem->>'original_price_vt', ''))::numeric;
          v_dp_t := trim(coalesce(v_elem->>'deal_price_vt', ''))::numeric;
        EXCEPTION
          WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Invalid pricing tiers: each price must be a valid number.'
              USING ERRCODE = 'P0001';
        END;

        IF v_op_t <= 0 OR v_dp_t <= 0 THEN
          RAISE EXCEPTION 'Invalid pricing tiers: each tier needs positive standard and StikmNek prices.'
            USING ERRCODE = 'P0001';
        END IF;

        IF v_dp_t >= v_op_t THEN
          RAISE EXCEPTION 'Invalid pricing tiers: StikmNek price must be less than standard price for each tier.'
            USING ERRCODE = 'P0001';
        END IF;
      END LOOP;
    ELSE
      IF v_cat IN ('tours', 'activities') THEN
        RAISE EXCEPTION 'Tours and activities listings must include at least one valid pricing tier.'
          USING ERRCODE = 'P0001';
      END IF;

      IF v_orig <= 0 OR v_deal <= 0 THEN
        RAISE EXCEPTION 'Invalid pricing: original price and deal price must be positive when no pricing tiers are set.'
          USING ERRCODE = 'P0001';
      END IF;

      IF v_deal > v_orig THEN
        RAISE EXCEPTION 'Invalid pricing: deal price must be less than or equal to original price.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  UPDATE public.pending_businesses
  SET status = p_decision, admin_notes = p_admin_notes, updated_at = now()
  WHERE id = p_pending_id;

  IF p_decision = 'approved' THEN
    -- Existing profile: update primary offering + sync businesses row (do not INSERT duplicate offers).
    IF v_pending.business_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = v_pending.business_id AND b.owner_id = v_pending.owner_id
      ) THEN
        RAISE EXCEPTION 'Invalid business_id for pending submission';
      END IF;

      v_desc := COALESCE(v_pending.description, '');
      v_email := NULLIF(TRIM(COALESCE(v_pending.email, '')), '');

      SELECT o.id INTO v_primary_offering_id
      FROM public.business_offerings o
      WHERE o.business_id = v_pending.business_id
      ORDER BY o.created_at ASC
      LIMIT 1;

      IF v_primary_offering_id IS NOT NULL THEN
        UPDATE public.business_offerings o SET
          title = COALESCE(NULLIF(TRIM(v_pending.name), ''), o.title),
          description = v_desc,
          description_fr = v_desc,
          description_bi = v_desc,
          discount = COALESCE(NULLIF(TRIM(v_pending.discount), ''), ''),
          original_price = COALESCE(v_pending.original_price::numeric, 0),
          deal_price = COALESCE(v_pending.deal_price::numeric, 0),
          image = COALESCE(NULLIF(TRIM(v_pending.image), ''), o.image, ''),
          map_url = v_pending.map_url,
          website = v_pending.website,
          discount_valid_from = v_pending.discount_valid_from,
          discount_valid_until = v_pending.discount_valid_until,
          whatsapp_number = v_pending.whatsapp_number,
          pricing_tiers = v_pending.pricing_tiers,
          tags = ARRAY[COALESCE(NULLIF(TRIM(v_pending.category), ''), 'dining')],
          active = true,
          updated_at = now()
        WHERE o.id = v_primary_offering_id;

        v_new_offering_id := v_primary_offering_id;
      ELSE
        INSERT INTO public.business_offerings (
          business_id, title, description, description_fr, description_bi,
          discount, original_price, deal_price, image, map_url, website,
          discount_valid_from, discount_valid_until, whatsapp_number, pricing_tiers,
          tags, featured, active
        ) VALUES (
          v_pending.business_id,
          COALESCE(NULLIF(TRIM(v_pending.name), ''), 'Main offer'),
          v_desc,
          v_desc,
          v_desc,
          COALESCE(NULLIF(TRIM(v_pending.discount), ''), ''),
          COALESCE(v_pending.original_price::numeric, 0),
          COALESCE(v_pending.deal_price::numeric, 0),
          COALESCE(v_pending.image, ''),
          v_pending.map_url,
          v_pending.website,
          v_pending.discount_valid_from,
          v_pending.discount_valid_until,
          v_pending.whatsapp_number,
          v_pending.pricing_tiers,
          ARRAY[COALESCE(NULLIF(TRIM(v_pending.category), ''), 'dining')],
          false,
          true
        )
        RETURNING id INTO v_new_offering_id;
      END IF;

      UPDATE public.businesses b SET
        name = COALESCE(NULLIF(TRIM(v_pending.name), ''), b.name, 'Unnamed Business'),
        category = COALESCE(NULLIF(TRIM(v_pending.category), ''), b.category, 'dining'),
        description = v_desc,
        description_fr = v_desc,
        description_bi = v_desc,
        image = COALESCE(NULLIF(TRIM(v_pending.image), ''), b.image, ''),
        discount = COALESCE(NULLIF(TRIM(v_pending.discount), ''), ''),
        original_price = COALESCE(v_pending.original_price::numeric, 0),
        deal_price = COALESCE(v_pending.deal_price::numeric, 0),
        location = COALESCE(NULLIF(TRIM(v_pending.location), ''), b.location, 'Port Vila, Vanuatu'),
        hours = COALESCE(v_pending.hours, b.hours, ''),
        phone = COALESCE(v_pending.phone, b.phone, ''),
        map_url = v_pending.map_url,
        website = v_pending.website,
        discount_valid_from = v_pending.discount_valid_from,
        discount_valid_until = v_pending.discount_valid_until,
        whatsapp_number = v_pending.whatsapp_number,
        pricing_tiers = v_pending.pricing_tiers,
        tags = ARRAY[COALESCE(NULLIF(TRIM(v_pending.category), ''), 'dining')],
        email = COALESCE(v_email, b.email),
        contact_email = COALESCE(v_email, b.contact_email),
        business_email = COALESCE(v_email, b.business_email),
        active = true,
        updated_at = now()
      WHERE b.id = v_pending.business_id;

      UPDATE public.business_photos
      SET
        business_id = v_pending.business_id,
        pending_id = NULL,
        status = CASE
          WHEN status = 'rejected' THEN 'rejected'
          ELSE 'approved'
        END
      WHERE pending_id = p_pending_id
         OR (pending_id IS NULL AND business_id = p_pending_id);

      RETURN jsonb_build_object(
        'success', true,
        'new_business_id', v_pending.business_id,
        'new_offering_id', v_new_offering_id
      );
    END IF;

    v_desc := COALESCE(v_pending.description, '');
    v_email := NULLIF(TRIM(COALESCE(v_pending.email, '')), '');

    SELECT b.id INTO v_stub_id
    FROM public.businesses b
    WHERE b.owner_id = v_pending.owner_id
      AND b.active IS NOT TRUE
    ORDER BY b.created_at ASC
    LIMIT 1;

    IF v_stub_id IS NOT NULL THEN
      UPDATE public.businesses b SET
        name = COALESCE(NULLIF(TRIM(v_pending.name), ''), b.name, 'Unnamed Business'),
        category = COALESCE(NULLIF(TRIM(v_pending.category), ''), b.category, 'dining'),
        description = v_desc,
        description_fr = v_desc,
        description_bi = v_desc,
        image = COALESCE(v_pending.image, b.image, ''),
        discount = COALESCE(NULLIF(TRIM(v_pending.discount), ''), ''),
        original_price = COALESCE(v_pending.original_price::numeric, 0),
        deal_price = COALESCE(v_pending.deal_price::numeric, 0),
        location = COALESCE(NULLIF(TRIM(v_pending.location), ''), 'Port Vila, Vanuatu'),
        hours = COALESCE(v_pending.hours, ''),
        phone = COALESCE(v_pending.phone, ''),
        owner_id = v_pending.owner_id,
        tags = ARRAY[COALESCE(NULLIF(TRIM(v_pending.category), ''), 'dining')],
        map_url = v_pending.map_url,
        website = v_pending.website,
        discount_valid_from = v_pending.discount_valid_from,
        discount_valid_until = v_pending.discount_valid_until,
        whatsapp_number = v_pending.whatsapp_number,
        pricing_tiers = v_pending.pricing_tiers,
        email = COALESCE(v_email, b.email),
        contact_email = COALESCE(v_email, b.contact_email),
        business_email = COALESCE(v_email, b.business_email),
        active = true,
        updated_at = now()
      WHERE b.id = v_stub_id;

      v_new_biz_id := v_stub_id;
    ELSE
      INSERT INTO public.businesses (
        name, category, description, description_fr, description_bi,
        image, rating, review_count, discount, original_price, deal_price,
        location, hours, phone, owner_id, tags,
        map_url, website, discount_valid_from, discount_valid_until,
        whatsapp_number, pricing_tiers,
        email, contact_email, business_email,
        active
      ) VALUES (
        COALESCE(NULLIF(TRIM(v_pending.name), ''), 'Unnamed Business'),
        COALESCE(NULLIF(TRIM(v_pending.category), ''), 'dining'),
        v_desc,
        v_desc,
        v_desc,
        COALESCE(v_pending.image, ''),
        0, 0,
        COALESCE(NULLIF(TRIM(v_pending.discount), ''), ''),
        COALESCE(v_pending.original_price::numeric, 0),
        COALESCE(v_pending.deal_price::numeric, 0),
        COALESCE(NULLIF(TRIM(v_pending.location), ''), 'Port Vila, Vanuatu'),
        COALESCE(v_pending.hours, ''),
        COALESCE(v_pending.phone, ''),
        v_pending.owner_id,
        ARRAY[COALESCE(NULLIF(TRIM(v_pending.category), ''), 'dining')],
        v_pending.map_url,
        v_pending.website,
        v_pending.discount_valid_from,
        v_pending.discount_valid_until,
        v_pending.whatsapp_number,
        v_pending.pricing_tiers,
        v_email,
        v_email,
        v_email,
        true
      )
      RETURNING id INTO v_new_biz_id;
    END IF;

    IF to_regclass('public.business_offerings') IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.business_offerings o WHERE o.business_id = v_new_biz_id) THEN
        UPDATE public.business_offerings o SET
          title = COALESCE(NULLIF(TRIM(v_pending.name), ''), o.title),
          description = v_desc,
          description_fr = v_desc,
          description_bi = v_desc,
          discount = COALESCE(NULLIF(TRIM(v_pending.discount), ''), ''),
          original_price = COALESCE(v_pending.original_price::numeric, 0),
          deal_price = COALESCE(v_pending.deal_price::numeric, 0),
          image = COALESCE(NULLIF(TRIM(v_pending.image), ''), o.image, ''),
          map_url = v_pending.map_url,
          website = v_pending.website,
          discount_valid_from = v_pending.discount_valid_from,
          discount_valid_until = v_pending.discount_valid_until,
          whatsapp_number = v_pending.whatsapp_number,
          pricing_tiers = v_pending.pricing_tiers,
          tags = ARRAY[COALESCE(NULLIF(TRIM(v_pending.category), ''), 'dining')],
          active = true,
          updated_at = now()
        WHERE o.id = (
          SELECT o2.id
          FROM public.business_offerings o2
          WHERE o2.business_id = v_new_biz_id
          ORDER BY o2.created_at ASC
          LIMIT 1
        );
      ELSE
        INSERT INTO public.business_offerings (
          business_id, title, description, description_fr, description_bi,
          discount, original_price, deal_price, image, map_url, website,
          discount_valid_from, discount_valid_until, whatsapp_number, pricing_tiers,
          tags, featured, active
        ) VALUES (
          v_new_biz_id,
          COALESCE(NULLIF(TRIM(v_pending.name), ''), 'Main offer'),
          v_desc,
          v_desc,
          v_desc,
          COALESCE(NULLIF(TRIM(v_pending.discount), ''), ''),
          COALESCE(v_pending.original_price::numeric, 0),
          COALESCE(v_pending.deal_price::numeric, 0),
          COALESCE(v_pending.image, ''),
          v_pending.map_url,
          v_pending.website,
          v_pending.discount_valid_from,
          v_pending.discount_valid_until,
          v_pending.whatsapp_number,
          v_pending.pricing_tiers,
          ARRAY[COALESCE(NULLIF(TRIM(v_pending.category), ''), 'dining')],
          false,
          true
        );
      END IF;
    END IF;

    UPDATE public.business_photos
    SET
      business_id = v_new_biz_id,
      pending_id = NULL,
      status = CASE
        WHEN status = 'rejected' THEN 'rejected'
        ELSE 'approved'
      END
    WHERE pending_id = p_pending_id
       OR (pending_id IS NULL AND business_id = p_pending_id);

    RETURN jsonb_build_object('success', true, 'new_business_id', v_new_biz_id);
  ELSE
    RETURN jsonb_build_object('success', true);
  END IF;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.review_pending_business(uuid, text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- C) Mark listing-copy columns on businesses as deprecated (canonical: business_offerings)
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.businesses.discount IS 'DEPRECATED: Use business_offerings.discount';
COMMENT ON COLUMN public.businesses.original_price IS 'DEPRECATED: Use business_offerings.original_price';
COMMENT ON COLUMN public.businesses.deal_price IS 'DEPRECATED: Use business_offerings.deal_price';
COMMENT ON COLUMN public.businesses.discount_valid_from IS 'DEPRECATED: Use business_offerings.discount_valid_from';
COMMENT ON COLUMN public.businesses.discount_valid_until IS 'DEPRECATED: Use business_offerings.discount_valid_until';
COMMENT ON COLUMN public.businesses.description IS 'DEPRECATED: Use business_offerings.description';
COMMENT ON COLUMN public.businesses.image IS 'DEPRECATED: Use business_offerings.image';
COMMENT ON COLUMN public.businesses.featured IS 'DEPRECATED: Use business_offerings.featured';
COMMENT ON COLUMN public.businesses.tags IS 'DEPRECATED: Use business_offerings.tags';

-- ═══════════════════════════════════════════════════════════════════════════
-- D) Keep businesses rows in sync when user_profiles business_* fields change
--    (Updates every businesses row for this owner_id.)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS contact_email text;

CREATE OR REPLACE FUNCTION public.sync_user_profile_to_business()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (
    NEW.business_name IS DISTINCT FROM OLD.business_name
    OR NEW.business_phone IS DISTINCT FROM OLD.business_phone
    OR NEW.business_email IS DISTINCT FROM OLD.business_email
    OR NEW.business_location IS DISTINCT FROM OLD.business_location
  ) THEN
    UPDATE public.businesses
    SET
      name = COALESCE(NEW.business_name, name),
      phone = COALESCE(NEW.business_phone, phone),
      contact_email = COALESCE(NEW.business_email, contact_email),
      location = COALESCE(NEW.business_location, location),
      updated_at = NOW()
    WHERE owner_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_to_business_trigger ON public.user_profiles;
CREATE TRIGGER sync_profile_to_business_trigger
  AFTER UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_profile_to_business();

