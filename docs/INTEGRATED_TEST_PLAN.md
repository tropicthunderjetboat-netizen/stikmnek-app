# Integrated Test Plan — Business Listing & Auth

**Date:** 2025-03-11  
**Covers:** pending_businesses submission fix, auth/session/redirect fix

---

## Prerequisites

- [ ] Run consolidated migration in Supabase SQL Editor:
  ```bash
  # From project root:
  supabase db push
  ```
  Or manually run `supabase/migrations/20250311170000_consolidate_pending_businesses.sql`

- [ ] Verify `insert_pending_business` RPC exists:
  ```sql
  SELECT proname FROM pg_proc WHERE proname = 'insert_pending_business';
  ```

- [ ] Verify `manage-business` Edge Function is deployed (optional fallback)

---

## 1. Business Listing Submission

### 1.1 RPC Path (Primary)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign in as business user | Success |
| 2 | Go to Business Dashboard → Submissions → Add New | Form loads |
| 3 | Fill required fields (name, category, description, etc.) | No validation errors |
| 4 | Submit | Toast: "Business submitted for approval!" |
| 5 | Check Supabase Table Editor → `pending_businesses` | New row with `status = 'pending'` |
| 6 | Check browser console | No "permission denied" errors |

### 1.2 List Your Business Form (Public Page)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign in as business user (or sign up new business) | Success |
| 2 | Scroll to "List Your Business" section | Form visible |
| 3 | Fill and submit | Toast: "Business listing submitted for review!" |
| 4 | Check `pending_businesses` | New row |

### 1.3 Edge Function Fallback (If RPC Fails)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Temporarily rename/drop RPC in DB (or use project without migration) | — |
| 2 | Submit business listing | Console: "RPC failed, trying manage-business Edge Function..." |
| 3 | If Edge Function has `SUPABASE_SERVICE_ROLE_KEY` | Submission succeeds via Edge Function |
| 4 | If Edge Function fails | Error message with migration hint |

---

## 2. Authentication & Redirect

### 2.1 Explicit Sign-In (New Session)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign out (if logged in) | Cleared |
| 2 | Click "Sign In" in navbar | Auth modal opens |
| 3 | Enter email + password, submit | Toast: "Welcome! Redirecting to your dashboard..." (business) or "Welcome to StikmNek!" (tourist) |
| 4 | Business user | Redirected to Business Dashboard |
| 5 | Tourist user | Stays on home (or current view) |
| 6 | Admin user | Redirected to Admin Panel |

### 2.2 Session Restore (Returning User)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign in as business user | Success |
| 2 | Close browser tab (do not sign out) | — |
| 3 | Reopen app in new tab | User is logged in (session from localStorage) |
| 4 | **No automatic redirect** | User stays on home/current view |
| 5 | Click "Business Dashboard" in nav | Navigates to dashboard |

### 2.3 Auth Modal When Already Logged In

| Step | Action | Expected |
|------|--------|----------|
| 1 | Be logged in as any role | — |
| 2 | Click "Sign In" in navbar | Auth modal opens |
| 3 | **Do not enter credentials** | — |
| 4 | Within a few seconds | Modal closes, toast: "You're already signed in." |
| 5 | **No redirect** | User stays on current page |

### 2.4 Role Resolution

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign up as **Tourist** | `user_profiles.role = 'tourist'`, `user_profiles.user_type = 'tourist'` |
| 2 | Sign in | Redirect to home, not Business Dashboard |
| 3 | Sign up as **Business** | `user_profiles.role = 'business'`, `user_profiles.user_type = 'business'` |
| 4 | Sign in | Redirect to Business Dashboard |
| 5 | Admin email (admin@stikmnek.com) | Always resolves to admin, redirect to Admin Panel |

### 2.5 Password Reset

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Sign In" → "Forgot Password?" | Forgot password screen |
| 2 | Enter email, submit | Toast: "Check your email for a password reset link" |
| 3 | Click link in email | Redirect to app, can set new password |

---

## 3. Cross-Role Scenarios

### 3.1 Tourist Cannot Access Business Dashboard

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign in as tourist | — |
| 2 | Manually navigate to business-dashboard (e.g. URL) | Redirected to tourist dashboard or home |

### 3.2 Business User on Tourist Dashboard

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign in as business | Redirected to Business Dashboard |
| 2 | Click "Deals" or "Home" | Can view tourist content |
| 3 | If navigated to `dashboard` (tourist) | AppLayout redirects to business-dashboard |

### 3.3 Admin Access

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign in as admin@stikmnek.com | Redirect to Admin Panel |
| 2 | Can access Admin Panel, pending submissions, etc. | Full access |

---

## 4. Error Scenarios

### 4.1 Permission Denied (Should Not Occur After Fix)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Submit business listing | No "permission denied for table pending_businesses" |
| 2 | If error occurs | Check: (a) migration applied, (b) RPC exists, (c) user is authenticated |

### 4.2 RPC Not Found

| Step | Action | Expected |
|------|--------|----------|
| 1 | Migration not applied | RPC call fails with "function does not exist" or similar |
| 2 | Frontend falls back to Edge Function | If Edge Function works, submission succeeds |
| 3 | Error message | Suggests applying migration |

---

## 5. Quick Verification Checklist

- [ ] Business listing submission works (Dashboard and List Your Business form)
- [ ] No "permission denied" errors in console or toast
- [ ] New rows appear in `pending_businesses` with correct `owner_id`
- [ ] Sign in redirects to correct dashboard by role
- [ ] Session restore does NOT auto-redirect
- [ ] Auth modal closes with "You're already signed in" when opening while logged in
- [ ] No redirect when opening auth modal while already logged in
- [ ] Password reset flow works
- [ ] Role resolution correct for tourist, business, admin
