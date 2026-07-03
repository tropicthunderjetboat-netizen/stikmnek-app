-- Binds PayPal order IDs to the user who created them (verified at capture).
-- Prevents pass theft / wrong-account fulfillment.

CREATE TABLE IF NOT EXISTS public.paypal_pending_orders (
  paypal_order_id   text PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_type      text NOT NULL CHECK (product_type IN ('pass', 'superstar')),
  amount_aud        numeric(12, 2) NOT NULL,
  currency          text NOT NULL DEFAULT 'AUD',
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'captured', 'failed', 'cancelled')),
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  captured_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_paypal_pending_orders_user_id
  ON public.paypal_pending_orders(user_id);

CREATE INDEX IF NOT EXISTS idx_paypal_pending_orders_status
  ON public.paypal_pending_orders(status);

ALTER TABLE public.paypal_pending_orders ENABLE ROW LEVEL SECURITY;

-- Edge Functions use service_role; RLS is bypassed but GRANT is still required (Supabase Data API).
GRANT ALL ON public.paypal_pending_orders TO service_role;

COMMENT ON TABLE public.paypal_pending_orders IS
  'PayPal checkout orders; Edge Functions use service role. Capture verifies user_id matches JWT.';
