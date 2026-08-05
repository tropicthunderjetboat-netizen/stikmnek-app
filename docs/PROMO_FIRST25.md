# FIRST25 — First 25 travelers free

Limited cold-start promo: first 25 travelers who build a pass claim it for **free** (skips PayPal). Same QR / redemption / review flow as paid passes.

## Deploy

1. Apply migration:
   ```bash
   supabase db push
   # or run: supabase/migrations/20260805120000_promo_first_25_travelers.sql
   ```
2. Deploy Edge Function:
   ```bash
   supabase functions deploy claim-promo-pass
   ```
3. Confirm `config.toml` has `[functions.claim-promo-pass] verify_jwt = false`.

## Turn off without a deploy

Admin panel → **Promos** → Pause promo (sets `promo_campaigns.is_active = false`).

## Funnel

Admin → Promos shows claims with trip dates, redemption count, review count.

## Revenue

`is_promo_free = true` / `payment_provider = 'promo'` / `amount_paid = 0` are excluded from paid revenue & AOV in Overview. GA4 event: `promo_pass_claimed` (not `purchase`).

## Nurture / scheduled emails

Pass confirmation email still fires from PaymentConfirmation (same template; payment method = “Free traveler promo”).

**Not built yet (no existing tourist cron):** arrival-day nudge and WhatsApp nurture. Existing crons are pass expiry, tourist account purge, and business deal-expiry digest only. Add a scheduled Edge Function later if needed — do not invent a parallel scheduler in-app.

## Acceptance checklist

- [ ] First 25 claims skip PayPal
- [ ] 26th falls back to paid checkout
- [ ] Race near limit cannot exceed 25
- [ ] Same email cannot claim twice
- [ ] Admin Promos shows funnel
- [ ] Promo excluded from paid revenue
- [ ] Confirmation email + review-after-redemption still work
- [ ] Pause from admin works
