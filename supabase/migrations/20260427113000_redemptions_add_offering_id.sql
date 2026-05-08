-- ═══════════════════════════════════════════════════════════════════════════
-- Add offering_id to public.redemptions (backwards compatible)
--
-- Goal:
-- - Support analytics and UX keyed to a specific deal/listing (business_offerings row)
-- - Preserve old rows that only had business_id (nullable offering_id)
--
-- Design:
-- - offering_id uuid NULL
-- - FK → public.business_offerings(id), ON DELETE SET NULL
-- - Index on (offering_id) for lookups / joins
--
-- Forward-compatibility:
-- - Businesses may have multiple offerings. This column is nullable and must be set explicitly
--   by the redemption writer (e.g. QR redemption flow) when the redeemed offering is known.
-- - This migration intentionally performs NO automatic backfill.
--
-- RLS:
-- - Existing policies are keyed to user_id; adding offering_id does not widen access.
-- - No policy changes required unless you later enforce offering_id on INSERT.
--
-- Rollback:
-- - See rollback section at bottom (DROP INDEX, DROP CONSTRAINT, DROP COLUMN).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS offering_id uuid;

COMMENT ON COLUMN public.redemptions.offering_id IS
  'Nullable FK to public.business_offerings(id). For multi-listing businesses, writers should set offering_id when known. Legacy rows may be NULL.';

-- FK (idempotent add) — use a stable name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'redemptions'
      AND c.conname = 'redemptions_offering_id_fkey'
  ) THEN
    ALTER TABLE public.redemptions
      ADD CONSTRAINT redemptions_offering_id_fkey
      FOREIGN KEY (offering_id)
      REFERENCES public.business_offerings(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Index for join/filter performance
CREATE INDEX IF NOT EXISTS idx_redemptions_offering_id
  ON public.redemptions(offering_id);

-- No backfill performed. To optionally backfill later, decide on a deterministic rule
-- (e.g. offering active at redeemed_at, nearest created_at <= redeemed_at, etc.) and run as a
-- separate, explicit maintenance migration.

-- ── Ambiguous cases (document-only) ────────────────────────────────────────
-- To audit ambiguous legacy rows (left NULL by design), run:
--   SELECT r.id, r.user_id, r.business_id, r.redeemed_at, COUNT(o.*) AS offering_count
--   FROM public.redemptions r
--   JOIN public.business_offerings o ON o.business_id = r.business_id
--   WHERE r.offering_id IS NULL
--   GROUP BY r.id
--   HAVING COUNT(o.*) > 1
--   ORDER BY offering_count DESC, r.redeemed_at DESC;

-- ── Rollback (manual) ──────────────────────────────────────────────────────
-- NOTE: Supabase migrations are typically forward-only; this is provided for operators.
--   DROP INDEX IF EXISTS public.idx_redemptions_offering_id;
--   ALTER TABLE public.redemptions DROP CONSTRAINT IF EXISTS redemptions_offering_id_fkey;
--   ALTER TABLE public.redemptions DROP COLUMN IF EXISTS offering_id;

