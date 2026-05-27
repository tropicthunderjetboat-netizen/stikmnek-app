-- Audit: public tables that may lack Data API grants for anon/authenticated/service_role.
-- Run in Supabase SQL Editor (read-only). Fix gaps with explicit GRANT in a migration.
--
-- After Oct 30, 2026, new tables without grants return 42501 from PostgREST.
-- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

WITH roles AS (
  SELECT unnest(ARRAY['anon', 'authenticated', 'service_role']::name[]) AS role_name
),
public_tables AS (
  SELECT c.oid, n.nspname AS schema_name, c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
),
missing AS (
  SELECT
    pt.table_name,
    r.role_name,
    CASE
      WHEN has_table_privilege(r.role_name, pt.oid, 'SELECT') THEN 'yes'
      ELSE 'no'
    END AS can_select,
    CASE
      WHEN has_table_privilege(r.role_name, pt.oid, 'INSERT') THEN 'yes'
      ELSE 'no'
    END AS can_insert
  FROM public_tables pt
  CROSS JOIN roles r
)
SELECT
  table_name,
  role_name,
  can_select,
  can_insert
FROM missing
WHERE can_select = 'no' AND can_insert = 'no'
ORDER BY table_name, role_name;

-- Tables with zero privileges for all three API roles are the highest priority to review.
