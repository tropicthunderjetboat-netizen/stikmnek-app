# Comprehensive Audit & Fix Plan

**Date:** 2025-03-11  
**Issues:** (1) Permission denied for `pending_businesses`; (2) Auto sign-in / incorrect redirect

---

## 1. DEFINITIVE FIX FOR "PERMISSION DENIED" ON `pending_businesses`

### 1.1 Root Cause Analysis

#### A. `insert_pending_business` RPC Function

| Check | Status | Details |
|-------|--------|---------|
| **Exists in DB?** | ⚠️ Verify | Migration `20250311160000_insert_pending_business_rpc.sql` must be applied. Run in Supabase SQL Editor or `supabase db push`. |
| **Exact SQL definition** | See below | Full function with `SECURITY DEFINER` and `GRANT EXECUTE`. |
| **RPC called during failure?** | ⚠️ Check logs | Browser DevTools → Network → filter by `rest/v1/rpc/insert_pending_business` or `functions/v1/manage-business`. Console logs: `[BusinessForm] RPC insert FAILED` or `[Dashboard] Edge function failed, trying insert_pending_business RPC...` |

**Exact RPC definition (from `supabase/migrations/20250311160000_insert_pending_business_rpc.sql`):**

```sql
CREATE OR REPLACE FUNCTION public.insert_pending_business(
  p_owner_id uuid,
  p_name text,
  p_category text DEFAULT 'dining',
  p_description text DEFAULT '',
  p_discount text DEFAULT '',
  p_original_price numeric DEFAULT 0,
  p_deal_price numeric DEFAULT 0,
  p_location text DEFAULT 'Port Vila, Vanuatu',
  p_phone text DEFAULT '',
  p_email text DEFAULT '',
  p_hours text DEFAULT '',
  p_image text DEFAULT '',
  p_map_url text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_discount_valid_from date DEFAULT NULL,
  p_discount_valid_until date DEFAULT NULL,
  p_whatsapp_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF auth.uid() != p_owner_id THEN
    RAISE EXCEPTION 'owner_id must match authenticated user';
  END IF;

  INSERT INTO public.pending_businesses (
    owner_id, name, category, description, discount,
    original_price, deal_price, location, phone, email, hours,
    image, map_url, website, discount_valid_from, discount_valid_until,
    whatsapp_number, status
  ) VALUES (
    p_owner_id, p_name, p_category, p_description, p_discount,
    p_original_price, p_deal_price, p_location, p_phone, p_email, p_hours,
    p_image, p_map_url, p_website, p_discount_valid_from, p_discount_valid_until,
    p_whatsapp_number, 'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_pending_business TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_pending_business TO service_role;
```

#### B. `manage-business` Edge Function

| Check | Status | Details |
|-------|--------|---------|
| **Deployed & public?** | ⚠️ Verify | Supabase Dashboard → Edge Functions → `manage-business` |
| **Service role key?** | ⚠️ Critical | `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are auto-injected by Supabase. If missing, function returns 500 "Server configuration error: missing service role key". |
| **Insert code** | ✅ Correct | Lines 105–109: `createClient(supabaseUrl, supabaseServiceKey)` then `.from('pending_businesses').insert(record)`. Service role bypasses RLS. |

**Exact insert snippet (manage-business/index.ts:105–109):**

```typescript
const { data: pending, error } = await supabase
  .from('pending_businesses')
  .insert(record)
  .select()
  .single();
```

#### C. Frontend Call Stack

| Component | Primary path | Fallback path |
|-----------|-------------|---------------|
| **BusinessOwnerDashboard** | `invokeWithRetry('manage-business', { action: 'submit_business', ... })` | `supabase.rpc('insert_pending_business', { p_owner_id, p_name, ... })` |
| **BusinessListingForm** | Same | Same |

**Exact flow:** Strategy 1 = Edge Function. If `data?.success && data?.business?.id` is false, Strategy 2 = RPC. The "permission denied" can originate from:
- Edge Function insert (if service key not bypassing RLS — unlikely if key is set)
- RPC (only if RPC doesn’t exist or `auth.uid()` mismatch — RPC uses `SECURITY DEFINER` and runs as postgres)

#### D. RLS policy (for reference)

```sql
-- From 20250311150000_fix_pending_businesses_insert_rls.sql
GRANT INSERT ON public.pending_businesses TO authenticated;

DROP POLICY IF EXISTS "pending_businesses_insert_auth" ON public.pending_businesses;
CREATE POLICY "pending_businesses_insert_auth"
  ON public.pending_businesses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
```

### 1.2 Proposed Fix (Robust & Standard)

1. **RPC-first strategy:** Try `insert_pending_business` RPC first (most reliable; no Edge Function config needed).
2. **Consolidated migration:** Single migration that ensures RPC exists, grants are correct, and `whatsapp_number` column exists.
3. **Edge Function as fallback:** If RPC fails (e.g. migration not applied), try Edge Function.
4. **Diagnostic logging:** Log which path succeeded or failed for easier debugging.

---

## 2. RESOLUTION FOR "AUTO SIGN-IN / INCORRECT REDIRECT"

### 2.1 Root Cause Analysis

#### A. Session restore logic (AppContext.tsx)

| Code path | Trigger | Behavior |
|-----------|---------|----------|
| `initSession()` | On mount | Calls `getSession()` → if session exists, `handleAuthenticatedUser(session.user, false)` |
| `onAuthStateChange` | Auth events | `INITIAL_SESSION`, `SIGNED_IN`, `TOKEN_REFRESHED` → `handleAuthenticatedUser` |
| Fallback timer (1.5s) | If session not processed | Retries `getSession()` |

**Problem:** When a session exists in localStorage, `getSession()` returns it quickly. `handleAuthenticatedUser` runs with `shouldRedirect: false` for `INITIAL_SESSION`/proactive restore. But it always calls `setShowAuth(false)`. So if the user clicks "Sign In" and the modal opens, a concurrent or delayed session restore can close the modal and set `user` before the user has entered credentials.

#### B. Redirect conditions

| Condition | Redirect target |
|-----------|-----------------|
| `role === 'admin'` | `setCurrentView('admin')` |
| `role === 'business'` | `setCurrentView('business-dashboard')` |
| `role === 'tourist'` | `setCurrentView` unchanged (stays on home) |

**Problem:** The previous "fix" added `useEffect` that when `showAuth && user` → close modal and `redirectForRole(user.type)`. That causes:
- If user is already logged in and opens auth modal → immediate redirect (correct).
- But it does not distinguish "user explicitly navigated to sign-in" vs "session restored in background". The real issue is session restore running while the user thinks they need to sign in.

#### C. Role resolution

`resolveRole()` correctly:
1. Checks admin emails
2. Fetches `user_profiles` by `user_id`
3. Uses `user_type` or `role` from profile
4. Falls back to metadata or `tourist`

**Potential issue:** If `user_profiles` query fails or times out, it may fall back to `metadata.user_type` (from signup) or `tourist`. A business user with a failed profile fetch could be treated as tourist, or vice versa.

### 2.2 Proposed Fix (Secure & User-Friendly)

1. **Explicit auth intent:** When the user clicks "Sign In" or "Sign Up", record that they explicitly requested auth. Do not auto-close the modal or redirect based on a background session restore if the user has not yet completed an explicit sign-in/sign-up action.
2. **Session restore without redirect:** On app load, restore session and set `user` state, but do not redirect. Let the user stay on the current view.
3. **Redirect only on explicit sign-in:** Redirect to role-based dashboard only when `SIGNED_IN` fires (user just completed sign-in/sign-up), not on `INITIAL_SESSION` or `TOKEN_REFRESHED`.
4. **Auth modal when already logged in:** If `showAuth` is true and `user` exists, close the modal and optionally show a toast ("You're already signed in") — but do not redirect unless the user explicitly signed in this session.
5. **Loading states:** Keep `authLoading` until session is resolved to avoid UI flashes.

---

## 3. INTEGRATED TEST PLAN

See `docs/INTEGRATED_TEST_PLAN.md` (created below).
