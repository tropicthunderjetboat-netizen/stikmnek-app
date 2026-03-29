-- Require owner_id = auth.uid() for public.businesses INSERT (owner-scoped listings / profile stubs).
DROP POLICY IF EXISTS "businesses_insert_auth" ON public.businesses;

CREATE POLICY "businesses_insert_auth"
  ON public.businesses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

COMMENT ON POLICY "businesses_insert_auth" ON public.businesses IS
  'Authenticated users may only insert rows they own (owner_id must match JWT).';
