-- Run in Supabase SQL Editor: integrity checks for listing submissions.
-- 1) UNIQUE constraints on pending_businesses (should NOT include sole owner_id)
SELECT c.conname, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND t.relname = 'pending_businesses'
  AND c.contype IN ('u', 'p')
ORDER BY c.contype, c.conname;

-- 2) Row counts
SELECT status, count(*) FROM public.pending_businesses GROUP BY status ORDER BY status;

-- 3) Example: vanuatuwatersports@gmail.com — user id, profile, pending rows
SELECT up.user_id, up.email, up.role
FROM public.user_profiles up
WHERE lower(trim(up.email)) = lower(trim('vanuatuwatersports@gmail.com'));

-- Replace :uid with auth.users.id from above if needed:
-- SELECT b.id AS business_profile_id, b.owner_id, b.name
-- FROM public.businesses b
-- WHERE b.owner_id = :uid;

-- SELECT id, owner_id, business_id, name, status, created_at
-- FROM public.pending_businesses
-- WHERE owner_id = :uid
-- ORDER BY created_at DESC;
