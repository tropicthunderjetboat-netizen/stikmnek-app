-- ═══════════════════════════════════════════════════════════════════════════
-- Pass expiry: mark expired passes inactive (hourly via pg_cron)
--
-- Requires pg_cron (Supabase: Database → Extensions → enable "pg_cron").
-- On some plans, pg_cron may already exist under the `extensions` schema.
-- If this migration fails on extension, run the UPDATE manually or use a
-- Supabase Scheduled Edge Function instead.
-- ═══════════════════════════════════════════════════════════════════════════

-- Omit SCHEMA so it matches your project's default (Supabase often uses `extensions`).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotent: drop previous job name if re-applying migration
DO $$
DECLARE
  jid int;
BEGIN
  SELECT jobid INTO jid
  FROM cron.job
  WHERE jobname = 'stikmnek_expire_passes_hourly'
  LIMIT 1;
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END;
$$;

SELECT cron.schedule(
  'stikmnek_expire_passes_hourly',
  '0 * * * *',
  $cmd$UPDATE public.passes SET active = false WHERE active IS TRUE AND expires_at < NOW()$cmd$
);
