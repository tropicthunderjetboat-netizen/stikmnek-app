-- ═══════════════════════════════════════════════════════════════════════════
-- Pass expiry: mark expired passes inactive (hourly via pg_cron)
--
-- Schedule: every hour at minute 0 — cron expression: 0 * * * *
-- Command:   UPDATE public.passes SET active = false
--            WHERE active IS TRUE AND expires_at < NOW();
--
-- Prerequisites (Supabase):
--   • Enable extension "pg_cron" (Database → Extensions), OR rely on the
--     CREATE EXTENSION below (requires a role allowed to create extensions).
--   • pg_cron is available on paid plans; verify your project supports it.
--
-- Idempotent: removes any existing job named stikmnek_expire_passes_hourly,
-- then schedules a fresh one (safe to re-run in SQL Editor).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule every pg_cron job with this name (handles duplicates / re-runs).
DO $$
DECLARE
  jid bigint;
BEGIN
  FOR jid IN
    SELECT jobid FROM cron.job WHERE jobname = 'stikmnek_expire_passes_hourly'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END;
$$;

-- Hourly: top of each hour (UTC, per pg_cron server timezone — typically UTC on Supabase).
SELECT cron.schedule(
  'stikmnek_expire_passes_hourly',
  '0 * * * *',
  $$UPDATE public.passes SET active = false WHERE active IS TRUE AND expires_at < NOW()$$
);
