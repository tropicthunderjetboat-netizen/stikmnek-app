-- Remove community / social activity feed (non-core MVP).
-- Apply after frontend no longer reads this table.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.social_activity;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN undefined_table THEN NULL;
END;
$$;

DROP TABLE IF EXISTS public.social_activity CASCADE;
