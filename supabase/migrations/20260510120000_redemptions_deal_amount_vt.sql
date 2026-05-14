-- Record StikmNek deal price (VT) per redemption for business-owner analytics.
-- `saved_amount` remains tourist discount; `deal_amount_vt` is the member-rate total charged at redemption time.

ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS deal_amount_vt numeric(12, 2);

COMMENT ON COLUMN public.redemptions.deal_amount_vt IS
  'Total VT at StikmNek deal/member price for this redemption (party-sized). Populated by verify-redemption; used for business analytics.';
