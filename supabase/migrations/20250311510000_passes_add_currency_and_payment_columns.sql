-- StikmNek: Add currency and other payment-related columns to passes table
-- Required by process-card-payment when inserting pass records.

ALTER TABLE public.passes
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'AUD';

ALTER TABLE public.passes
ADD COLUMN IF NOT EXISTS payment_provider text;

ALTER TABLE public.passes
ADD COLUMN IF NOT EXISTS payment_session_id text;

ALTER TABLE public.passes
ADD COLUMN IF NOT EXISTS purchased_at timestamptz;

COMMENT ON COLUMN public.passes.currency IS 'Currency code for amount_paid (e.g. AUD).';
COMMENT ON COLUMN public.passes.payment_provider IS 'e.g. card-mock, paypal.';
COMMENT ON COLUMN public.passes.payment_session_id IS 'External payment session/order ID if any.';
COMMENT ON COLUMN public.passes.purchased_at IS 'When the pass was purchased (ISO timestamp).';
