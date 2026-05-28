-- Run in Supabase SQL Editor (project hbaflbmfptobyfqbudrt).
-- Finds Qwenneth Edgel / "Hand Painted Lavalavas" and lists where photos live.
-- Read-only except the optional REPAIR block at the bottom (commented out).

-- ── 1) Locate profile + listing ─────────────────────────────────────────────
WITH matches AS (
  SELECT b.id AS profile_id, b.name AS profile_name, b.owner_id, b.active AS profile_active
  FROM public.businesses b
  WHERE b.name ILIKE '%lavalava%'
     OR b.name ILIKE '%qwenneth%'
     OR b.name ILIKE '%edgel%'
  UNION
  SELECT o.business_id, b.name, b.owner_id, b.active
  FROM public.business_offerings o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE o.title ILIKE '%hand painted%lavalava%'
     OR o.title ILIKE '%lavalava%'
  UNION
  SELECT pb.business_id, pb.name, pb.owner_id, NULL
  FROM public.pending_businesses pb
  WHERE pb.name ILIKE '%lavalava%'
     OR pb.name ILIKE '%hand painted%'
)
SELECT DISTINCT m.*, up.email, COALESCE(up.full_name, up.name, up.display_name) AS owner_name
FROM matches m
LEFT JOIN public.user_profiles up ON up.user_id = m.owner_id
WHERE m.profile_id IS NOT NULL
   OR m.owner_id IS NOT NULL;

-- Owner by name (if profile row above is empty)
SELECT up.user_id, up.email, COALESCE(up.full_name, up.name, up.display_name) AS owner_name
FROM public.user_profiles up
WHERE COALESCE(up.full_name, up.name, up.display_name, '') ILIKE '%qwenneth%'
   OR COALESCE(up.full_name, up.name, up.display_name, '') ILIKE '%edgel%'
   OR up.email ILIKE '%edgel%';

-- Known IDs (2026-05-28): Qwenneth Edgel / Hand Painted Lavalavas
-- profile_id  = 15fc893c-afa3-4eef-b5cb-b5cccafefa9a
-- offering_id = 584b4a6c-0f99-4a6d-b77e-2d7f1e9aa528
-- profile businesses.active = false (stub OK); offering active = true

-- ── 2) Offerings on profile ───────────────────────────────────────────────────
SELECT id, title, active, image AS cover_url, created_at, updated_at
FROM public.business_offerings
WHERE business_id = '15fc893c-afa3-4eef-b5cb-b5cccafefa9a'
ORDER BY created_at;

-- ── 3) All photos for profile + pending-linked rows ─────────────────────────
SELECT
  bp.id,
  bp.status,
  bp.is_main,
  bp.offering_id,
  o.title AS offering_title,
  bp.url,
  bp.file_path,
  bp.submission_pending_id,
  bp.pending_id,
  bp.created_at
FROM public.business_photos bp
LEFT JOIN public.business_offerings o ON o.id = bp.offering_id
WHERE bp.business_id = '15fc893c-afa3-4eef-b5cb-b5cccafefa9a'
   OR bp.business_id IN (
     SELECT id FROM public.pending_businesses
     WHERE business_id = '15fc893c-afa3-4eef-b5cb-b5cccafefa9a'
   )
ORDER BY bp.created_at;

-- ── 4) Counts the public gallery query uses ───────────────────────────────────
SELECT
  count(*) FILTER (WHERE status = 'approved' AND offering_id = '584b4a6c-0f99-4a6d-b77e-2d7f1e9aa528') AS tagged_approved,
  count(*) FILTER (WHERE status = 'approved' AND offering_id IS NULL) AS untagged_approved,
  count(*) FILTER (WHERE status IS DISTINCT FROM 'approved') AS not_approved,
  count(*) AS total
FROM public.business_photos
WHERE business_id = '15fc893c-afa3-4eef-b5cb-b5cccafefa9a';

-- ── 5) Pending submission history ────────────────────────────────────────────
-- SELECT id, name, status, business_id, created_at, updated_at
-- FROM public.pending_businesses
-- WHERE business_id = '<profile_id>' OR name ILIKE '%lavalava%'
-- ORDER BY created_at DESC;

-- ── OPTIONAL REPAIR (run only if step 3 shows rows with wrong offering_id / status) ─
-- Link all non-rejected photos on this profile to Hand Painted Lavalavas:
-- UPDATE public.business_photos
-- SET offering_id = '584b4a6c-0f99-4a6d-b77e-2d7f1e9aa528',
--     status = CASE WHEN status = 'rejected' THEN status ELSE 'approved' END
-- WHERE business_id = '15fc893c-afa3-4eef-b5cb-b5cccafefa9a'
--   AND status IS DISTINCT FROM 'rejected'
--   AND (offering_id IS NULL OR offering_id IS DISTINCT FROM '584b4a6c-0f99-4a6d-b77e-2d7f1e9aa528');

-- Sync cover from main approved photo:
-- UPDATE public.business_offerings o
-- SET image = sub.url
-- FROM (
--   SELECT url FROM public.business_photos
--   WHERE business_id = '<profile_id>' AND offering_id = '<offering_id>' AND status = 'approved'
--   ORDER BY is_main DESC, created_at ASC LIMIT 1
-- ) sub
-- WHERE o.id = '<offering_id>' AND sub.url IS NOT NULL;
