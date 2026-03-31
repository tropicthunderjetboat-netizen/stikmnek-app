-- ═══════════════════════════════════════════════════════════════════════════
-- Security: user_profiles public read, error_logs abuse limits
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) user_profiles: remove world-readable full-row policy ──────────────
DROP POLICY IF EXISTS "user_profiles_select_public_info" ON public.user_profiles;

-- Safe projection: only these columns are visible via this view.
-- security_invoker = false (definer): anon can read the slice without a permissive RLS policy on the base table.
CREATE OR REPLACE VIEW public.user_profiles_public
WITH (security_invoker = false) AS
SELECT
  user_id,
  display_name,
  avatar_url,
  role
FROM public.user_profiles;

COMMENT ON VIEW public.user_profiles_public IS
  'Public subset (4 columns). Query this view for directory UI; use user_profiles for own row / admin.';

GRANT SELECT ON public.user_profiles_public TO anon, authenticated;

-- Anon must not read the full table (only own flows are rare for anon; use view for public cards)
REVOKE SELECT ON public.user_profiles FROM anon;

-- authenticated still reads own full row via user_profiles_select_own + admin policies

-- ─── 2) error_logs: authenticated-only INSERT + size limits ────────────────
DO $$
BEGIN
  IF to_regclass('public.error_logs') IS NULL THEN
    RAISE NOTICE 'Skipping error_logs: table missing';
  ELSE
    EXECUTE 'REVOKE INSERT ON public.error_logs FROM anon';
    EXECUTE 'GRANT INSERT ON public.error_logs TO authenticated';

    EXECUTE 'DROP POLICY IF EXISTS "error_logs_insert_all" ON public.error_logs';
    EXECUTE 'DROP POLICY IF EXISTS "error_logs_insert_authenticated" ON public.error_logs';

    EXECUTE $p$
      CREATE POLICY "error_logs_insert_authenticated"
        ON public.error_logs FOR INSERT
        TO authenticated
        WITH CHECK (true)
    $p$;

    -- Length / size caps (adjust if legitimate stacks exceed 5000 chars)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'error_logs_error_message_max_len'
    ) THEN
      ALTER TABLE public.error_logs
        ADD CONSTRAINT error_logs_error_message_max_len
        CHECK (char_length(error_message) <= 5000);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'error_logs_error_stack_max_len'
    ) THEN
      ALTER TABLE public.error_logs
        ADD CONSTRAINT error_logs_error_stack_max_len
        CHECK (error_stack IS NULL OR char_length(error_stack) <= 5000);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'error_logs_error_type_max_len'
    ) THEN
      ALTER TABLE public.error_logs
        ADD CONSTRAINT error_logs_error_type_max_len
        CHECK (char_length(error_type) <= 500);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'error_logs_component_max_len'
    ) THEN
      ALTER TABLE public.error_logs
        ADD CONSTRAINT error_logs_component_max_len
        CHECK (component IS NULL OR char_length(component) <= 500);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'error_logs_page_url_max_len'
    ) THEN
      ALTER TABLE public.error_logs
        ADD CONSTRAINT error_logs_page_url_max_len
        CHECK (page_url IS NULL OR char_length(page_url) <= 2000);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'error_logs_user_agent_max_len'
    ) THEN
      ALTER TABLE public.error_logs
        ADD CONSTRAINT error_logs_user_agent_max_len
        CHECK (user_agent IS NULL OR char_length(user_agent) <= 2000);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'error_logs_metadata_max_bytes'
    ) THEN
      ALTER TABLE public.error_logs
        ADD CONSTRAINT error_logs_metadata_max_bytes
        CHECK (metadata IS NULL OR pg_column_size(metadata) <= 10000);
    END IF;
  END IF;
END $$;
