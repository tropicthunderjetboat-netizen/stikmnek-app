-- Reviews & Super Star: require a redemption within the last 30 days (recent experience model).

-- ─── RLS: standard 1–5 reviews ───
DROP POLICY IF EXISTS "reviews_insert_auth" ON public.reviews;
CREATE POLICY "reviews_insert_auth"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = business_id
        AND b.owner_id IS NOT NULL
        AND b.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.redemptions r
      WHERE r.user_id = auth.uid()
        AND r.business_id = business_id
        AND r.redeemed_at IS NOT NULL
        AND r.redeemed_at >= (now() - interval '30 days')
    )
  );

COMMENT ON POLICY "reviews_insert_auth" ON public.reviews IS
  'Insert reviews only if not the owner and redeemed at this business within the last 30 days.';

-- ─── Super Star RPC (SECURITY DEFINER) ───
CREATE OR REPLACE FUNCTION public.submit_superstar_review(
  p_business_id uuid,
  p_user_name text,
  p_comment text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_review jsonb;
  v_redemption_any bigint;
  v_redemption_recent bigint;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id = p_business_id
      AND b.owner_id IS NOT NULL
      AND b.owner_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You cannot leave a review for your own business.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*) INTO v_redemption_any
  FROM ONLY public.redemptions AS r
  WHERE r.user_id = v_user_id
    AND r.business_id = p_business_id;

  SELECT COUNT(*) INTO v_redemption_recent
  FROM ONLY public.redemptions AS r
  WHERE r.user_id = v_user_id
    AND r.business_id = p_business_id
    AND r.redeemed_at IS NOT NULL
    AND r.redeemed_at >= (now() - interval '30 days');

  IF COALESCE(v_redemption_recent, 0) < 1 THEN
    IF COALESCE(v_redemption_any, 0) >= 1 THEN
      RAISE EXCEPTION 'Review window expired. Reviews must be submitted within 30 days of your visit.'
        USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'You must redeem a service from this business before leaving a review.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.user_profiles
  SET superstar_credits = superstar_credits - 1,
      updated_at = now()
  WHERE user_id = v_user_id
    AND superstar_credits > 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No Super Star credits available. Purchase a Super Star first.';
  END IF;

  INSERT INTO public.reviews (business_id, user_id, user_name, rating, comment, has_super_star)
  VALUES (p_business_id, v_user_id, p_user_name, 6, p_comment, true)
  RETURNING row_to_json(reviews.*)::jsonb INTO v_review;

  RETURN v_review;
END;
$$;
