-- Supabase Data API: explicit GRANTs for public tables (May/Oct 2026 rollout).
-- See: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
--
-- New tables in `public` are not exposed to PostgREST / supabase-js until roles are granted.
-- RLS still applies after grants; without GRANT, clients get SQLSTATE 42501.

-- business_credentials: edge functions (manage-business) use service_role; it bypasses RLS
-- but still needs table-level privileges (same pattern as analytics_events).
GRANT ALL ON public.business_credentials TO service_role;
