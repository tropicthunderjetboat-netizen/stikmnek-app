-- Fix: multi-listing businesses should not pool gallery photos into the first offering.
--
-- Symptom:
-- - Business creates first listing (offering A) with 5 photos.
-- - Subsequent listings (offering B/C/...) upload photos, but after approval those photos appear under offering A,
--   and other listings only retain their hero image.
--
-- Cause:
-- - Pending submissions for existing profiles (`pending_businesses.business_id IS NOT NULL`) were approved by
--   updating the *primary* offering and then (implicitly/incorrectly) attaching approved photos to that offering,
--   or not stamping `offering_id` at all (legacy fallback pooled untagged rows).
--
-- Fix:
-- - When approving a pending submission that targets an existing profile, create a NEW `business_offerings` row.
-- - Relink *only that submission’s* pending photos to the new offering via `business_photos.offering_id`.
-- - Use `pending_id`/`submission_pending_id` when available; fall back to legacy `business_id = pending_uuid`.

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

  -- Validation on approve (keep aligned with existing RPC checks)
  IF p_decision = 'approved' THEN
    IF length(trim(coalesce(v_pending.description, ''))) = 0 THEN
      RAISE EXCEPTION 'Description cannot be empty.'
        USING ERRCODE = 'P0001';
    END IF;

    IF coalesce(trim(v_pending.image), '') = '' AND NOT EXISTS (
      SELECT 1 FROM public.business_photos bp
      WHERE (bp.pending_id = p_pending_id OR bp.submission_pending_id = p_pending_id OR bp.business_id = p_pending_id)
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
    -- A) Existing profile: create a NEW offering (do NOT overwrite primary offering)
    IF v_pending.business_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = v_pending.business_id AND b.owner_id = v_pending.owner_id
      ) THEN
        RAISE EXCEPTION 'Invalid business_id for pending submission';
      END IF;

      v_desc := COALESCE(v_pending.description, '');

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

      -- Relink this submission’s photos to the approved business + the new offering.
      UPDATE public.business_photos
      SET
        business_id = v_pending.business_id,
        pending_id = NULL,
        offering_id = CASE WHEN status = 'rejected' THEN offering_id ELSE v_new_offering_id END,
        status = CASE
          WHEN status = 'rejected' THEN 'rejected'
          ELSE 'approved'
        END
      WHERE pending_id = p_pending_id
         OR submission_pending_id = p_pending_id
         OR (pending_id IS NULL AND business_id = p_pending_id);

      RETURN jsonb_build_object(
        'success', true,
        'new_business_id', v_pending.business_id,
        'new_offering_id', v_new_offering_id
      );
    END IF;

    -- B) New business approval (create/merge stub), then ensure at least one offering.
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

    -- Ensure an offering exists for this business (keep primary synced)
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
          SELECT o2.id FROM public.business_offerings o2
          WHERE o2.business_id = v_new_biz_id
          ORDER BY o2.created_at ASC
          LIMIT 1
        );
        SELECT o3.id INTO v_new_offering_id
        FROM public.business_offerings o3
        WHERE o3.business_id = v_new_biz_id
        ORDER BY o3.created_at ASC
        LIMIT 1;
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
        )
        RETURNING id INTO v_new_offering_id;
      END IF;
    END IF;

    -- Relink photos from this submission onto the business and primary offering.
    UPDATE public.business_photos
    SET
      business_id = v_new_biz_id,
      pending_id = NULL,
      offering_id = CASE WHEN status = 'rejected' THEN offering_id ELSE v_new_offering_id END,
      status = CASE
        WHEN status = 'rejected' THEN 'rejected'
        ELSE 'approved'
      END
    WHERE pending_id = p_pending_id
       OR submission_pending_id = p_pending_id
       OR (pending_id IS NULL AND business_id = p_pending_id);

    RETURN jsonb_build_object(
      'success', true,
      'new_business_id', v_new_biz_id,
      'new_offering_id', v_new_offering_id
    );
  END IF;

  -- rejected
  RETURN jsonb_build_object('success', true, 'new_business_id', v_pending.business_id);
END;
$func$;

