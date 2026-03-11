-- ═══════════════════════════════════════════════════════════════
-- review_pending_business RPC
--
-- Approves or rejects a pending business submission.
-- Bypasses RLS — runs as postgres. Verifies caller is admin.
-- On approve: updates pending_businesses status, inserts into businesses,
-- updates business_photos to point to new business id.
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
AS $$
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
    -- Insert into businesses (matches actual schema: image_url, deal, discounted_price, opening_hours)
    INSERT INTO public.businesses (
      name, category, description, description_fr, description_bi,
      image_url, rating, review_count, deal, original_price, discounted_price,
      location, opening_hours, phone
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
      v_pending.hours,
      v_pending.phone
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
$$;

GRANT EXECUTE ON FUNCTION public.review_pending_business TO authenticated;
