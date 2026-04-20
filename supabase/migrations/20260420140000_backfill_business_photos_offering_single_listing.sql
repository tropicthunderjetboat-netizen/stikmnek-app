-- Attach legacy approved photos (offering_id IS NULL) to the only active offering on that profile,
-- so per-listing galleries work without relying on the app fallback.

UPDATE public.business_photos bp
SET offering_id = sub.only_id
FROM (
  SELECT
    bo.business_id,
    (array_agg(bo.id ORDER BY bo.created_at ASC NULLS LAST))[1] AS only_id
  FROM public.business_offerings bo
  WHERE bo.active IS DISTINCT FROM false
  GROUP BY bo.business_id
  HAVING COUNT(*) = 1
) AS sub
WHERE bp.business_id = sub.business_id
  AND bp.offering_id IS NULL
  AND bp.status = 'approved';
