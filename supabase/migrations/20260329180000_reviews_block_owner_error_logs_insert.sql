-- Block business owners from inserting reviews on their own profile (1–5 and Super Star path).
-- Fix error_logs client inserts (403) when INSERT was not granted to anon/authenticated.

-- ─── REVIEWS: no self-reviews ───
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
  );

-- ─── SUPER STAR RPC: check before consuming a credit ───
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
  v_credits integer;
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
    RAISE EXCEPTION 'You cannot review your own business';
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

-- ─── ERROR_LOGS: allow client-side logging ───
DO $$
BEGIN
  IF to_regclass('public.error_logs') IS NULL THEN
    RAISE NOTICE 'Skipping error_logs grants: table public.error_logs does not exist';
  ELSE
    EXECUTE 'GRANT INSERT ON public.error_logs TO anon';
    EXECUTE 'GRANT INSERT ON public.error_logs TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "error_logs_insert_all" ON public.error_logs';
    EXECUTE 'CREATE POLICY "error_logs_insert_all" ON public.error_logs FOR INSERT TO anon, authenticated WITH CHECK (true)';
  END IF;
END $$;
