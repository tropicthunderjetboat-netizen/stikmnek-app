-- ═══════════════════════════════════════════════════════════════════════════
-- Tourist account expiry (daily via pg_cron)
--
-- Policy:
--   1. Pass holders — delete 30 days after their latest pass expires (no active pass).
--   2. Never purchased — delete 60 days after initial sign-up (no pass / purchase row).
--
-- Skips business and admin roles. Purges public data (reviews kept on listings),
-- then removes auth.users. Idempotent job name: stikmnek_expire_tourist_accounts_daily.
-- ═══════════════════════════════════════════════════════════════════════════

-- Allow purge to skip review deletion; reviews.user_id → auth.users ON DELETE SET NULL.
DROP FUNCTION IF EXISTS public.delete_public_app_data_for_user(uuid);

CREATE OR REPLACE FUNCTION public.delete_public_app_data_for_user(
  p_user_id uuid,
  p_preserve_reviews boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;

  DELETE FROM public.review_responses WHERE user_id = p_user_id;

  IF p_preserve_reviews THEN
    UPDATE public.reviews SET user_id = NULL WHERE user_id = p_user_id;
  ELSE
    DELETE FROM public.reviews WHERE user_id = p_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'favorites') THEN
    DELETE FROM public.favorites WHERE user_id = p_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pass_purchases') THEN
    DELETE FROM public.pass_purchases WHERE user_id = p_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_sessions') THEN
    DELETE FROM public.payment_sessions WHERE user_id = p_user_id;
  END IF;

  DELETE FROM public.redemptions WHERE user_id = p_user_id;
  DELETE FROM public.passes WHERE user_id = p_user_id;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_history') THEN
    DELETE FROM public.search_history WHERE user_id = p_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ticket_responses')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_tickets') THEN
    DELETE FROM public.ticket_responses
    WHERE responder_id = p_user_id
       OR ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = p_user_id);
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ticket_responses') THEN
    DELETE FROM public.ticket_responses WHERE responder_id = p_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_tickets') THEN
    DELETE FROM public.support_tickets WHERE user_id = p_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    DELETE FROM public.notifications WHERE user_id = p_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'feedback') THEN
    DELETE FROM public.feedback WHERE user_id = p_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'error_logs') THEN
    DELETE FROM public.error_logs WHERE user_id IS NOT NULL AND user_id = p_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
    DELETE FROM public.referrals
    WHERE referrer_id = p_user_id OR referred_user_id = p_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'social_activity') THEN
    DELETE FROM public.social_activity WHERE user_id = p_user_id;
  END IF;

  DELETE FROM public.business_photos WHERE uploaded_by = p_user_id;
  DELETE FROM public.pending_edits WHERE owner_id = p_user_id;
  DELETE FROM public.pending_businesses WHERE owner_id = p_user_id;

  DELETE FROM public.businesses WHERE owner_id = p_user_id;

  DELETE FROM public.user_profiles WHERE user_id = p_user_id;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'objects' AND column_name = 'owner'
  ) THEN
    DELETE FROM storage.objects WHERE owner = p_user_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.delete_public_app_data_for_user(uuid, boolean) IS
  'Public + storage purge before auth.users delete. p_preserve_reviews=true keeps review rows (user_id nulled via FK).';

REVOKE ALL ON FUNCTION public.delete_public_app_data_for_user(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_public_app_data_for_user(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_tourist_accounts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
DECLARE
  v_uid uuid;
  v_rule text;
  v_deleted int := 0;
  v_pass_expired int := 0;
  v_never_purchased int := 0;
  v_failed int := 0;
BEGIN
  FOR v_uid, v_rule IN
    WITH pass_expired_candidates AS (
      SELECT up.user_id, 'pass_expired_30d'::text AS purge_rule
      FROM public.user_profiles up
      WHERE up.role = 'tourist'
        AND EXISTS (
          SELECT 1 FROM public.passes p WHERE p.user_id = up.user_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.passes p
          WHERE p.user_id = up.user_id
            AND p.active IS TRUE
            AND p.expires_at > NOW()
        )
        AND (
          SELECT MAX(p.expires_at)
          FROM public.passes p
          WHERE p.user_id = up.user_id
        ) < NOW() - INTERVAL '30 days'
    ),
    never_purchased_candidates AS (
      SELECT up.user_id, 'signup_60d_no_pass'::text AS purge_rule
      FROM public.user_profiles up
      INNER JOIN auth.users au ON au.id = up.user_id
      WHERE up.role = 'tourist'
        AND NOT EXISTS (
          SELECT 1 FROM public.passes p WHERE p.user_id = up.user_id
        )
        AND (
          NOT EXISTS (
            SELECT 1
            FROM information_schema.tables t
            WHERE t.table_schema = 'public'
              AND t.table_name = 'pass_purchases'
          )
          OR NOT EXISTS (
            SELECT 1 FROM public.pass_purchases pp WHERE pp.user_id = up.user_id
          )
        )
        AND au.created_at < NOW() - INTERVAL '60 days'
    )
    SELECT user_id, purge_rule FROM pass_expired_candidates
    UNION
    SELECT user_id, purge_rule FROM never_purchased_candidates
  LOOP
    BEGIN
      PERFORM public.delete_public_app_data_for_user(v_uid, true);
      DELETE FROM auth.users WHERE id = v_uid;

      v_deleted := v_deleted + 1;
      IF v_rule = 'pass_expired_30d' THEN
        v_pass_expired := v_pass_expired + 1;
      ELSE
        v_never_purchased := v_never_purchased + 1;
      END IF;

      RAISE NOTICE 'purged expired tourist % (%) — reviews preserved', v_uid, v_rule;
    EXCEPTION
      WHEN OTHERS THEN
        v_failed := v_failed + 1;
        RAISE WARNING 'failed to purge tourist % (%): %', v_uid, v_rule, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'pass_expired_30d', v_pass_expired,
    'signup_60d_no_pass', v_never_purchased,
    'failed', v_failed,
    'reviews_preserved', true,
    'ran_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.purge_expired_tourist_accounts() IS
  'Daily cron: purge tourist accounts 30d after latest pass expiry, or 60d after signup if never purchased. Reviews stay on listings.';

REVOKE ALL ON FUNCTION public.purge_expired_tourist_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_tourist_accounts() TO postgres;

-- ─── pg_cron (requires extension from expire_passes migration) ───
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  jid bigint;
BEGIN
  FOR jid IN
    SELECT jobid FROM cron.job WHERE jobname = 'stikmnek_expire_tourist_accounts_daily'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END;
$$;

-- Daily at 03:15 UTC
SELECT cron.schedule(
  'stikmnek_expire_tourist_accounts_daily',
  '15 3 * * *',
  $$SELECT public.purge_expired_tourist_accounts()$$
);
