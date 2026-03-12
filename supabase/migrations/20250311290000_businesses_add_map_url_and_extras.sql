-- ═══════════════════════════════════════════════════════════════
-- Add map_url, website, discount_valid_from, discount_valid_until
-- to public.businesses if missing.
-- Required by review_pending_business RPC on approval.
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'map_url'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN map_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'website'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN website text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'discount_valid_from'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN discount_valid_from date;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'discount_valid_until'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN discount_valid_until date;
  END IF;
END $$;
