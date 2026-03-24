-- Ensure authenticated tourists can SELECT their own redemptions (Savings Tracker / Dashboard).
-- Safe to run if policies already exist (idempotent names).

ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.redemptions TO authenticated;

DROP POLICY IF EXISTS "redemptions_select_own" ON public.redemptions;
CREATE POLICY "redemptions_select_own"
  ON public.redemptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON POLICY "redemptions_select_own" ON public.redemptions IS
  'Tourists read only their own redemption rows for Savings Tracker.';
