-- Tiered pricing on pending submissions + pass through on approval to businesses

ALTER TABLE public.pending_businesses
  ADD COLUMN IF NOT EXISTS pricing_tiers jsonb;

COMMENT ON COLUMN public.pending_businesses.pricing_tiers IS
  'Optional JSON array of pricing tiers (same shape as public.businesses.pricing_tiers).';

-- ═══════════════════════════════════════════════════════════════
-- insert_pending_business — add p_pricing_tiers
-- DROP old overload first: same name + different arg list => not replaceable by CREATE OR REPLACE
-- Previous signature (17 args, no p_pricing_tiers):
--   (uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, text, date, date, text)
-- ═══════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.insert_pending_business(
  uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, text, date, date, text
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
  p_pricing_tiers jsonb DEFAULT NULL
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

  INSERT INTO public.pending_businesses (
    owner_id, name, category, description, discount,
    original_price, deal_price, location, phone, email, hours,
    image, map_url, website, discount_valid_from, discount_valid_until,
    whatsapp_number, pricing_tiers, status
  ) VALUES (
    p_owner_id, p_name, p_category, p_description, p_discount,
    p_original_price, p_deal_price, p_location, p_phone, p_email, p_hours,
    p_image, p_map_url, p_website, p_discount_valid_from, p_discount_valid_until,
    p_whatsapp_number, p_pricing_tiers, 'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_pending_business(
  uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, text, date, date, text, jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_pending_business(
  uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, text, date, date, text, jsonb
) TO service_role;

-- ═══════════════════════════════════════════════════════════════
-- review_pending_business — copy pricing_tiers into businesses
-- DROP first so body/INSERT list can change without signature change issues on some PG versions
-- Signature unchanged: (uuid, text, text)
-- ═══════════════════════════════════════════════════════════════
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
    INSERT INTO public.businesses (
      name, category, description, description_fr, description_bi,
      image, rating, review_count, discount, original_price, deal_price,
      location, hours, phone, owner_id, tags,
      map_url, website, discount_valid_from, discount_valid_until,
      whatsapp_number, pricing_tiers
    ) VALUES (
      COALESCE(NULLIF(TRIM(v_pending.name), ''), 'Unnamed Business'),
      COALESCE(NULLIF(TRIM(v_pending.category), ''), 'dining'),
      v_pending.description,
      v_pending.description,
      v_pending.description,
      COALESCE(v_pending.image, ''),
      0, 0,
      COALESCE(NULLIF(TRIM(v_pending.discount), ''), ''),
      COALESCE(v_pending.original_price::numeric, 0),
      COALESCE(v_pending.deal_price::numeric, 0),
      COALESCE(NULLIF(TRIM(v_pending.location), ''), 'Port Vila, Vanuatu'),
      COALESCE(v_pending.hours, ''),
      v_pending.phone,
      v_pending.owner_id,
      ARRAY[COALESCE(NULLIF(TRIM(v_pending.category), ''), 'dining')],
      v_pending.map_url,
      v_pending.website,
      v_pending.discount_valid_from,
      v_pending.discount_valid_until,
      v_pending.whatsapp_number,
      v_pending.pricing_tiers
    )
    RETURNING id INTO v_new_biz_id;

    UPDATE public.business_photos
    SET business_id = v_new_biz_id, status = 'approved'
    WHERE business_id = p_pending_id;

    RETURN jsonb_build_object('success', true, 'new_business_id', v_new_biz_id);
  ELSE
    RETURN jsonb_build_object('success', true);
  END IF;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.review_pending_business(uuid, text, text) TO authenticated;
