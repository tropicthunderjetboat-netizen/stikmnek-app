# Critical Business Hub Fixes

## Summary

This document describes the fixes applied to resolve core business lifecycle issues: Admin approval flow, Business Owner Dashboard display, photo management, and schema alignment.

---

## 1. Admin Approval Flow (CRITICAL)

### Problem
- Approved businesses stayed in `pending_businesses`; `businesses` table remained empty or had wrong data
- Inserted businesses had **no `owner_id`**, so `get_owner_businesses` / `get_all_owner_data` returned nothing
- RPC used wrong column names (`image_url`, `deal`, `discounted_price`, `opening_hours`) instead of canonical schema (`image`, `discount`, `deal_price`, `hours`)

### Fix
- **Migration `20250311250000_review_pending_business_fix_owner_and_schema.sql`**
  - Updates `review_pending_business` RPC to:
    - Include `owner_id` from `v_pending.owner_id` in the INSERT
    - Use canonical schema: `image`, `discount`, `deal_price`, `hours`, `tags`
- **Migration `20250311260000_backfill_businesses_owner_id.sql`**
  - Backfills `owner_id` for businesses approved before the fix (matches by name, category, approval time)
- **Edge Function `manage-business`**
  - Photo update now sets `status = 'approved'` when approving (was already correct for owner_id)

---

## 2. Business Owner Dashboard

### Problem
- "You haven't submitted any business listings yet" and "No businesses yet" shown even when owner had approved listings
- Select Business dropdown empty
- Edit Listing tab showed pending-only notice

### Fix
- **Root cause:** Approved businesses had `owner_id = NULL`, so `get_all_owner_data` returned empty approved list
- **Fix 1:** RPC now inserts `owner_id` (see above)
- **Fix 2:** Direct Supabase fallback in `loadAllOwnerData` — when Edge Function fails, fetches directly from `businesses` and `pending_businesses` by `owner_id`
- Fallback uses both schema variants (`image`/`image_url`, `discount`/`deal`, etc.) for compatibility

---

## 3. Photo Gallery & Admin Moderation

### Status
- **PhotoDisplay:** `PhotoGallery` uses `getPhotoDisplayUrl()`, filters by `status = 'approved'`, RLS allows public read
- **Admin Approval:** When admin approves a business, RPC now updates `business_photos` with `business_id = new_biz_id` and `status = 'approved'`
- **Admin Photo Moderation:** Already implemented — approve/reject via `manage-business` (`approve_photo` / `reject_photo`)

---

## 4. Schema & Regressions

### Admin Panel `deal_price` Error
- **Fix:** Admin update now uses only canonical columns (`image`, `discount`, `deal_price`, `hours`) — removed `deal`, `discounted_price`, `image_url`, `opening_hours` to avoid "column not found"

### Photo Upload
- PhotoUploader already has fallback to direct `supabase.storage.upload()` when Edge Function fails
- Storage policies in `20250311240000` allow authenticated upload

---

## Migrations to Apply

Run these in order:

1. `20250311230000_businesses_schema_align.sql` — adds deal_price, discount, image, hours if missing
2. `20250311250000_review_pending_business_fix_owner_and_schema.sql` — fixes RPC
3. `20250311260000_backfill_businesses_owner_id.sql` — backfills owner_id for existing approved businesses

---

## Verification

1. **Admin approval:** Approve a pending business → verify it appears in `businesses` with `owner_id` set
2. **Business Hub:** Log in as owner → verify approved businesses appear in dropdown and sidebar
3. **Edit Listing:** Select approved business → verify edit form loads and saves
4. **Photos:** Verify gallery shows all approved photos on business detail page
5. **Admin:** Edit a business → verify no "deal_price column not found" error
