-- ═══════════════════════════════════════════════════════════════════════════
-- StikmNek — manual purge + delete auth user (Supabase SQL Editor)
--
-- 1. Replace YOUR_USER_UUID with the exact UUID from Authentication → Users.
-- 2. Run the whole script once.
-- 3. If step A is applied (migration), it uses the RPC. Otherwise use block B only.
--
-- If anything fails, run diagnose_auth_user_delete_blockers.sql first.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Step A (preferred after migrations are applied) ───
SELECT public.delete_public_app_data_for_user('YOUR_USER_UUID'::uuid);

-- If the line above errors with "function does not exist", skip it and run block B below instead.

/*
-- ─── Step B — full inline purge (same logic as migration 20260409190000) ───
DO $$
DECLARE
  uid uuid := 'YOUR_USER_UUID'::uuid;
BEGIN
  DELETE FROM public.review_responses WHERE user_id = uid;
  DELETE FROM public.reviews WHERE user_id = uid;
  DELETE FROM public.favorites WHERE user_id = uid;
  DELETE FROM public.pass_purchases WHERE user_id = uid;
  DELETE FROM public.payment_sessions WHERE user_id = uid;
  DELETE FROM public.redemptions WHERE user_id = uid;
  DELETE FROM public.passes WHERE user_id = uid;
  DELETE FROM public.search_history WHERE user_id = uid;

  DELETE FROM public.ticket_responses
  WHERE responder_id = uid
     OR ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = uid);
  DELETE FROM public.support_tickets WHERE user_id = uid;

  DELETE FROM public.notifications WHERE user_id = uid;
  DELETE FROM public.feedback WHERE user_id = uid;
  DELETE FROM public.error_logs WHERE user_id = uid;
  DELETE FROM public.referrals WHERE referrer_id = uid OR referred_user_id = uid;
  DELETE FROM public.social_activity WHERE user_id = uid;

  DELETE FROM public.business_photos WHERE uploaded_by = uid;
  DELETE FROM public.pending_edits WHERE owner_id = uid;
  DELETE FROM public.pending_businesses WHERE owner_id = uid;
  DELETE FROM public.businesses WHERE owner_id = uid;
  DELETE FROM public.user_profiles WHERE user_id = uid;

  DELETE FROM storage.objects WHERE owner = uid;
END $$;
*/

-- ─── Step C — remove the auth user (shows real DB error if something remains) ───
-- Uncomment after A or B succeeds:

-- DELETE FROM auth.users WHERE id = 'YOUR_USER_UUID'::uuid;
