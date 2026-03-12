-- ═══════════════════════════════════════════════════════════════
-- businesses: Align schema - add deal_price/discount if missing
-- Supports both schemas: (deal, discounted_price) and (discount, deal_price)
-- ═══════════════════════════════════════════════════════════════

-- Add deal_price if it doesn't exist (schema may have discounted_price instead)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'deal_price'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN deal_price numeric(12,2) DEFAULT 0;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'discounted_price') THEN
      UPDATE public.businesses SET deal_price = COALESCE(discounted_price, 0);
    END IF;
  END IF;
END $$;

-- Add discount if it doesn't exist (schema may have deal instead)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'discount'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN discount text DEFAULT '';
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'deal') THEN
      UPDATE public.businesses SET discount = COALESCE(deal, '');
    END IF;
  END IF;
END $$;

-- Add image if it doesn't exist (schema may have image_url instead)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'image'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN image text DEFAULT '';
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'image_url') THEN
      UPDATE public.businesses SET image = COALESCE(image_url, '');
    END IF;
  END IF;
END $$;

-- Add hours if it doesn't exist (schema may have opening_hours instead)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'hours'
  ) THEN
    ALTER TABLE public.businesses ADD COLUMN hours text DEFAULT '';
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'opening_hours') THEN
      UPDATE public.businesses SET hours = COALESCE(opening_hours, '');
    END IF;
  END IF;
END $$;
