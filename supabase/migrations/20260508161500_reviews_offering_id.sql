-- Add offering-level review association so reviews attach to a specific listing/deal.
-- Existing rows remain business-level (offering_id NULL) and should still render as a fallback.

ALTER TABLE IF EXISTS public.reviews
  ADD COLUMN IF NOT EXISTS offering_id uuid NULL;

-- Helpful for filtering listing pages and dashboards.
CREATE INDEX IF NOT EXISTS reviews_offering_id_created_at_idx
  ON public.reviews (offering_id, created_at DESC);

-- Keep referential integrity when possible (offering can be deleted; keep review row).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'business_offerings'
  ) THEN
    ALTER TABLE public.reviews
      DROP CONSTRAINT IF EXISTS reviews_offering_id_fkey;
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_offering_id_fkey
      FOREIGN KEY (offering_id)
      REFERENCES public.business_offerings(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Update Super Star RPC to stamp offering_id (default keeps backwards compatibility).
CREATE OR REPLACE FUNCTION public.submit_superstar_review(
  p_business_id uuid,
  p_user_name text,
  p_comment text,
  p_offering_id uuid DEFAULT NULL
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

  INSERT INTO public.reviews (business_id, offering_id, user_id, user_name, rating, comment, has_super_star)
  VALUES (p_business_id, p_offering_id, v_user_id, p_user_name, 6, p_comment, true)
  RETURNING row_to_json(reviews)::jsonb INTO v_review;

  RETURN v_review;
END;
$$;

