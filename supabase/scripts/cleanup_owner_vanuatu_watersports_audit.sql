-- Run in Supabase SQL Editor: audit + optional fix for reused email / ghost submissions.
-- Replace 'vanuatuwatersports@gmail.com' below if you use a different account.

-- =============================================================================
-- 1) Resolve auth user + profile
-- =============================================================================
WITH target AS (
  SELECT lower(trim('vanuatuwatersports@gmail.com')) AS email_norm
),
auth_match AS (
  SELECT u.id AS user_id, u.email::text AS auth_email
  FROM auth.users u
  CROSS JOIN target t
  WHERE lower(trim(u.email::text)) = t.email_norm
),
profile_match AS (
  SELECT up.user_id, up.email::text AS profile_email, up.role
  FROM public.user_profiles up
  CROSS JOIN target t
  WHERE lower(trim(up.email::text)) = t.email_norm
)
SELECT 'auth.users' AS src, a.user_id, a.auth_email AS email
FROM auth_match a
UNION ALL
SELECT 'user_profiles' AS src, p.user_id, p.profile_email AS email
FROM profile_match p;

-- =============================================================================
-- 2) Business profiles for that owner (detect duplicates)
-- =============================================================================
-- Paste the user_id from step 1 into the WHERE clause if CTE is inconvenient:
WITH owner AS (
  SELECT up.user_id
  FROM public.user_profiles up
  WHERE lower(trim(up.email::text)) = lower(trim('vanuatuwatersports@gmail.com'))
  LIMIT 1
)
SELECT
  b.id AS business_id,
  b.name,
  b.owner_id,
  b.created_at,
  b.active,
  COUNT(*) OVER (PARTITION BY b.owner_id) AS profiles_for_this_owner
FROM public.businesses b
WHERE b.owner_id = (SELECT user_id FROM owner)
ORDER BY b.created_at ASC;

-- Summary: how many business rows per owner_id for this email’s profile
WITH owner AS (
  SELECT up.user_id
  FROM public.user_profiles up
  WHERE lower(trim(up.email::text)) = lower(trim('vanuatuwatersports@gmail.com'))
  LIMIT 1
)
SELECT
  b.owner_id,
  COUNT(*) AS business_profile_count,
  ARRAY_AGG(b.id ORDER BY b.created_at) AS business_ids
FROM public.businesses b
WHERE b.owner_id = (SELECT user_id FROM owner)
GROUP BY b.owner_id;

-- =============================================================================
-- 3) pending_businesses: link check vs current profiles
-- =============================================================================
-- "Canonical" profile = oldest business row for that owner (adjust if you prefer another rule).
WITH owner AS (
  SELECT up.user_id
  FROM public.user_profiles up
  WHERE lower(trim(up.email::text)) = lower(trim('vanuatuwatersports@gmail.com'))
  LIMIT 1
),
canonical AS (
  SELECT b.id AS canonical_business_id
  FROM public.businesses b
  WHERE b.owner_id = (SELECT user_id FROM owner)
  ORDER BY b.created_at ASC
  LIMIT 1
)
SELECT
  pb.id AS pending_id,
  pb.owner_id,
  pb.business_id AS pending_points_to,
  (SELECT canonical_business_id FROM canonical) AS canonical_business_id,
  pb.name,
  pb.status,
  pb.created_at,
  CASE
    WHEN pb.business_id IS NULL THEN 'missing business_id'
    WHEN pb.business_id NOT IN (
      SELECT b.id FROM public.businesses b WHERE b.owner_id = pb.owner_id
    ) THEN 'business_id not owned by owner_id'
    WHEN pb.business_id IS DISTINCT FROM (SELECT canonical_business_id FROM canonical)
    THEN 'business_id differs from canonical (may be intentional if multiple profiles)'
    ELSE 'ok'
  END AS link_check
FROM public.pending_businesses pb
WHERE pb.owner_id = (SELECT user_id FROM owner)
ORDER BY pb.created_at DESC;

-- =============================================================================
-- 4) OPTIONAL: point all pending rows at canonical business (review section 3 output first)
-- =============================================================================
/*
WITH owner AS (
  SELECT up.user_id
  FROM public.user_profiles up
  WHERE lower(trim(up.email::text)) = lower(trim('vanuatuwatersports@gmail.com'))
  LIMIT 1
),
canonical AS (
  SELECT b.id AS canonical_business_id
  FROM public.businesses b
  WHERE b.owner_id = (SELECT user_id FROM owner)
  ORDER BY b.created_at ASC
  LIMIT 1
)
UPDATE public.pending_businesses pb
SET business_id = (SELECT canonical_business_id FROM canonical)
WHERE pb.owner_id = (SELECT user_id FROM owner)
  AND (
    pb.business_id IS DISTINCT FROM (SELECT canonical_business_id FROM canonical)
    OR pb.business_id IS NULL
  );
*/

-- =============================================================================
-- 5) Consolidating multiple business profiles (report only — manual merge is app-specific)
-- =============================================================================
-- If business_profile_count > 1: decide which id is "primary", then migrate offerings
-- and retire extras. Example report of offerings per business_id for this owner:
WITH owner AS (
  SELECT up.user_id
  FROM public.user_profiles up
  WHERE lower(trim(up.email::text)) = lower(trim('vanuatuwatersports@gmail.com'))
  LIMIT 1
)
SELECT
  bo.business_id,
  COUNT(*) AS offering_count,
  MIN(bo.created_at) AS first_offering_at
FROM public.business_offerings bo
WHERE bo.business_id IN (
  SELECT b.id FROM public.businesses b WHERE b.owner_id = (SELECT user_id FROM owner)
)
GROUP BY bo.business_id
ORDER BY offering_count DESC;
