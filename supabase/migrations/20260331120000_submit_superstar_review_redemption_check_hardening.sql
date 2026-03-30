-- Harden submit_superstar_review redemption validation.
--
-- If a Super Star review slips through without a redemption, typical causes:
-- 1) Production DB never ran the migration that adds the redemption block (verify with query below).
-- 2) A row actually exists in public.redemptions for (auth.uid(), p_business_id) — user may have
--    redeemed earlier, tested QR flow, or shares a profile with another device.
-- 3) The review was not created by this RPC (e.g. direct INSERT / API with a JWT that bypasses checks).
--
-- Verify deployed function body (Dashboard → Database → Functions, or):
--   SELECT pg_get_functiondef('public.submit_superstar_review(uuid,text,text)'::regprocedure);
--
-- Audit redemptions for a user + business:
--   SELECT id, redeemed_at FROM public.redemptions
--   WHERE user_id = '<user-uuid>' AND business_id = '<business-uuid>';

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
  v_redemption_count bigint;
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

  -- Explicit COUNT on real table (ONLY = skip inheritance edge cases). Definer bypasses RLS on redemptions.
  SELECT COUNT(*) INTO v_redemption_count
  FROM ONLY public.redemptions AS r
  WHERE r.user_id = v_user_id
    AND r.business_id = p_business_id;

  IF COALESCE(v_redemption_count, 0) < 1 THEN
    RAISE EXCEPTION 'You must redeem a service from this business before leaving a review.'
      USING ERRCODE = 'P0001';
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
