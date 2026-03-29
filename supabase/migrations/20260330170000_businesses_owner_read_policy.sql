-- Owners must be able to SELECT their own businesses row even when active = false and
-- before/without a public offering, otherwise business_offerings policies that use
-- EXISTS (SELECT FROM businesses WHERE owner_id = auth.uid()) see zero rows and RLS
-- hides all offerings from the owner (My Submissions / dashboard embeds break).
--
-- Also force the helper to evaluate offerings without RLS so anon embed joins stay reliable.

DO $rls$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'business_has_active_public_offering'
  ) THEN
    ALTER FUNCTION public.business_has_active_public_offering(uuid) SET row_security = off;
  END IF;
END
$rls$;

DROP POLICY IF EXISTS "businesses_owner_select_own" ON public.businesses;
CREATE POLICY "businesses_owner_select_own"
  ON public.businesses FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

COMMENT ON POLICY "businesses_owner_select_own" ON public.businesses IS
  'Authenticated owner can always read their profile row (stub or live); does not use business_offerings (no recursion).';
