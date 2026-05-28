-- One-time: link Storage uploads → business_photos for Qwenneth Edgel / Hand Painted Lavalavas
-- Run in Supabase SQL Editor AFTER checking storage.objects (step 1).
-- Requires manage-business deployed for future owner saves; this fixes existing orphans.

-- Step 1 — files in bucket (owner folder from cover URL)
SELECT name, created_at
FROM storage.objects
WHERE bucket_id = 'business-photos'
  AND name LIKE 'f8bd3352-cced-47dc-840f-94bbdc9697a7/%'
ORDER BY created_at;

-- Step 2 — insert missing approved rows (adjust paths from step 1)
-- Owner user id: look up from businesses.owner_id for profile below
/*
INSERT INTO public.business_photos (
  business_id, offering_id, url, file_path, uploaded_by, is_main, status
)
SELECT
  '15fc893c-afa3-4eef-b5cb-b5cccafefa9a',
  '584b4a6c-0f99-4a6d-b77e-2d7f1e9aa528',
  'https://hbaflbmfptobyfqbudrt.supabase.co/storage/v1/object/public/business-photos/' || o.name,
  o.name,
  b.owner_id,
  false,
  'approved'
FROM storage.objects o
CROSS JOIN public.businesses b
WHERE b.id = '15fc893c-afa3-4eef-b5cb-b5cccafefa9a'
  AND o.bucket_id = 'business-photos'
  AND o.name LIKE 'f8bd3352-cced-47dc-840f-94bbdc9697a7/%'
  AND NOT EXISTS (
    SELECT 1 FROM public.business_photos bp
    WHERE bp.business_id = '15fc893c-afa3-4eef-b5cb-b5cccafefa9a'
      AND bp.offering_id = '584b4a6c-0f99-4a6d-b77e-2d7f1e9aa528'
      AND (bp.file_path = o.name OR bp.url LIKE '%' || o.name)
  );
*/

-- Step 3 — set main photo + cover (first by created_at)
/*
WITH first_photo AS (
  SELECT id, url FROM public.business_photos
  WHERE business_id = '15fc893c-afa3-4eef-b5cb-b5cccafefa9a'
    AND offering_id = '584b4a6c-0f99-4a6d-b77e-2d7f1e9aa528'
    AND status = 'approved'
  ORDER BY created_at ASC
  LIMIT 1
)
UPDATE public.business_photos SET is_main = (id = (SELECT id FROM first_photo))
WHERE business_id = '15fc893c-afa3-4eef-b5cb-b5cccafefa9a'
  AND offering_id = '584b4a6c-0f99-4a6d-b77e-2d7f1e9aa528';

UPDATE public.business_offerings o
SET image = (SELECT url FROM first_photo)
FROM first_photo
WHERE o.id = '584b4a6c-0f99-4a6d-b77e-2d7f1e9aa528';
*/

-- Step 4 — verify
SELECT count(*) FILTER (
  WHERE status = 'approved'
    AND offering_id = '584b4a6c-0f99-4a6d-b77e-2d7f1e9aa528'
) AS gallery_will_show
FROM public.business_photos
WHERE business_id = '15fc893c-afa3-4eef-b5cb-b5cccafefa9a';
