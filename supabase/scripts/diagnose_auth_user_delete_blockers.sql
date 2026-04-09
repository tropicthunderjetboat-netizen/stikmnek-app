-- Run in Supabase SQL Editor.
-- Part 1 lists every FK pointing at auth.users (any row in those tables can block dashboard delete).
-- Part 2 (optional): uncomment the DO block and paste your user UUID to print row counts.

-- ─── 1) FKs into auth.users (what Postgres enforces on user delete) ───
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  a.attname AS column_name,
  pg_get_constraintdef(con.oid, true) AS constraint_def
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (con.conkey)
JOIN pg_class cf ON cf.oid = con.confrelid
JOIN pg_namespace nf ON nf.oid = cf.relnamespace
WHERE con.contype = 'f'
  AND nf.nspname = 'auth'
  AND cf.relname = 'users'
ORDER BY 1, 2, 3;

-- ─── 2) Row counts (uncomment, set UUID, run) ───
/*
DO $$
DECLARE
  uid uuid := 'PASTE_USER_UUID_HERE'::uuid;
BEGIN
  RAISE NOTICE 'review_responses user_id: %', (SELECT count(*) FROM public.review_responses WHERE user_id = uid);
  RAISE NOTICE 'reviews user_id: %', (SELECT count(*) FROM public.reviews WHERE user_id = uid);
  RAISE NOTICE 'favorites: %', (SELECT count(*) FROM public.favorites WHERE user_id = uid);
  RAISE NOTICE 'pass_purchases: %', (SELECT count(*) FROM public.pass_purchases WHERE user_id = uid);
  RAISE NOTICE 'payment_sessions: %', (SELECT count(*) FROM public.payment_sessions WHERE user_id = uid);
  RAISE NOTICE 'redemptions: %', (SELECT count(*) FROM public.redemptions WHERE user_id = uid);
  RAISE NOTICE 'passes: %', (SELECT count(*) FROM public.passes WHERE user_id = uid);
  RAISE NOTICE 'ticket_responses: %',
    (SELECT count(*) FROM public.ticket_responses tr
     WHERE tr.responder_id = uid OR tr.ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = uid));
  RAISE NOTICE 'support_tickets: %', (SELECT count(*) FROM public.support_tickets WHERE user_id = uid);
  RAISE NOTICE 'referrals: %', (SELECT count(*) FROM public.referrals WHERE referrer_id = uid OR referred_user_id = uid);
  RAISE NOTICE 'social_activity: %', (SELECT count(*) FROM public.social_activity WHERE user_id = uid);
  RAISE NOTICE 'user_profiles: %', (SELECT count(*) FROM public.user_profiles WHERE user_id = uid);
  RAISE NOTICE 'storage.objects owner: %', (SELECT count(*) FROM storage.objects WHERE owner = uid);
END $$;
*/
