-- ═══════════════════════════════════════════════════════════════
-- Backfill owner_id for businesses approved before the RPC fix
-- Matches pending_businesses (status=approved) to businesses by
-- name, category, and created_at proximity.
-- ═══════════════════════════════════════════════════════════════

-- Add owner_id if it doesn't exist (some deployments may lack it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.businesses b
SET owner_id = sub.owner_id
FROM (
  SELECT DISTINCT ON (b.id) b.id AS biz_id, pb.owner_id
  FROM public.businesses b
  JOIN public.pending_businesses pb ON pb.status = 'approved'
    AND pb.owner_id IS NOT NULL
    AND LOWER(TRIM(b.name)) = LOWER(TRIM(pb.name))
    AND LOWER(TRIM(COALESCE(b.category, ''))) = LOWER(TRIM(COALESCE(pb.category, '')))
    AND b.created_at BETWEEN pb.updated_at - interval '2 hours' AND pb.updated_at + interval '2 hours'
  WHERE b.owner_id IS NULL
  ORDER BY b.id, ABS(EXTRACT(EPOCH FROM (b.created_at - pb.updated_at)))
) sub
WHERE b.id = sub.biz_id;
