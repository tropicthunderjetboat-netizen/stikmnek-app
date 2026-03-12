# StikmNek Application — Progress Report

**Date:** March 11, 2025  
**Purpose:** Comprehensive baseline and roadmap for next steps

---

## 1. Authentication & User Management

### Current Status

| User Type | Status | Notes |
|-----------|--------|-------|
| **Tourist** | ✅ Working | Sign up, sign in, profile creation, session restore |
| **Business** | ✅ Working | Sign up with `user_type: business`, profile creation |
| **Admin** | ✅ Working | Via `testadmin@example.com` or `admin@stikmnek.com` (if password reset works) |

### Key Fixes Implemented

- **ADMIN_EMAILS** in `AppContext.tsx`: `admin@stikmnek.com`, `testadmin@example.com` always resolve to admin role
- **Session restore logic**: No auto-redirect on session restore; only redirect on explicit sign-in (SIGNED_IN event)
- **directProfileInsert**: Never downgrades admin to tourist; preserves existing admin role from DB
- **resolveRole flow**: Checks ADMIN_EMAILS first, then `user_profiles.role`/`user_type`, then metadata
- **redirectForRole**: Admin → Admin Panel; Business → Business Hub; Tourist → Dashboard
- **get_all_users_for_admin RPC**: Admin can load all users (tourists + businesses) bypassing RLS
- **admin_delete_user** in `manage-business` Edge Function: Admin can delete users from `auth.users` (after cleaning related tables)
- **Admin menu cleanup**: Admin nav shows only Admin (no My Dashboard or Business Hub)

### Outstanding Issues

- **admin@stikmnek.com password reset**: May not receive reset emails. See `docs/ADMIN_ACCESS_FIX.md` for diagnosis (Supabase Auth logs, SMTP/SendGrid config, Site URL, redirect URLs)
- **Temporary workaround**: Use `testadmin@example.com` with SQL-promoted admin role (see ADMIN_ACCESS_FIX.md)
- **Navigator lock timeout**: `[apebase] Navigator.lock(): 'lock.stikmnek-auth' timed out` — in-memory fallback used; non-blocking

---

## 2. Business Listings & Features

### Current Status

| Feature | Status | Notes |
|---------|--------|-------|
| **Create listing** | ✅ Working | RPC-first (`insert_pending_business`), Edge Function fallback |
| **Photo upload** | ✅ Implemented | `upload-photo` Edge Function; `business-photos` bucket |
| **Photo display** | ⚠️ Partially fixed | `image_url` mapping, `getBusinessImageUrl()` for storage paths; ensure buckets are public |
| **WhatsApp number** | ✅ Supported | `whatsapp_number` in `pending_businesses`, `businesses` |
| **Admin approval** | ✅ Working | `review_pending_business` RPC; updates `business_photos` to new business id |
| **Pending edits** | ✅ Working | `get_pending_edits_for_admin` RPC; `manage-business` review_edit |
| **Bulk photo approval** | ✅ Working | Approve All / Reject All; individual approve/reject per photo |

### Key Fixes Implemented

- **insert_pending_business RPC** (SECURITY DEFINER): Bypasses RLS for business submission
- **review_pending_business RPC**: Approves/rejects; inserts into `businesses`; updates `business_photos`
- **get_pending_businesses_for_admin RPC**: Admin loads pending submissions
- **get_pending_edits_for_admin RPC**: Admin loads pending edits
- **manage-business Edge Function**: submit_business, get_pending, review_business, approve_photo, reject_photo, get_all_photos, admin_delete_user
- **AppContext column mapping**: `image_url`, `deal`, `discounted_price`, `opening_hours` (matches DB schema)
- **getBusinessImageUrl()**: Resolves storage paths to full public URLs; handles `business-photos` and `images` buckets
- **BusinessCard onError**: Placeholder fallback when image fails
- **send-email Edge Function**: `send_business_decision` action for approval/rejection notifications (requires SENDGRID_API_KEY)

### Outstanding Issues

- **Email notifications**: May not be received if `SENDGRID_API_KEY` not set or SendGrid not configured
- **Storage buckets**: `business-photos` and `images` must be **public** (see `docs/STORAGE_SETUP.md`)
- **Invalid image_url data**: Some rows may have bad values (e.g. `created_at_s.jpg`); fix in DB or rely on placeholder
- **Business Dashboard sync**: Realtime subscription for `pending_businesses` status updates; verify end-to-end flow

---

## 3. Superstar Review Feature

### Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Database** | ✅ Ready | `reviews_rating_check` allows 1–6; `superstar_credits` on `user_profiles` |
| **submit_superstar_review RPC** | ✅ Implemented | Atomic: decrement credit + insert 6-star review with `has_super_star = true` |
| **increment_superstar_credits RPC** | ✅ Implemented | Called after purchase |
| **process-card-payment** | ⚠️ Stub | `purchase_superstar` increments credits but **no actual card charge** (TODO) |
| **ReviewForm UI** | ✅ Implemented | Super Star option, modal, card form for payment |
| **Super Star display** | ✅ Implemented | SuperStarBadge, `has_super_star` in reviews |

### Key Fixes Implemented

- **Migration `20250311120000_superstar_review_support.sql`**: Rating constraint, superstar_credits, submit_superstar_review, increment_superstar_credits
- **AppContext.submitReview**: Uses `submit_superstar_review` RPC when `rating === 6` or `isSuperStar`
- **ReviewForm**: Super Star toggle, purchase flow via `process-card-payment` (purchase_superstar)
- **FeaturedLeaderboard / BusinessCard**: SuperStarBadge shows count
- **ReviewsSection**: Displays `has_super_star` reviews with star indicator

### Outstanding Issues

- **No real payment for Super Star**: `process-card-payment` `purchase_superstar` increments credits without charging; TODO: integrate PayPal/Stripe
- **Full end-to-end test**: Purchase Super Star → submit 6-star review → verify credit decremented and review appears
- **superstar-checkout Edge Function**: Referenced in README but may not exist; `process-card-payment` handles purchase_superstar

---

## 4. Infrastructure & Deployment

### Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Supabase project** | ✅ Connected | Project ref: `hbaflbmfptobyfqbudrt` |
| **Supabase URL / Anon Key** | ✅ Configured | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in env |
| **Edge Functions** | ⚠️ Deploy required | `manage-business`, `send-email`, `upload-photo`, `process-card-payment` must be deployed |
| **Storage buckets** | ⚠️ Verify | `business-photos`, `images` — ensure public |
| **Vercel** | ⚠️ Not confirmed | No `vercel.json` in repo; deployment likely manual or via Git integration |
| **Sentry** | ⚠️ Configure | `SENTRY_DSN` secret for relay; `sentry-relay` Edge Function referenced but may not exist |
| **SendGrid** | ⚠️ Configure | `SENDGRID_API_KEY` for send-email function |

### Key Configurations

- **Supabase URL**: `https://hbaflbmfptobyfqbudrt.supabase.co`
- **Migrations applied**: 10 migrations (pending_businesses, RPCs, superstar, admin users)
- **Edge Functions in repo**: `manage-business`, `send-email`, `upload-photo`, `process-card-payment`

### Outstanding Issues

- **Deploy Edge Functions**: `supabase functions deploy manage-business send-email upload-photo process-card-payment`
- **Set secrets**: `SENDGRID_API_KEY`, `SENTRY_DSN`, `PAYPAL_*` as needed
- **Production redirects**: Supabase Auth → URL Configuration → Site URL, Redirect URLs for production domain
- **Storage policies**: Ensure public read for `business-photos` and `images`

---

## 5. Next Immediate Steps (Roadmap)

### Priority 1 — Critical

1. **Deploy Edge Functions**  
   - `supabase functions deploy manage-business send-email upload-photo process-card-payment`  
   - Verify each function responds (health/health_check)

2. **Configure SendGrid**  
   - Set `SENDGRID_API_KEY` in Supabase secrets  
   - Test business approval/rejection email

3. **Verify Storage**  
   - Ensure `business-photos` and `images` buckets exist and are public  
   - Fix any invalid `image_url` values in `businesses` table

### Priority 2 — Important

4. **Admin password reset**  
   - Follow `docs/ADMIN_ACCESS_FIX.md` to diagnose `admin@stikmnek.com`  
   - Optionally switch admin email to Gmail if domain email not receiving

5. **Super Star payment**  
   - Integrate real payment (PayPal/Stripe) in `process-card-payment` for `purchase_superstar`  
   - Test: purchase → increment credits → submit 6-star review

6. **Production URLs**  
   - Set Supabase Auth Site URL and Redirect URLs for production domain  
   - Confirm Vercel (or host) deployment and env vars

### Priority 3 — Polish

7. **End-to-end testing**  
   - Tourist: signup → pass purchase → deal redemption  
   - Business: signup → listing → photo upload → admin approval → live listing  
   - Admin: approve business, delete user, bulk photo approve

8. **UI/UX polish**  
   - Confirm placeholder images for failed loads  
   - Verify Super Star badge display on reviews and leaderboard  
   - Multi-language (EN/FR/BI) spot-check

9. **Monitoring**  
   - Configure Sentry DSN and deploy sentry-relay if used  
   - Verify error_logs and diagnostics panel

---

## Quick Reference: Key Files

| Area | Files |
|------|-------|
| Auth | `src/contexts/AppContext.tsx`, `src/lib/supabase.ts` (directProfileInsert) |
| Business | `src/components/BusinessListingForm.tsx`, `BusinessOwnerDashboard.tsx`, `AdminPanel.tsx` |
| Photos | `src/lib/utils.ts` (getBusinessImageUrl), `supabase/functions/upload-photo` |
| Super Star | `src/components/ReviewForm.tsx`, `src/contexts/AppContext.tsx` (submitReview), `process-card-payment` |
| Admin | `src/components/AdminPanel.tsx`, `AdminUserManager.tsx`, `docs/ADMIN_ACCESS_FIX.md` |
| Migrations | `supabase/migrations/` (10 files) |
