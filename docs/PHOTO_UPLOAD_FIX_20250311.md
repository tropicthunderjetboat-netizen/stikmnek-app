# Photo Upload Hang — Diagnosis & Fix

## Problem
Photo upload was hanging indefinitely during new business listing submission.

## Root Cause
The frontend called the `upload-photo` Edge Function first. That path can hang when:
- Edge Function cold start is slow
- Large base64 payload (e.g. 2MB image ≈ 2.7MB base64) takes long to upload
- No request timeout — fetch waits indefinitely
- Edge Function not deployed or misconfigured

## Fix Applied

### 1. **Direct Storage First**
PhotoUploader now tries **direct Supabase Storage upload** first. This:
- Uses the user's JWT (already in session)
- RLS policy `Authenticated upload to business-photos` allows `authenticated` role
- Avoids Edge Function entirely — no cold start, no extra hop
- Typically completes in 1–3 seconds

### 2. **Edge Function as Fallback**
If direct storage fails (e.g. RLS not applied, bucket missing), the Edge Function is tried with a **45-second timeout** to avoid indefinite hang.

### 3. **Storage RLS — Verify**
Ensure this policy exists on `storage.objects`:

```sql
-- Authenticated users can upload to business-photos
DROP POLICY IF EXISTS "Authenticated upload to business-photos" ON storage.objects;
CREATE POLICY "Authenticated upload to business-photos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'business-photos');
```

Run migration `20250311240000_storage_business_photos_policies.sql` if not yet applied.

### 4. **Bucket**
- Bucket ID must be `business-photos` (hyphen)
- Bucket must exist and be **public** for display
- Create via Supabase Dashboard → Storage if missing

## Verification
1. Sign in as a business owner
2. New Listing → select 1–2 photos
3. Upload should complete within a few seconds
4. Console: `[filename] Direct storage upload succeeded (Xms)`
