-- Review responses: public read, business-owner write, one response per review.
-- Fixes: dashboard loaded responses from get_analytics (no responses key) + tighten INSERT policy.

-- Ensure table exists (no-op if already created in database-setup / earlier migrations)
CREATE TABLE IF NOT EXISTS public.review_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id     uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  response      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;

-- API access
GRANT SELECT ON public.review_responses TO anon, authenticated;
GRANT INSERT, UPDATE ON public.review_responses TO authenticated;
GRANT ALL ON public.review_responses TO service_role;

-- Public / tourists can read all responses (shown under reviews on listings)
DROP POLICY IF EXISTS "review_responses_select_all" ON public.review_responses;
CREATE POLICY "review_responses_select_all"
  ON public.review_responses FOR SELECT
  USING (true);

-- Replace loose INSERT (any authenticated) with business-owner only
DROP POLICY IF EXISTS "review_responses_insert_auth" ON public.review_responses;
DROP POLICY IF EXISTS "review_responses_insert_business_owner" ON public.review_responses;
CREATE POLICY "review_responses_insert_business_owner"
  ON public.review_responses FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = review_responses.business_id
        AND b.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.reviews r
      WHERE r.id = review_responses.review_id
        AND r.business_id = review_responses.business_id
    )
  );

-- Owner can update their business's responses
DROP POLICY IF EXISTS "review_responses_update_own" ON public.review_responses;
DROP POLICY IF EXISTS "review_responses_update_own_business_owner" ON public.review_responses;
CREATE POLICY "review_responses_update_own_business_owner"
  ON public.review_responses FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = review_responses.business_id
        AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = review_responses.business_id
        AND b.owner_id = auth.uid()
    )
  );

-- One reply per review (keep newest if duplicates exist)
DELETE FROM public.review_responses
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY review_id ORDER BY created_at DESC, id DESC) AS rn
    FROM public.review_responses
  ) t WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_review_responses_review_id_unique ON public.review_responses (review_id);

CREATE INDEX IF NOT EXISTS idx_review_responses_business_id ON public.review_responses(business_id);
