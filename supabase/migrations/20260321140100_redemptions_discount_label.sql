-- Store human-readable discount / offer line on each redemption (for receipts & analytics).
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS discount_label text;

COMMENT ON COLUMN public.redemptions.discount_label IS 'Offer redeemed, e.g. "10% Off — Jet Ski Rentals"';
