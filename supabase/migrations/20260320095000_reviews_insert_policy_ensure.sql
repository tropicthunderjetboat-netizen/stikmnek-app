-- Ensure RLS + INSERT policy for reviews works for authenticated tourists.
-- Symptom: "permission denied for table reviews" when submitting 5-star or less reviews.

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

GRANT INSERT, SELECT ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;

DROP POLICY IF EXISTS "reviews_insert_auth" ON public.reviews;
CREATE POLICY "reviews_insert_auth"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

-- Keep read policy permissive
DROP POLICY IF EXISTS "reviews_select_all" ON public.reviews;
CREATE POLICY "reviews_select_all"
  ON public.reviews FOR SELECT
  USING (true);

