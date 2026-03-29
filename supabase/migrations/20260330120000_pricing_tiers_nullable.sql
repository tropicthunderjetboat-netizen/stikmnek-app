-- Allow NULL pricing_tiers for non-tiered listings (e.g. Dining). Unblocks admin approval.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'pricing_tiers'
  ) THEN
    ALTER TABLE public.businesses ALTER COLUMN pricing_tiers DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pending_businesses' AND column_name = 'pricing_tiers'
  ) THEN
    ALTER TABLE public.pending_businesses ALTER COLUMN pricing_tiers DROP NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.businesses.pricing_tiers IS
  'Optional JSON tier array; NULL = use flat original_price / deal_price.';
