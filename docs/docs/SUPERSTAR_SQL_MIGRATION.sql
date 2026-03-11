-- ═══════════════════════════════════════════════════════════════
-- Superstar Review — SQL Migration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Allow rating 6 in public.reviews
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_rating_check;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_rating_check CHECK (rating >= 1 AND rating <= 6);

-- 2. Add superstar_credits to user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS superstar_credits integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_profiles.superstar_credits IS 'Super Star review credits. Incremented on purchase, decremented on 6-star review submit.';

-- 3. RPC: Submit Superstar review (atomic decrement + insert)
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

GRANT EXECUTE ON FUNCTION public.submit_superstar_review(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_superstar_review(uuid, text, text) TO service_role;

-- 4. RPC: Increment superstar_credits (for Edge Function after purchase)
CREATE OR REPLACE FUNCTION public.increment_superstar_credits(p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id uuid;
  v_new_count integer;
BEGIN
  v_target_id := COALESCE(p_user_id, auth.uid());
  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.user_profiles
  SET superstar_credits = superstar_credits + 1,
      updated_at = now()
  WHERE user_id = v_target_id
  RETURNING superstar_credits INTO v_new_count;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  RETURN v_new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_superstar_credits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_superstar_credits(uuid) TO service_role;
