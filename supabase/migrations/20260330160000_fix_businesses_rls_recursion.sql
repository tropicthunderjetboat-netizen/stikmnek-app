-- Fix: "infinite recursion detected in policy for relation businesses"
-- Cause: businesses SELECT policy subqueried business_offerings; authenticated
-- offerings policies subquery businesses → cycle.
-- Replace inline EXISTS with SECURITY DEFINER helper (runs without re-entering RLS loop).

DROP POLICY IF EXISTS "businesses_select_for_active_offerings" ON public.businesses;

CREATE OR REPLACE FUNCTION public.business_has_active_public_offering(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_offerings o
    WHERE o.business_id = p_business_id AND o.active IS TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.business_has_active_public_offering(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_has_active_public_offering(uuid) TO anon, authenticated;

CREATE POLICY "businesses_select_for_active_offerings"
  ON public.businesses FOR SELECT
  TO anon, authenticated
  USING (public.business_has_active_public_offering(id));

COMMENT ON FUNCTION public.business_has_active_public_offering(uuid) IS
  'RLS helper: true if profile has at least one active offering (bypasses offering↔business policy cycle).';

COMMENT ON POLICY "businesses_select_for_active_offerings" ON public.businesses IS
  'Public/app can load master profile for embed joins when at least one active offering exists (stub profiles may have active = false).';
