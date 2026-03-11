# StikmNek Post-Migration Audit Report & Test Steps

**Date:** March 11, 2025  
**Scope:** Codebase integrity, sign-in hang fix, role assignment, Forgot Password, Business Listing persistence

---

## 1. Codebase Integrity Check — VERIFIED ✅

### Superstar Review Fixes
- **ReviewForm.tsx:** `rating=6`, `has_super_star`, `superstarCredits` from user, `submitReview(businessId, rating, comment, wasSuperStar)` with `wasSuperStar = rating === 6`
- **AppContext.tsx:** `submitReview` uses `submit_superstar_review` RPC when `isSuperStar || rating === 6`; `DBReview` has `has_super_star`; `UserProfile` and `User` have `superstar_credits` / `superstarCredits`
- **Migration:** `20250311120000_superstar_review_support.sql` present (rating 1–6, `superstar_credits`, RPCs)

### Pricing Structure
- **pricing.ts:** $15 (Family Explorer), $45 (Extended Group Adventure), $99 (Ultimate Crew Experience) AUD with share bonus descriptions
- **PaymentCheckout.tsx:** Uses `PASS_PRODUCTS` from pricing
- **PassCards / usePassConfig:** Uses pricing data for titles and share bonuses
- **AppContext:** `purchasePass` uses `{ daily: 15, weekly: 45, monthly: 99 }`

---

## 2. Sign-in Hang — FIXED ✅

### Root Cause
- `signIn()` set `authLoading(true)` and relied on `onAuthStateChange` SIGNED_IN to clear it.
- If SIGNED_IN never fired (e.g. Supabase client bug, network issue) or `handleAuthenticatedUser` hung, `authLoading` stayed true indefinitely.
- The 6s safety timer only ran on mount; if the user signed in after 6s, there was no safety net.

### Implemented Fixes
1. **Per-sign-in safety timer (8s):** After `signInWithPassword` succeeds, set a timer. If `authLoading` is still true after 8s, force it false and show a toast. Timer is cleared when `handleAuthenticatedUser` completes.
2. **AuthModal loading overlay:** When `authLoading` is true and the auth modal is open, show a loading overlay with "Signing you in..." so users see feedback.
3. **Unhandled event handling:** Default case in `onAuthStateChange` now sets `authLoading(false)`.

---

## 3. Role Assignment & Redirection — VERIFIED ✅

### Role Resolution Logic
- **Priority:** 1) Admin email (ADMIN_EMAILS) 2) DB profile (`user_type` or `role`) 3) Last known role 4) Auth metadata 5) Default tourist
- **Admin emails:** `admin@stikmnek.com` — add more in `AppContext.tsx` if needed.
- **extractRole:** Uses `profile.user_type || profile.role`; falls back to `profile.role` if `user_type` is missing.

### Routing
- **Tourist:** `dashboard` (My Dashboard)
- **Business:** `business-dashboard` (My Business)
- **Admin:** `admin` (Admin Panel) + access to dashboard and business-dashboard

### Migration Added
- `20250311130000_add_user_type_columns.sql` — adds `name`, `full_name`, `user_type` to `user_profiles` if missing.

---

## 4. Forgot Password — IMPLEMENTED ✅

- **AuthModal:** "Forgot Password?" link on sign-in form; dedicated screen with email input
- **Backend:** Uses `supabase.auth.resetPasswordForEmail(email, { redirectTo })`
- **Feedback:** Success message "Check your email for a password reset link"
- **Supabase:** Ensure Site URL and Redirect URLs are configured in Auth settings for the reset link to work

---

## 5. Business Listing Persistence — FIXED ✅

### Root Cause
- **Strategy 1:** `manage-business` edge function does not exist → fails
- **Strategy 2 (fallback):** Direct insert to `pending_businesses` was failing because the insert included `whatsapp_number`, which does not exist in the base `pending_businesses` schema

### Fix
- Removed `whatsapp_number` from the direct insert payload (column not in base schema)
- Migration `20250311140000_add_whatsapp_to_pending_businesses.sql` adds the column if you want to persist WhatsApp numbers

### RLS
- `pending_businesses_insert_auth`: `WITH CHECK (auth.role() = 'authenticated')` — any authenticated user can insert ✅

### Dashboard
- BusinessOwnerDashboard uses `manage-business` first; when it fails, falls back to direct `pending_businesses` query by `owner_id`
- Realtime subscription on `pending_businesses` refreshes when new rows are inserted

---

## 6. Manual Test Steps

### Prerequisites
1. Run migrations in Supabase SQL Editor (if not already applied):
   - `supabase/migrations/20250311120000_superstar_review_support.sql`
   - `supabase/migrations/20250311130000_add_user_type_columns.sql`
2. Ensure `admin@stikmnek.com` is in `ADMIN_EMAILS` in `AppContext.tsx` (or add your admin email).

### Test 1: Sign-in (No Hang)
1. Open the app in an incognito/private window.
2. Click **Sign In**.
3. Enter valid credentials and submit.
4. **Expected:** Loading overlay appears ("Signing you in..."), then modal closes and you are redirected.
5. **If hang:** After 8s, loading should clear and a toast should say "If you signed in successfully, please refresh the page."

### Test 2: Tourist Role
1. Sign up as **Tourist** (or sign in with a tourist account).
2. **Expected:** Redirect to Home/Discovery feed; nav shows "My Dashboard".
3. Click **My Dashboard** — should see tourist dashboard.

### Test 3: Business Role
1. Sign up as **Business** (or sign in with a business account).
2. **Expected:** Redirect to Business Dashboard; nav shows "My Business".
3. Should not see tourist-only dashboard as primary.

### Test 4: Admin Role
1. Sign in with `admin@stikmnek.com` (or your admin email).
2. **Expected:** Toast "Welcome back, Admin!"; redirect to Admin Panel.
3. Nav should show Admin, My Dashboard, Business Hub.
4. Admin panel should be accessible.

### Test 5: Superstar Review
1. Sign in as a user with at least one Super Star credit (or purchase one).
2. Open a business detail and submit a review with the 6th (Super Star) star.
3. **Expected:** Review submits; credits decrement; review shows as Super Star.

### Test 6: Pricing
1. Go to **Passes**.
2. **Expected:** Family Explorer $15, Extended Group Adventure $45, Ultimate Crew Experience $99 AUD.
3. Share bonus descriptions visible on each pass card.

### Test 7: Forgot Password
1. Sign in screen → click **Forgot Password?**
2. Enter email and submit.
3. **Expected:** "Check your email for a password reset link" toast.
4. Verify reset email arrives (check Supabase Auth → Email Templates if needed).

### Test 8: Business Listing Persistence
1. Sign in as a **Business** user.
2. Go to **List Your Business** (home page scroll or "List Your Business" banner).
3. Fill name, description, submit.
4. **Expected:** "Business listing submitted for review!" toast.
5. Open Supabase Dashboard → Table Editor → `pending_businesses` — verify new row.
6. Go to **Business Dashboard** — verify "1" (or more) pending listing(s).

---

## Files Modified

| File | Changes |
|------|---------|
| `src/contexts/AppContext.tsx` | Per-sign-in safety timer, timer cleanup in `handleAuthenticatedUser`, `setAuthLoading(false)` in default auth event |
| `src/components/AuthModal.tsx` | Loading overlay when `authLoading` is true; **Forgot Password** flow (link, screen, `resetPasswordForEmail`) |
| `src/components/BusinessListingForm.tsx` | Removed `whatsapp_number` from direct insert (column missing in base schema) |
| `supabase/migrations/20250311130000_add_user_type_columns.sql` | New migration for `user_type`, `name`, `full_name` |
| `supabase/migrations/20250311140000_add_whatsapp_to_pending_businesses.sql` | New migration for `whatsapp_number` on `pending_businesses` |
