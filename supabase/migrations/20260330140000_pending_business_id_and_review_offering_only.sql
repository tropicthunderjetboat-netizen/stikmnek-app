-- Pending submissions can target an existing profile (businesses.id) via business_id.
-- On approve: insert business_offerings only; repoint photos to profile businesses.id.

-- ═══ insert_pending_business: add p_business_id ═══
DROP FUNCTION IF EXISTS public.insert_pending_business(
  uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, text, date, date, text, jsonb
);

CREATE OR REPLACE FUNCTION public.insert_pending_business(
  p_owner_id uuid,
  p_name text,
  p_category text DEFAULT 'dining',
  p_description text DEFAULT '',
  p_discount text DEFAULT '',
  p_original_price numeric DEFAULT 0,
  p_deal_price numeric DEFAULT 0,
  p_location text DEFAULT 'Port Vila, Vanuatu',
  p_phone text DEFAULT '',
  p_email text DEFAULT '',
  p_hours text DEFAULT '',
  p_image text DEFAULT '',
  p_map_url text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_discount_valid_from date DEFAULT NULL,
  p_discount_valid_until date DEFAULT NULL,
  p_whatsapp_number text DEFAULT NULL,
  p_pricing_tiers jsonb DEFAULT NULL,
  p_business_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF auth.uid() != p_owner_id THEN
    RAISE EXCEPTION 'owner_id must match authenticated user';
  END IF;

  IF p_business_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = p_business_id AND b.owner_id = p_owner_id
    ) THEN
      RAISE EXCEPTION 'business_id must belong to the authenticated owner';
    END IF;
  END IF;

  INSERT INTO public.pending_businesses (
    owner_id, business_id, name, category, description, discount,
    original_price, deal_price, location, phone, email, hours,
    image, map_url, website, discount_valid_from, discount_valid_until,
    whatsapp_number, pricing_tiers, status
  ) VALUES (
    p_owner_id, p_business_id, p_name, p_category, p_description, p_discount,
    p_original_price, p_deal_price, p_location, p_phone, p_email, p_hours,
    p_image, p_map_url, p_website, p_discount_valid_from, p_discount_valid_until,
    p_whatsapp_number, p_pricing_tiers, 'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_pending_business(
  uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, text, date, date, text, jsonb, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_pending_business(
  uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, text, date, date, text, jsonb, uuid
) TO service_role;

-- ═══ review_pending_business: offering-only approval when business_id set ═══
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
  v_stub_id uuid;
  v_email text;
  v_desc text;
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

  UPDATE public.pending_businesses
  SET status = p_decision, admin_notes = p_admin_notes, updated_at = now()
  WHERE id = p_pending_id;

  IF p_decision = 'approved' THEN
    -- New listing on existing profile: only create business_offerings row.
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

      UPDATE public.business_photos
      SET
        business_id = v_pending.business_id,
        status = CASE
          WHEN status = 'rejected' THEN 'rejected'
          ELSE 'approved'
        END
      WHERE business_id = p_pending_id;

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
        WHERE o.business_id = v_new_biz_id;
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
      status = CASE
        WHEN status = 'rejected' THEN 'rejected'
        ELSE 'approved'
      END
    WHERE business_id = p_pending_id;

    RETURN jsonb_build_object('success', true, 'new_business_id', v_new_biz_id);
  ELSE
    RETURN jsonb_build_object('success', true);
  END IF;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.review_pending_business(uuid, text, text) TO authenticated;
