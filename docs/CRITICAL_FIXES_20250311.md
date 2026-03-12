# Critical Fixes — Photo Upload & Admin Schema

**Date:** March 11, 2025

---

## Summary

Two critical regressions were fixed:

1. **Photo Upload Failure** — Added direct storage upload fallback when Edge Function fails; resolved userId loading; added storage policies.
2. **Admin Panel Schema Mismatch** — Added migration to align `businesses` columns; Admin update now supports both schema variants.

---

## 1. Photo Upload Fix

### Root Causes Addressed

- **userId empty during load** — PhotoUploader now resolves user id from session when prop is empty.
- **Edge Function failure** — Added direct `supabase.storage.upload()` fallback when `upload-photo` Edge Function fails.
- **Storage policies** — Migration adds INSERT policy for authenticated users on `business-photos` bucket.

### Code Changes (Already Applied)

- **PhotoUploader.tsx**: Resolves `effectiveUserId` from session; direct storage upload fallback when Edge Function fails.
- **Migration 20250311240000**: Storage policies for `business-photos` bucket.

### Verify Storage Bucket

1. Supabase Dashboard → **Storage**
2. Ensure bucket **`business-photos`** exists (hyphen, not underscore).
3. If missing: create bucket, name = `business-photos`, set to **Public**.

---

## 2. Admin Panel Schema Fix

### Root Cause

The `businesses` table may use `discounted_price`, `deal`, `image_url`, `opening_hours` (from review RPC) while Admin update used `deal_price`, `discount`, `image`, `hours`.

### Migrations to Run

Run these in **Supabase SQL Editor** (in order):

#### A. Schema alignment (adds missing columns)

```sql
-- 20250311230000_businesses_schema_align.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'deal_price') THEN
    ALTER TABLE public.businesses ADD COLUMN deal_price numeric(12,2) DEFAULT 0;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'discounted_price') THEN
      UPDATE public.businesses SET deal_price = COALESCE(discounted_price, 0);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'discount') THEN
    ALTER TABLE public.businesses ADD COLUMN discount text DEFAULT '';
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'deal') THEN
      UPDATE public.businesses SET discount = COALESCE(deal, '');
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'image') THEN
    ALTER TABLE public.businesses ADD COLUMN image text DEFAULT '';
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'image_url') THEN
      UPDATE public.businesses SET image = COALESCE(image_url, '');
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'hours') THEN
    ALTER TABLE public.businesses ADD COLUMN hours text DEFAULT '';
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'opening_hours') THEN
      UPDATE public.businesses SET hours = COALESCE(opening_hours, '');
    END IF;
  END IF;
END $$;
```

#### B. Storage policies

```sql
-- 20250311240000_storage_business_photos_policies.sql
DROP POLICY IF EXISTS "Authenticated upload to business-photos" ON storage.objects;
CREATE POLICY "Authenticated upload to business-photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'business-photos');

DROP POLICY IF EXISTS "Public read business-photos" ON storage.objects;
CREATE POLICY "Public read business-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-photos');
```

---

## Testing Checklist

- [ ] **Photo upload**: Sign in as business → New Listing → upload 2–3 photos → verify they appear and submit succeeds.
- [ ] **Admin edit**: Admin Panel → Businesses → Edit a business → change deal price → Save → verify no schema error.
- [ ] **Browser console**: No errors during photo upload; if Edge Function fails, fallback should log "Direct storage upload succeeded".
