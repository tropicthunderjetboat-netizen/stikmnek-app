-- Reviews: require at least one redemption for the (user, business) pair before INSERT.
-- Standard 1–5 reviews: enforced via RLS on public.reviews.
-- Super Star (RPC): SECURITY DEFINER bypasses RLS — same rules enforced inside submit_superstar_review.

-- ─── REVIEWS INSERT: not own business + must have redeemed ───
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
    )
  );

COMMENT ON POLICY "reviews_insert_auth" ON public.reviews IS
  'Authenticated users may insert reviews only if they are not the business owner and have at least one redemption for that business.';

-- ─── SUPER STAR RPC: same checks before spending a credit (runs as SECURITY DEFINER; RLS not applied) ───
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = p_business_id
      AND b.owner_id IS NOT NULL
      AND b.owner_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You cannot leave a review for your own business.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.redemptions r
    WHERE r.user_id = v_user_id
      AND r.business_id = p_business_id
  ) THEN
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
  RETURNING row_to_json(reviews)::jsonb INTO v_review;

  RETURN v_review;
END;
$$;
