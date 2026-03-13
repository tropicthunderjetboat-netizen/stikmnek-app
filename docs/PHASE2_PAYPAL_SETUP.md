# Phase 2: PayPal Pass Purchase Setup

This document describes the PayPal (sandbox) flow added for Phase 2 and how to configure it.

## What Was Added

1. **Edge Function: `create-checkout`**
   - Creates a PayPal order for the selected pass (daily $15, weekly $45, monthly $99 AUD).
   - Returns an approval URL; the frontend redirects the user to PayPal to pay.
   - Uses **PayPal Sandbox** by default.

2. **Edge Function: `paypal-capture`**
   - Called when the user returns from PayPal after approving payment.
   - Captures the order via PayPal API, then inserts a row into the `passes` table.
   - Sets: `user_id`, `pass_type`, `active`, `valid_from`, `valid_until`, `expires_at`, `max_people`, `share_bonus_applied`, `purchased_at`.

3. **Frontend**
   - **PaymentCheckout:** "Pay with PayPal" button that calls `create-checkout`, stores `paypalPending` in localStorage, and redirects to PayPal.
   - **PayPalReturnHandler:** On return, calls `paypal-capture` with `paypalOrderId`, `passType`, `startDate` (from `paypalPending`), then shows success and navigates to the payment confirmation view.

## Supabase Secrets (Required)

In **Supabase Dashboard → Project Settings → Edge Functions → Secrets**, add:

| Secret | Description |
|--------|-------------|
| `PAYPAL_CLIENT_ID` | Your PayPal sandbox app **Client ID** |
| `PAYPAL_CLIENT_SECRET` | Your PayPal sandbox app **Secret** |
| `PAYPAL_MODE` | Optional. Use `sandbox` (default) or `live`. (Legacy: `PAYPAL_SANDBOX=true` / `false` also works.) |

Get sandbox credentials from [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) → Apps & Credentials → Sandbox → Create App (or use existing sandbox app).

## Share Bonus: `extend-pass` Edge Function

When a tourist shares the app (from the Passes page), the frontend calls **`extend-pass`** to apply the share bonus to their active pass (extra people and/or extra days). You must deploy this function for the share bonus to work:

```bash
supabase functions deploy extend-pass
```

- **Daily pass:** +2 people (no extra days).
- **Weekly pass:** +2 people and +1 day.
- **Monthly pass:** +1 person and +1 day.

The `passes` table must have `max_people` and `share_bonus_applied` (migration `20250311000000_add_pass_share_bonus_columns.sql`).

## Deploy Edge Functions

From your project root:

```bash
supabase functions deploy create-checkout
supabase functions deploy paypal-capture
supabase functions deploy extend-pass
```

Or deploy all functions:

```bash
supabase functions deploy
```

## Database: `passes` Table

The `paypal-capture` function inserts into `public.passes` with:

- `user_id`, `pass_type`, `active`, `valid_from`, `valid_until`, `expires_at`, `max_people`, `share_bonus_applied`, `purchased_at`

If your `passes` table does not have `purchased_at`, add it (e.g. `ALTER TABLE passes ADD COLUMN IF NOT EXISTS purchased_at timestamptz DEFAULT now();`) or the insert may fail. The app’s `loadUserPass` orders by `purchased_at`.

## Flow Summary

1. User selects a pass and date on checkout → clicks **Pay with PayPal**.
2. Frontend calls `create-checkout` → gets `approvalUrl` → saves `paypalPending` (passType, startDate, orderId, etc.) → redirects to PayPal.
3. User logs in and approves on PayPal → PayPal redirects to your site with `?paypal_return=true&token=ORDER_ID`.
4. **PayPalReturnHandler** runs → reads `paypalPending` → calls `paypal-capture` with orderId, passType, startDate.
5. `paypal-capture` captures the order with PayPal, inserts the pass, returns success.
6. Frontend shows success, refreshes user pass, and navigates to the payment confirmation page.

## Going Live

When you switch to live PayPal:

1. Create a **Live** app in PayPal Developer Dashboard and use its Client ID and Secret.
2. Set secret `PAYPAL_MODE=live` in Supabase.
3. Redeploy `create-checkout` and `paypal-capture` (no code change needed; they read the env).
