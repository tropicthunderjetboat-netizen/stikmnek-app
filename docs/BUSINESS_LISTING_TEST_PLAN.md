# Business Listing Submission & Display — Comprehensive Test Plan

**Purpose:** Validate the complete flow from business listing submission through to display in the Admin Panel and Business Dashboard.

**Prerequisites:**
- [x] SQL migration applied (`whatsapp_number` added to `pending_businesses`)
- [x] `manage-business` Edge Function deployed
- [x] User signed in as **Business** or **Admin**

---

## 1. Pre-Test Checklist

| Item | Status |
|------|--------|
| Run `npm run dev` and confirm app loads | ☐ |
| Sign in with a **Business** account | ☐ |
| Open browser DevTools → Console (for logs) | ☐ |
| Open Supabase Dashboard → Table Editor → `pending_businesses` | ☐ |

---

## 2. Test: List Your Business (BusinessListingForm)

**Entry point:** Home page → scroll to "List Your Business" or click footer link.

### 2.1 Minimal Submission (No Photos, No Discount)

1. Click **List Your Business**
2. Sign in if prompted (Business account)
3. Fill in:
   - **Name:** `Test Café`
   - **Description:** `A cozy café for testing.`
   - Leave discount, photos, WhatsApp optional
4. Click **Submit**

**Expected:**
- [ ] Toast: "Business listing submitted for review!"
- [ ] Success screen with "Listing Submitted!"
- [ ] Console: `[BusinessForm] Edge function submission SUCCESS: <uuid>`
- [ ] Supabase `pending_businesses`: New row with `name = 'Test Café'`, `status = 'pending'`

### 2.2 Full Submission (With Photos, Discount, WhatsApp)

1. Fill in:
   - **Name:** `Full Test Restaurant`
   - **Description:** `A full test listing.`
   - **Original Price:** `5000`
   - **Discount %:** `20`
   - **Deal Price:** (auto-filled) `4000`
   - **Phone:** `+678 5551234`
   - **WhatsApp:** `+678 5551234`
   - **Address:** `Port Vila, Vanuatu`
   - **Hours:** `9am–5pm`
2. Upload at least one photo (if PhotoUploader is available)
3. Click **Submit**

**Expected:**
- [ ] Toast: "Business listing submitted for review!"
- [ ] Success screen
- [ ] Supabase `pending_businesses`: New row with `whatsapp_number`, `discount`, `original_price`, `deal_price`
- [ ] Supabase `business_photos`: New row(s) with `business_id` = pending business id

### 2.3 Validation: Required Fields

1. Submit with **only** Name filled (no description)
2. **Expected:** Error toast, form not submitted

### 2.4 Fallback: Edge Function Unavailable

1. Temporarily rename the Edge Function in Supabase (or disable it) so the call fails
2. Submit a valid listing
3. **Expected:** Fallback to direct insert; toast and success screen still appear
4. Restore Edge Function

---

## 3. Test: Business Dashboard Submit (BusinessOwnerDashboard)

**Entry point:** Nav → **My Business** → **Submit** tab (or "Create Listing" button).

### 3.1 Minimal Submission

1. Go to **My Business**
2. Open **Submit** tab
3. Fill in:
   - **Name:** `Dashboard Test`
   - **Description:** `Submitted from dashboard.`
4. Click **Submit**

**Expected:**
- [ ] Toast: "Business submitted for approval!"
- [ ] Form clears
- [ ] Tab switches to **Submissions**
- [ ] New submission appears in list
- [ ] Supabase `pending_businesses`: New row

### 3.2 Full Submission (With Photos, Discount, WhatsApp)

1. Fill in:
   - **Name:** `Dashboard Full Test`
   - **Description:** `Full test from dashboard.`
   - **Original Price:** `3000`
   - **Discount %:** `15`
   - **Deal Price:** (auto-filled) `2550`
   - **Phone:** `+678 5551234`
   - **WhatsApp:** `+678 5551234`
   - **Location:** `Port Vila, Vanuatu`
   - **Hours:** `8am–6pm`
2. Upload at least one photo
3. Click **Submit**

**Expected:**
- [ ] Toast: "Business submitted for approval!"
- [ ] Form clears
- [ ] Tab switches to **Submissions**
- [ ] New submission visible with correct data
- [ ] Supabase `pending_businesses`: New row with `whatsapp_number`
- [ ] Supabase `business_photos`: New row(s)

### 3.3 Fallback: Edge Function Unavailable

1. Temporarily disable Edge Function
2. Submit a valid listing from dashboard
3. **Expected:** Fallback to direct insert; toast and success screen still appear
4. Restore Edge Function

---

## 4. Test: Business Dashboard Display

### 4.1 Submissions Tab

1. After submitting a listing, ensure **Submissions** tab shows it
2. **Expected:**
   - [ ] Count: "1 pending" (or more)
   - [ ] Listing card shows name, category, status
   - [ ] Status badge: "Pending"

### 4.2 Overview Tab

1. Switch to **Overview** tab
2. **Expected:**
   - [ ] Pending submissions count visible
   - [ ] "Create Listing" or similar CTA if no approved businesses

### 4.3 Realtime

1. Open **Admin Panel** in another tab or browser
2. Approve a pending submission
3. **Expected:** Business Dashboard updates (toast or refresh) without manual reload

---

## 5. Test: Admin Panel

**Entry point:** Sign in as Admin → Nav → **Admin Panel**.

### 5.1 Pending Submissions List

1. Go to **Admin Panel**
2. Open **Pending Submissions** (or equivalent)
3. **Expected:**
   - [ ] List of pending businesses with `status = 'pending'`
   - [ ] Count matches Supabase `pending_businesses` where `status = 'pending'`

### 5.2 Approve Business

1. Select a pending submission
2. Approve it (with optional admin notes)
3. **Expected:**
   - [ ] Toast: "Business approved successfully!"
   - [ ] Supabase `pending_businesses`: Row `status` updated to `approved`
   - [ ] Supabase `businesses`: New row created with same data
   - [ ] Supabase `business_photos`: `business_id` updated to new `businesses.id` (if applicable)

### 5.3 Reject Business

1. Select a pending submission
2. Reject it (with optional admin notes)
3. **Expected:**
   - [ ] Toast: "Business rejected"
   - [ ] Supabase `pending_businesses`: Row `status` updated to `rejected`
   - [ ] No new row in `businesses`

### 5.4 Business Dashboard After Approval

1. As Business user, go to **My Business**
2. **Expected:**
   - [ ] Approved business appears in **Overview** or approved list
   - [ ] Pending count reduced

---

## 6. Test: Data Integrity

### 6.1 WhatsApp Number

1. Submit a listing with WhatsApp: `+678 5551234`
2. Check Supabase `pending_businesses`
3. **Expected:** `whatsapp_number = '+678 5551234'`

### 6.2 Approve and Verify

1. Approve a pending business that had WhatsApp
2. Check Supabase `businesses`
3. **Expected:** `whatsapp_number` copied to new businesses row

### 6.3 Photos

1. Submit with 2 photos
2. Check Supabase `business_photos`
3. **Expected:** 2 rows with `business_id` = pending id, `status = 'pending'`
4. Approve the business
5. **Expected:** Same 2 rows now have `business_id` = new businesses id

---

## 7. Test: Error Handling

### 7.1 Unauthenticated

1. Sign out
2. Try to submit from **List Your Business**
3. **Expected:** Auth modal or redirect to sign in

### 7.2 Invalid Data

1. Submit with discount % = 100 or > 100
2. **Expected:** Validation error, no submit

### 7.3 Network

1. Simulate offline (DevTools → Network → Offline)
2. Submit
3. **Expected:** Error toast, form not cleared

---

## 8. Summary Checklist

| Flow | Status |
|------|--------|
| List Your Business → minimal submit | ☐ |
| List Your Business → full submit (photos, discount, WhatsApp) | ☐ |
| Business Dashboard → minimal submit | ☐ |
| Business Dashboard → full submit | ☐ |
| Submissions tab displays correctly | ☐ |
| Admin Panel displays pending | ☐ |
| Admin approve → businesses row created | ☐ |
| Admin reject → status updated | ☐ |
| WhatsApp persisted | ☐ |
| Photos persisted and linked | ☐ |
| Fallback works when Edge Function fails | ☐ |

---

## 9. Troubleshooting

| Issue | Check |
|-------|-------|
| "column whatsapp_number does not exist" | Run migration `20250311140000_add_whatsapp_to_pending_businesses.sql` |
| Edge function returns 401 | Ensure user is signed in; `Authorization` header must include Bearer token |
| Edge function returns 500 | Check Supabase Edge Function logs for errors |
| Direct insert fails | Verify RLS: `pending_businesses_insert_auth` allows authenticated inserts |
| Submissions not showing | Check `loadAllOwnerData` / `get_all_owner_data`; verify `owner_id` matches |
