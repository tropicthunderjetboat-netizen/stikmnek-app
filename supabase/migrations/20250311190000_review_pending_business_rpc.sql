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
    -- Insert into businesses
    INSERT INTO public.businesses (
      owner_id, name, category, description, discount,
      original_price, deal_price, location, phone, hours,
      image, map_url, website, discount_valid_from, discount_valid_until,
      whatsapp_number
    ) VALUES (
      v_pending.owner_id, v_pending.name, v_pending.category, v_pending.description,
      COALESCE(v_pending.discount, ''),
      COALESCE(v_pending.original_price, 0), COALESCE(v_pending.deal_price, 0),
      COALESCE(v_pending.location, ''), v_pending.phone, v_pending.hours,
      v_pending.image, v_pending.map_url, v_pending.website,
      v_pending.discount_valid_from, v_pending.discount_valid_until,
      v_pending.whatsapp_number
    )
    RETURNING id INTO v_new_biz_id;

    -- Update business_photos: change business_id from pending id to new business id
    UPDATE public.business_photos
    SET business_id = v_new_biz_id
    WHERE business_id = p_pending_id;

    RETURN jsonb_build_object('success', true, 'new_business_id', v_new_biz_id);
  ELSE
    RETURN jsonb_build_object('success', true);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_pending_business TO authenticated;
