# StikmNek — Final Comprehensive Test Plan

**Purpose:** Validate all critical flows after the 21 migrations are applied and the latest frontend/Edge Functions are deployed (e.g. via Vercel + Supabase).

**Prerequisites:**
- All 21 SQL migrations executed in Supabase (in order).
- Edge Functions deployed: `manage-business`, `upload-photo`, `send-email`, `process-card-payment`, `verify-redemption`, `extend-pass`, `create-checkout`, `paypal-capture` (deploy any that are used).
- Supabase secrets set: `SENDGRID_API_KEY` (and optionally `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`). For PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE` (if used).
- Verify JWT **OFF** for: `send-email`, `process-card-payment`, `extend-pass`, `create-checkout`, `paypal-capture` (so the gateway forwards the `Authorization` header).
- Frontend deployed (e.g. Vercel) from the latest commit.

---

## 1. Business Listing Lifecycle

| Step | Action | Expected result |
|------|--------|-----------------|
| 1.1 | **Business sign-up** | Create a test business-owner account (or use existing). |
| 1.2 | **Create listing** | Log in as business owner → Business Hub / Dashboard → Create new listing: name, category, description, location, discount, contact, **upload up to 5 photos**. Submit. | Submission succeeds; listing appears as “Pending” (or equivalent). |
| 1.3 | **Admin approval** | Log in as admin → Admin Panel → Pending listings → Open the pending listing. Verify **all uploaded photos** are visible. Click **Approve**. | Listing moves from `pending_businesses` to `businesses`; `owner_id` is set; `business_photos` linked to new `businesses.id` with status `approved`. No “column not found” (e.g. `deal_price`, `map_url`) errors. |
| 1.4 | **Owner sees approved listing** | Log in as business owner → Business Hub. | Approved listing appears in the list (not “No businesses yet”). Owner can open and **edit** the listing. |
| 1.5 | **Edit approved listing** | As owner, open the approved listing → Edit form → Change name/description/discount/photos as allowed → Save. | Save succeeds; changes persist. All 5 (or current) photos display and can be managed if the UI supports it. |

---

## 2. Photo Management

| Step | Action | Expected result |
|------|--------|-----------------|
| 2.1 | **Owner: upload 5 photos** | During create or edit listing, upload 5 distinct photos. | All 5 upload successfully and appear in the UI (no “Edge Function non-2xx” or hang). |
| 2.2 | **Admin: see all photos** | As admin, open a pending listing. | **All** photos for that listing are visible (not only one). |
| 2.3 | **Admin: approve/reject per photo** | As admin, approve or reject individual photos (if the UI offers it). | Status updates; approved photos show on the public/listings view; rejected ones do not (per app logic). |
| 2.4 | **Resubmit after reject** | Reject a listing → as owner, edit and resubmit (with or without new photos). | Resubmit succeeds; no “column does not exist” (e.g. `map_url`, `website`) errors. |

---

## 3. Tourist Pass Purchase

| Step | Action | Expected result |
|------|--------|-----------------|
| 3.1 | **Checkout flow** | Log in as tourist → Passes → Select pass type and start date → **Pay with Card**. Enter card details (test/sandbox as needed) → Submit. | Payment succeeds; no redirect away from StikmNek; success message and receipt view. |
| 3.2 | **Pass creation** | After payment, check Supabase `public.passes`. | New row: correct `user_id`, `pass_type`, `valid_from`, `valid_until`, `expires_at`, `max_people`, `amount_paid`, `currency`, `share_bonus_applied = false`. |
| 3.3 | **Receipt page** | On receipt/confirmation page. | Shows correct pass details, receipt number, “Confirmation email sent to &lt;email&gt;” (or clear error if email failed). |
| 3.4 | **Share bonus display** | On receipt page → Share via WhatsApp (or share CTA) → complete share and claim bonus. | Toast confirms bonus; **receipt section updates in place**: people count (e.g. 4 → 6), “Valid until” extended if bonus days, “Share bonus applied” and “Up to N people” correct. No need to leave the page. |
| 3.5 | **Email receipt** | Check inbox (and spam) for the buyer email. | Confirmation/receipt email received with correct receipt number, pass type, amount, validity. |

---

## 4. Admin Access & Management

| Step | Action | Expected result |
|------|--------|-----------------|
| 4.1 | **Admin login** | Log in with admin account (e.g. `admin@stikmnek.com` or test admin). | Login succeeds; Admin Panel accessible. |
| 4.2 | **View/edit businesses** | In Admin Panel, open an approved business → edit details (e.g. name, deal_price, discount). Save. | Save succeeds; **no “deal_price column not found”** or other schema errors. |
| 4.3 | **Approve/reject listings** | Approve and reject different pending listings. | Approve: listing moves to `businesses`, owner sees it. Reject: listing stays in `pending_businesses` with status `rejected`; owner can resubmit. |

---

## 5. Email & Password Reset

| Step | Action | Expected result |
|------|--------|-----------------|
| 5.1 | **Password reset request** | From login/auth modal → “Forgot password” → enter email → submit. | No hang; “check your email” message. |
| 5.2 | **Reset link** | Open the link from the email (inbox or spam). | Redirects to **/reset-password** (not home) with hash preserved; “Set new password” form is shown. |
| 5.3 | **Set new password** | Enter new password twice → submit. | Success message; can sign in with the new password. |
| 5.4 | **Confirmation emails** | Trigger flows that send email (e.g. pass purchase confirmation, business decision if used). | Emails received (or clear error in UI/logs if SendGrid fails). |

---

## 6. QR Scanner (Verification)

| Step | Action | Expected result |
|------|--------|-----------------|
| 6.1 | **Scanner role** | Log in as business owner or admin. | Can open QR scanner / verification flow. |
| 6.2 | **Scan valid pass** | Scan a valid pass QR (or enter payload) for a tourist who has an active pass. | Verification succeeds; pass validity and details shown; if “verify and redeem” is used, redemption is recorded in `public.redemptions`. |
| 6.3 | **Scan invalid/expired** | Scan an expired or invalid payload. | Clear “invalid” or “expired” message; no redemption created. |

---

## Quick Checklist (high level)

- [ ] Business: create listing with 5 photos → submit.
- [ ] Admin: see all photos → approve listing → no schema errors.
- [ ] Owner: sees approved listing → can edit it and see all photos.
- [ ] Tourist: purchase pass with card → receipt page → confirmation email received.
- [ ] Share bonus: claim on receipt page → people count and validity update on the page.
- [ ] Admin: edit business (e.g. deal_price) → no errors.
- [ ] Password reset: email link → /reset-password → set password → sign in.
- [ ] QR: business/admin can verify a valid pass (and redeem if applicable).

---

**If any step fails:** note the exact screen, action, and message; check Supabase Edge Function logs and Auth/Storage logs as needed; verify RLS and RPC names match the app (e.g. `review_pending_business`, `get_all_owner_data`).
