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

## 5. Image Architecture (pending_businesses)

**No schema change needed.** Multiple photos are stored in `business_photos`, not in `pending_businesses` columns:
- `pending_businesses.image` = main cover image URL (single column)
- `business_photos` = all photos (5+), linked by `business_id` = `pending_businesses.id` for new submissions

When a listing is submitted, photos are inserted into `business_photos` with `business_id` = the new pending record's id.

---

## 6. Rejected Submission → Edit & Resubmit

**Flow:** Admin rejects → owner sees "Edit & Resubmit" → edits form pre-filled with rejected data + admin notes → resubmits → status back to `pending` → admin approves → moves to `businesses`.

- **Migration `20250311270000_rejected_resubmit_flow.sql`:** RLS allows owners to update their own rejected submissions
- **Edge Function:** `resubmit_pending_business` action updates record and sets status = 'pending'
- **UI:** MySubmissions "Edit & Resubmit" passes submission to submit tab; form pre-fills; admin notes shown

**Resubmit non-2xx error surfacing:**
- `invokeWithRetry` now preserves the response body on non-2xx so the toast shows the actual error from the Edge Function (e.g. `Resubmit failed: column "map_url" does not exist`) instead of the generic "Edge Function returned a non-2xx status code".
- If you see schema-related errors, run migration `20250311300000_pending_businesses_add_map_url_and_extras.sql`.

**Note:** `pending_edits` remains for edits to **approved** businesses only (owner requests changes to live listing).

---

## Migrations to Apply

Run these in order:

1. `20250311230000_businesses_schema_align.sql` — adds deal_price, discount, image, hours if missing
2. `20250311250000_review_pending_business_fix_owner_and_schema.sql` — fixes RPC
3. `20250311260000_backfill_businesses_owner_id.sql` — backfills owner_id for existing approved businesses
4. `20250311270000_rejected_resubmit_flow.sql` — allows owners to edit and resubmit rejected listings
5. `20250311280000_admin_read_business_photos.sql` — admins can read ALL business_photos (including pending) for multi-photo display and moderation
6. `20250311290000_businesses_add_map_url_and_extras.sql` — add map_url, website, discount_valid_from, discount_valid_until to businesses if missing (fixes approval error)
7. `20250311300000_pending_businesses_add_map_url_and_extras.sql` — same columns on pending_businesses (fixes resubmit "column does not exist" errors)

---

## 7. Multi-Photo Display & Admin Moderation

### Problem
- Only one photo displayed in Admin approval area (was fallback `biz.image` when `businessPhotos[biz.id]` was empty)
- Admin couldn't view or moderate individual photos

### Fix
- **Migration `20250311280000_admin_read_business_photos.sql`:** RLS policy so admins can read all rows in `business_photos` (including `status = 'pending'`)
- **AdminPanel `loadAllPhotos`:** Use direct DB query first (relies on admin RLS), then Edge Function as fallback
- **Edge Function:** `get_all_photos`, `approve_photo`, `reject_photo` now verify caller is admin
- **UI:** Already displays all photos with individual Approve/Reject buttons; bulk Approve All / Reject All when pending photos exist

---

## 8. map_url Column Missing on Approval

### Problem
- Error: `Failed to process review: column "map_url" of relation "businesses" does not exist`
- Admin approval blocked; `review_pending_business` RPC inserts map_url, website, discount_valid_from, discount_valid_until

### Fix
- **Migration `20250311290000_businesses_add_map_url_and_extras.sql`:** Add map_url, website, discount_valid_from, discount_valid_until to `public.businesses` if missing

---

## Verification

1. **Admin approval:** Approve a pending business → verify it appears in `businesses` with `owner_id` set
2. **Business Hub:** Log in as owner → verify approved businesses appear in dropdown and sidebar
3. **Edit Listing:** Select approved business → verify edit form loads and saves
4. **Photos:** Verify gallery shows all approved photos on business detail page
5. **Admin:** Edit a business → verify no "deal_price column not found" error

---

## Pass confirmation email (receipt)

### Problem
- Receipt page showed "an email has been sent" but no confirmation email was received (inbox or spam).
- **Root cause:** The PaymentConfirmation page calls `send-email` with action `send_pass_confirmation`, but that action was not implemented in the Edge Function (returned "Unknown action").

### Fix
- **`send-email` Edge Function:** Implemented `send_pass_confirmation` action. It reads `user_email`, `receipt_number`, `pass_type`, `amount`, `valid_from`, `valid_until`, etc. from the request, builds an HTML receipt, and sends via SendGrid.
- **From address:** Default `SENDGRID_FROM_EMAIL` is `no-reply@stikmnek.com` (must be a verified sender in SendGrid; use the same as Supabase Auth SMTP for consistency).
- **Secrets:** In Supabase → Project Settings → Edge Functions → Secrets, set:
  - `SENDGRID_API_KEY` (required)
  - `SENDGRID_FROM_EMAIL` (optional, default `no-reply@stikmnek.com`)
  - `SENDGRID_FROM_NAME` (optional, default `StikmNek`)
- **PaymentConfirmation.tsx:** On send failure, the UI now shows a toast with the error (e.g. "Email not configured" or SendGrid error) so you can fix config.

### Verification
1. Redeploy the `send-email` Edge Function after the code change.
2. Purchase a pass (card or PayPal), land on the receipt page → confirmation email should be sent automatically.
3. If it fails, check Supabase Edge Function logs for `send-email` and SendGrid Activity for delivery status.
