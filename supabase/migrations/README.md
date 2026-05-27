# Supabase migrations

## Data API grants (required from May 2026)

Supabase is changing defaults so **new tables in `public` are not reachable via the Data API** (PostgREST, GraphQL, `supabase-js`) until you add explicit Postgres `GRANT`s.

| Date | What happens |
| --- | --- |
| **May 30, 2026** | Default for **new** Supabase projects |
| **October 30, 2026** | Default privilege change on **existing** projects (new tables only; existing table grants stay until you change them) |

Reference: [Breaking change: tables not exposed automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

### Checklist for every new `public` table

Bundle these in the **same migration** as `CREATE TABLE`:

1. **`GRANT`** — least privilege per role (`anon`, `authenticated`, `service_role`)
2. **`ENABLE ROW LEVEL SECURITY`**
3. **`CREATE POLICY`** — row access rules

Example (adjust privileges to what the app actually needs):

```sql
CREATE TABLE public.your_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ...
);

-- 1. Grants (required for Data API / supabase-js)
GRANT SELECT ON public.your_table TO anon;  -- omit anon if not public-read
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO authenticated;
GRANT ALL ON public.your_table TO service_role;  -- edge functions using service role key

-- 2. RLS
ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY;

-- 3. Policies
CREATE POLICY "your_table_select_..."
  ON public.your_table FOR SELECT TO authenticated
  USING (...);
```

For **views** exposed to the client:

```sql
GRANT SELECT ON public.your_view TO anon, authenticated;
GRANT SELECT ON public.your_view TO service_role;
```

For **RPCs**:

```sql
GRANT EXECUTE ON FUNCTION public.your_function(...) TO authenticated;
-- service_role only if an edge function calls it with the service key
```

### Patterns in this repo

| Object | Typical grants |
| --- | --- |
| Tourist-readable data | `GRANT SELECT … TO anon, authenticated` |
| Owner / admin writes | `GRANT INSERT, UPDATE, DELETE … TO authenticated` + RLS |
| Edge Functions (`manage-business`, etc.) | `GRANT ALL … TO service_role` (RLS bypassed; policies not applied to service role) |
| Analytics / insert-only telemetry | `GRANT INSERT … TO anon, authenticated`; `GRANT SELECT, INSERT … TO service_role` |

### Tables created in this repo

Migrations that `CREATE TABLE` in `public` and include grants:

- `business_offerings` — `20260330130000_business_offerings_create_and_backfill.sql`
- `review_responses` — `20260321120100_review_responses_public_and_owner_rls.sql`
- `analytics_events` — `20260508172000_analytics_events.sql`
- `business_credentials` — `20260525120000_business_credentials.sql` (+ `20260528120000_data_api_explicit_grants.sql` for `service_role`)

### Before October 2026 on production

1. Run pending migrations (including `20260528120000_data_api_explicit_grants.sql`).
2. In the Supabase dashboard, use **Security Advisor** to list tables missing Data API grants.
3. When creating tables via SQL editor or AI tools, always add `GRANT` in the same script.

### Optional: opt in early on a test project

To match new-project behavior before October 30:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;
```

Only run on a **test** project first; every new table will then require explicit `GRANT`s (which this repo’s migrations already do).
