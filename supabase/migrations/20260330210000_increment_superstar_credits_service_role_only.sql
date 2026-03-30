-- increment_superstar_credits must only run with service_role (Edge Functions).
-- Clients must not invoke this SECURITY DEFINER RPC directly.

REVOKE ALL ON FUNCTION public.increment_superstar_credits(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_superstar_credits(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_superstar_credits(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.increment_superstar_credits(uuid) TO service_role;
