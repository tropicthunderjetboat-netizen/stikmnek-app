-- Optional tiered per-person pricing for businesses.
-- When NULL or empty array, the app falls back to flat `original_price` / `discounted_price` (deal).
--
-- Suggested JSON shape (array of tiers, ordered by min_pax):
-- [
--   {
--     "label": "1–2 guests",
--     "min_pax": 1,
--     "max_pax": 2,
--     "original_price_vt": 5000,
--     "deal_price_vt": 4000
--   },
--   {
--     "label": "3+ guests",
--     "min_pax": 3,
--     "max_pax": null,
--     "original_price_vt": 4500,
--     "deal_price_vt": 3600
--   }
-- ]
-- All prices are per person in Vanuatu Vatu unless your product logic defines otherwise.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS pricing_tiers jsonb;

COMMENT ON COLUMN public.businesses.pricing_tiers IS
  'Optional JSON array of pricing tiers (min_pax, max_pax, original/deal VT per person). Null = use flat original_price/discounted_price.';
