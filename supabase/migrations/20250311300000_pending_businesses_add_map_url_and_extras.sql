-- ═══════════════════════════════════════════════════════════════
-- Add map_url, website, discount_valid_from, discount_valid_until
-- to public.pending_businesses if missing.
-- Required by resubmit_pending_business and insert_pending_business.
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pending_businesses' AND column_name = 'map_url'
  ) THEN
    ALTER TABLE public.pending_businesses ADD COLUMN map_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pending_businesses' AND column_name = 'website'
  ) THEN
    ALTER TABLE public.pending_businesses ADD COLUMN website text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pending_businesses' AND column_name = 'discount_valid_from'
  ) THEN
    ALTER TABLE public.pending_businesses ADD COLUMN discount_valid_from date;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pending_businesses' AND column_name = 'discount_valid_until'
  ) THEN
    ALTER TABLE public.pending_businesses ADD COLUMN discount_valid_until date;
  END IF;
END $$;
