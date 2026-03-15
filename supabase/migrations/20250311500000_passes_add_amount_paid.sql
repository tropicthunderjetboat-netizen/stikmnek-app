-- StikmNek: Add amount_paid to passes table
-- Required by process-card-payment (and paypal-capture) when inserting pass records.

ALTER TABLE public.passes
ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) DEFAULT 0;

COMMENT ON COLUMN public.passes.amount_paid IS 'Amount paid for the pass (AUD).';
