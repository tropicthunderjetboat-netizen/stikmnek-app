-- ═══════════════════════════════════════════════════════════════
-- Fix review_pending_business RPC
--
-- 1. Include owner_id in businesses INSERT (CRITICAL - without it,
--    get_owner_businesses returns nothing and Business Hub shows empty)
-- 2. Use canonical schema: image, discount, deal_price, hours
--    (matches database-setup.sql; avoids "column not found" errors)
-- 3. Add tags, whatsapp_number, map_url, website, discount_valid_* if present
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.review_pending_business(
  p_pending_id uuid,
  p_decision text,  -- 'approved' | 'rejected'
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

  -- Fetch pending business
  SELECT * INTO v_pending
  FROM public.pending_businesses
  WHERE id = p_pending_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending business not found or already reviewed';
  END IF;

  -- Update pending_businesses status
  UPDATE public.pending_businesses
  SET status = p_decision, admin_notes = p_admin_notes, updated_at = now()
  WHERE id = p_pending_id;

  IF p_decision = 'approved' THEN
    -- Insert into businesses using canonical schema (image, discount, deal_price, hours, owner_id)
    -- CRITICAL: owner_id must be set so get_owner_businesses / get_all_owner_data return the business
    -- Schema align migration (20250311230000) ensures image, discount, deal_price, hours exist
    INSERT INTO public.businesses (
      name, category, description, description_fr, description_bi,
      image, rating, review_count, discount, original_price, deal_price,
      location, hours, phone, owner_id, tags,
      map_url, website, discount_valid_from, discount_valid_until
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
      v_pending.discount_valid_until
    )
    RETURNING id INTO v_new_biz_id;

    -- Update business_photos: point to new business id AND set status = 'approved' so they're visible
    UPDATE public.business_photos
    SET business_id = v_new_biz_id, status = 'approved'
    WHERE business_id = p_pending_id;

    RETURN jsonb_build_object('success', true, 'new_business_id', v_new_biz_id);
  ELSE
    RETURN jsonb_build_object('success', true);
  END IF;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.review_pending_business TO authenticated;
