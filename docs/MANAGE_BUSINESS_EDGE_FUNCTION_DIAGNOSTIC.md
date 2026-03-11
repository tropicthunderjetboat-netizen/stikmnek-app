# manage-business Edge Function — Diagnostic Guide

## 1. Edge Function Code Review

### Service Role Client Initialization (Lines 38–52)

```typescript
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Defensive check added
if (!supabaseServiceKey || supabaseServiceKey.length < 50) {
  return errorResponse('Server configuration error: missing service role key', 500);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
```

- The client is created with `SUPABASE_SERVICE_ROLE_KEY`.
- The service role key bypasses RLS for all database operations.
- The `submit_business` insert (lines 92–96) uses this same client.

### submit_business Flow

1. Validates `userId` from body or auth user.
2. Builds record for `pending_businesses`.
3. Inserts via `supabase.from('pending_businesses').insert(record)`.
4. Uses the service_role client, so RLS does not apply.

---

## 2. Why You Might See "approval denied for table"

The error usually comes from the frontend fallback, not from the Edge Function.

### Flow

1. Frontend calls `manage-business` with `submit_business`.
2. If the Edge Function fails (401, 500, network, timeout), the frontend falls back to a direct insert using the user’s Supabase client (anon key + JWT).
3. That direct insert is subject to RLS.
4. If the RLS INSERT policy blocks it, you see "approval denied" / "permission denied".

So the failure is often:

- Edge Function fails → fallback runs → RLS blocks the direct insert.

---

## 3. Deployment & Environment Variables

### Supabase Auto-Injected Variables

Supabase provides these for all Edge Functions:

- `SUPABASE_URL` — project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (bypasses RLS)

You do not need to add them manually in Secrets.

### Deployment Checklist

| Item | Where to Check |
|------|----------------|
| Function name | `manage-business` (must match `functions.invoke('manage-business', ...)`) |
| Entrypoint | `index.ts` in `supabase/functions/manage-business/` |
| Deployed | Supabase Dashboard → Edge Functions → `manage-business` |

### If Deployed via Dashboard

1. Supabase Dashboard → Edge Functions → `manage-business`.
2. Confirm the function exists and is deployed.
3. Check Logs for errors during a submission.

---

## 4. Edge Function Logs

1. Supabase Dashboard → Edge Functions → `manage-business` → Logs.
2. Submit a business listing and watch for:
   - `[manage-business] SUPABASE_SERVICE_ROLE_KEY is missing or invalid` — env/config issue.
   - `[manage-business] submit_business insert error:` — DB error (e.g. schema, constraint).
   - 401 responses — auth/session issue.

---

## 5. RLS Fix (Run This)

The direct insert fallback is blocked by RLS. Run this migration in the Supabase SQL Editor:

```sql
-- Fix pending_businesses INSERT RLS
DROP POLICY IF EXISTS "pending_businesses_insert_auth" ON public.pending_businesses;

CREATE POLICY "pending_businesses_insert_auth"
  ON public.pending_businesses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);
```

Or run the migration file:

`supabase/migrations/20250311150000_fix_pending_businesses_insert_rls.sql`

---

## 6. Quick Tests

### Test 1: Edge Function Health

```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/manage-business" \
  -H "Authorization: Bearer YOUR_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"action":"health"}'
```

Expected: `{"success":true}`

### Test 2: After RLS Fix

1. Run the RLS migration above.
2. Submit a business listing from the app.
3. If the Edge Function fails, the direct insert fallback should now succeed.

---

## 7. Summary

| Component | Status |
|-----------|--------|
| Edge Function uses service_role | Yes — `createClient(url, serviceKey)` |
| submit_business uses service_role client | Yes — same client for insert |
| RLS applies to Edge Function | No — service role bypasses RLS |
| RLS applies to direct insert fallback | Yes — anon key + JWT |
| Fix | Run RLS migration so direct insert is allowed |
