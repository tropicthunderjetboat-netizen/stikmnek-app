-- Foundation for tiered pricing (adult / child / meal / etc.) — JSON array of tier objects
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS pricing_tiers jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.businesses.pricing_tiers IS 'Array of pricing tier objects (e.g. adult_price, child_price, meal_price, label). Consumed by future tiered pricing UI.';
