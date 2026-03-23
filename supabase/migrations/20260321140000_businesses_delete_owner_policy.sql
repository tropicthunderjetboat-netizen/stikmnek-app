-- Allow business owners to delete their own listing (defense in depth; primary path is manage-business Edge Function).
DROP POLICY IF EXISTS "businesses_delete_owner" ON public.businesses;

CREATE POLICY "businesses_delete_owner"
  ON public.businesses FOR DELETE
  USING (auth.uid() = owner_id);

COMMENT ON POLICY "businesses_delete_owner" ON public.businesses IS 'Owner may delete own listing; service role bypasses RLS for admin/edge flows.';
