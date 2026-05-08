-- Grant service_role access to analytics_events for Edge Function aggregates.
-- Note: service role bypasses RLS but still requires SQL privileges (GRANT).

GRANT SELECT, INSERT ON public.analytics_events TO service_role;

