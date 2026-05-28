-- Shopping redemptions: store how many items were discounted (separate from pass people count).

ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS item_quantity integer;

COMMENT ON COLUMN public.redemptions.item_quantity IS
  'For per-unit (shopping) listings: number of items in this redemption. Null for per-person deals.';
