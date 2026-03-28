# Bugs That Need Fixing — StikmNek App

This document lists bugs and gaps identified from the codebase and existing docs (`CRITICAL_FIXES_20250311.md`, `HOLISTIC_AUDIT_2025.md`, and source review). Ordered by severity.

---

## Critical (core flows broken)

### 1. **Card pass purchase does not create a pass**

- **Where:** `supabase/functions/process-card-payment/index.ts`
- **What:** For `action === 'purchase_pass'` the handler returns **501** with message `"Pass purchase: see existing implementation"`. No pass row is inserted; card payment flow is a stub.
- **Impact:** Users paying by card never receive a pass; payment may be attempted elsewhere but the pass is never created.
- **Fix:** Implement `purchase_pass` in `process-card-payment`: validate request (passType, startDate, amount), perform card charge if applicable, then insert into `passes` with `user_id`, `pass_type`, `active`, `valid_from`, `valid_until`, `expires_at`, `max_people`, `share_bonus_applied`, `purchased_at` (mirror logic from `paypal-capture`).

### 2. **QR verification / redemption not implemented**

- **Where:** `src/components/QRScanner.tsx` calls `supabase.functions.invoke('verify-redemption', { body: { action: 'check_voucher_validity' | 'verify_and_redeem', ... } })`. There is **no** `verify-redemption` Edge Function in `supabase/functions/`.
- **Impact:** Business owners cannot verify tourist passes or record redemptions; QR flow always fails.
- **Fix:** Add Edge Function `verify-redemption` that:
  - Decodes QR payload (e.g. user_id + pass_id),
  - Validates pass is active and not expired,
  - For `verify_and_redeem`: inserts into `redemptions`, returns success,
  - For `check_voucher_validity`: returns whether the pass can be redeemed (e.g. at this business, within validity).

### 3. **Share bonus (extend-pass) not implemented**

- **Where:** `src/components/PassCards.tsx`, `src/components/PaymentConfirmation.tsx`, and `src/hooks/useAppShare.ts` call `supabase.functions.invoke('extend-pass', ...)`. There is **no** `extend-pass` Edge Function in `supabase/functions/`.
- **Impact:** “Share the app to get +2 people / +1 day” never applies; share bonus flow always fails.
- **Fix:** Add Edge Function `extend-pass` that validates share proof, finds the user’s active pass, then updates `valid_until` (and optionally `max_people`) and sets `share_bonus_applied` (and any related columns from `20250311000000_add_pass_share_bonus_columns.sql`).

---

## High (migrations / config / UX)

### 4. **Resubmit fails if pending_businesses is missing new columns**

- **Where:** `manage-business` Edge Function `resubmit_pending_business` updates `map_url`, `website`, `discount_valid_from`, `discount_valid_until`, `whatsapp_number` on `pending_businesses`. If those columns don’t exist, DB returns “column does not exist”.
- **Impact:** Edit & Resubmit for rejected listings fails with a schema error.
- **Fix:** Ensure migration **`20250311300000_pending_businesses_add_map_url_and_extras.sql`** has been applied (adds `map_url`, `website`, `discount_valid_from`, `discount_valid_until` to `pending_businesses`). Document in deployment/runbook.

### 5. **Pass expiry not enforced in the backend**

- **Where:** `passes` has `expires_at` and frontend filters by it (e.g. in `loadUserPass`), but there is no backend job or trigger that sets `passes.active = false` when `expires_at < now()`.
- **Impact:** Expired passes can still appear “active” in the DB; any backend or future client that relies on `active` may treat them as valid.
- **Fix:** Add a scheduled job (e.g. pg_cron or Supabase scheduled function) that runs periodically: `UPDATE passes SET active = false WHERE expires_at < now()`.

### 6. **ResetPassword may show “Invalid or expired link” before hash is processed** — RESOLVED

- **Where:** `src/pages/ResetPassword.tsx`.
- **Resolution:** Session readiness uses **`supabase.auth.onAuthStateChange`** together with **polled `getSession()`** (every 200ms) instead of a single mount read or a short one-shot timer. Max wait is **12s** when the URL looks like a recovery link (`access_token`, `type=recovery`, `refresh_token`, or PKCE `code=` in the query), and **4s** otherwise—reducing false “Invalid or expired link” while `detectSessionInUrl` finishes.
- **Deployment:** Root **`vercel.json`** rewrites client routes to **`/index.html`** so **`/reset-password`** is not a host-level 404 on Vercel.
- **Supabase (project settings):** **Site URL** and **Redirect URLs** must include your production origin and **`…/reset-password`**; the reset email template should keep the standard confirmation URL behavior.

---

## Medium (config / missing features)

### 7. **Admin / business decision emails not sent if SendGrid not set**

- **Where:** `send-email` Edge Function; `HOLISTIC_AUDIT_2025.md` states it returns “not configured” when `SENDGRID_API_KEY` is missing.
- **Impact:** Admins and business owners do not receive email on approve/reject.
- **Fix:** Set `SENDGRID_API_KEY` (and any other required SendGrid env) in Supabase Edge Function secrets; document in deployment/runbook.

### 8. **Admin password reset depends on Supabase Auth email**

- **Where:** Supabase Auth (GoTrue) sends the reset email; delivery depends on project SMTP/email config.
- **Impact:** If email is not configured in Supabase Dashboard, password reset emails are never delivered.
- **Fix:** Configure SMTP/SendGrid (or provider of choice) in Supabase Dashboard for Auth emails; verify with a test reset.

### 9. **Unused helpers in PaymentCheckout**

- **Where:** `src/components/PaymentCheckout.tsx` defines `getInvokeStatus()` and `getInvokeErrorBody()` but they are not used.
- **Impact:** None functional; dead code.
- **Fix:** Use them when handling `process-card-payment` (or other invoke) errors to show server status/body, or remove them.

---

## Already addressed in this branch (for reference)

- **Resubmit error surfacing:** `invokeWithRetry` in BusinessOwnerDashboard now preserves response body on non-2xx so the toast shows the real Edge Function error (e.g. column missing) instead of a generic message.
- **Password reset redirect:** Forgot-password email link now redirects to `/reset-password`; `main.tsx` redirects recovery hash from other paths to `/reset-password`.
- **Reset password UX (#6):** Resolved as described in §6 above (polling + auth listener + `vercel.json` SPA routing).
- **PayPal return:** PayPalReturnHandler passes `passType` and `startDate` to `paypal-capture` and calls `refreshUserPass()` after success.
- **create-checkout / paypal-capture:** Both Edge Functions exist and are documented in `PHASE2_PAYPAL_SETUP.md`; ensure they are deployed and secrets set.

---

## Verification checklist (after fixes)

- [ ] Card pass purchase creates a row in `passes` and user sees the pass.
- [ ] QR “check” and “verify and redeem” both succeed when `verify-redemption` is deployed.
- [ ] Share bonus flow (extend-pass) updates the pass and UI reflects it.
- [ ] Resubmit works after migration `20250311300000` is applied.
- [ ] Expired passes are marked `active = false` by the backend job.
- [x] Password reset link shows “Set new password” when the link is valid (and hash is processed). *(Verified: no host 404 on `/reset-password`; minimal false invalid state.)*
- [ ] Admin/business emails send when SendGrid is configured; admin password reset email delivers when Auth email is configured.
