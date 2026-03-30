-- Idempotent pass creation: one pass per (user_id, payment_session_id) when session id is set.
-- payment_session_id stores gateway transaction id or client idempotency key.

CREATE UNIQUE INDEX IF NOT EXISTS idx_passes_user_payment_session_id_unique
  ON public.passes (user_id, payment_session_id)
  WHERE payment_session_id IS NOT NULL AND length(trim(payment_session_id)) > 0;

COMMENT ON INDEX idx_passes_user_payment_session_id_unique IS
  'Prevents duplicate pass rows for the same payment transaction / idempotency key per user.';
