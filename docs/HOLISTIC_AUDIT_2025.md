# StikmNek — Holistic Architectural Audit

**Date:** March 11, 2025  
**Purpose:** Top-down audit against core business model; integrated resolution plan (no piecemeal patches).

---

## 1. Core Business Model (Target State)

| Actor | Goal | Key Functions |
|-------|------|---------------|
| **Business Owner** | List tours/restaurants, offer discounts, upload 5 photos per listing, provide contact | Submit → Admin approves → Live listing → Edit live listing |
| **Business Owner** | Verify tourist passes | QR code scanner |
| **Admin** | Approve/reject/edit listings, view all photos, moderate per-photo | Pending list, photo moderation, approve/reject |
| **Tourist** | Discover deals, buy pass, use QR, review | Purchase (1/6/Group) → QR → Review (5-star default, 6-star SuperStar for $5) |
| **Tourist (post-expiry)** | View-only or removed | After pass expires: no discounts, no QR; optionally delete or view-only |
| **System** | Connectivity, emails | SendGrid, all flows wired end-to-end |
| **Simplicity** | Minimal complexity | Deprioritize/remove savings tracking, complex social elements |

---

## 2. Database & Migrations Audit

### 2.1 Migration Order (19 migrations)

| # | Migration | Purpose |
|---|-----------|---------|
| 1 | 20250311000000 | `passes`: max_people, share_bonus_applied |
| 2 | 20250311120000 | SuperStar reviews (rating 1–6, superstar_credits, RPCs) |
| 3 | 20250311140000 | pending_businesses: whatsapp_number |
| 4 | 20250311150000 | pending_businesses INSERT RLS fix |
| 5 | 20250311160000 | insert_pending_business RPC |
| 6 | 20250311170000 | Consolidate pending_businesses (GRANTs, RLS, RPC) |
| 7 | 20250311180000 | get_pending_businesses_for_admin RPC |
| 8 | 20250311190000 | review_pending_business RPC (initial; schema issues) |
| 9 | 20250311200000 | get_pending_edits_for_admin RPC |
| 10 | 20250311210000 | get_all_users_for_admin RPC |
| 11 | 20250311220000 | business_photos public read |
| 12 | 20250311230000 | businesses: deal_price, discount, image, hours |
| 13 | 20250311240000 | Storage policies business-photos |
| 14 | 20250311250000 | review_pending_business FIX: owner_id, canonical schema |
| 15 | 20250311260000 | Backfill businesses.owner_id |
| 16 | 20250311270000 | Rejected resubmit RLS |
| 17 | 20250311280000 | Admin read all business_photos |
| 18 | 20250311290000 | businesses: map_url, website, discount_valid_* |
| 19 | 20250311300000 | pending_businesses: map_url, website, discount_valid_* |

**Critical:** Ensure all 19 migrations are applied in order. Missing 20250311250000/20250311260000 causes "No businesses yet" after approval.

### 2.2 Key Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **businesses** | Live listings | id, owner_id, image, discount, deal_price, hours, map_url, website, discount_valid_* |
| **pending_businesses** | Submissions | id, owner_id, status (pending/approved/rejected), map_url, website, whatsapp_number |
| **business_photos** | Photos | business_id (pending_businesses.id or businesses.id), status (pending/approved/rejected) |
| **passes** | Tourist passes | user_id, pass_type, active, expires_at, valid_from, valid_until, max_people |
| **redemptions** | Deal redemptions | user_id, business_id, pass_id, saved_amount |
| **user_profiles** | Roles | user_id, role (tourist/business/admin) |

### 2.3 Schema Alignment Status

- **AdminPanel deal_price:** Uses canonical `deal_price` (20250311250000 fix); migration 20250311230000 adds column if missing.
- **pending_businesses:** map_url, website, discount_valid_from/until added by 20250311300000 (avoids resubmit "column does not exist").
- **businesses:** map_url, website, discount_valid_* added by 20250311290000 (avoids approval error).

---

## 3. Edge Functions Audit

### 3.1 Present in Repo

| Function | Actions | Status |
|----------|---------|--------|
| **manage-business** | submit_business, resubmit_pending_business, get_all_owner_data, get_pending, review_business, approve_photo, reject_photo, get_all_photos, admin_*, etc. | ✅ Implemented |
| **upload-photo** | Base64 → Storage → return URL | ✅ Implemented |
| **process-card-payment** | purchase_superstar (works), purchase_pass (returns 501) | ⚠️ purchase_pass stub |
| **send-email** | send_business_decision, health_check | ✅ Implemented (needs SENDGRID_API_KEY) |

### 3.2 Missing (Frontend Expects Them)

| Function | Used By | Impact |
|----------|---------|--------|
| **verify-redemption** | QRScanner | Business owners cannot verify tourist passes |
| **paypal-capture** | PayPalReturnHandler | PayPal flow broken (capture never runs) |
| **extend-pass** | PassCards (share bonus) | Share-to-upgrade bonus fails |
| **create-checkout** | PayPal order creation | PayPal flow incomplete without order creation |

**Note:** README documents `create-checkout`, `paypal-capture`, `payment-webhook`, `verify-redemption`, `extend-pass` but these are **not present** in the `supabase/functions/` directory.

---

## 4. Flow-by-Flow Gap Analysis

### 4.1 Business Listing Lifecycle

| Step | Current | Gap | Fix |
|------|---------|-----|-----|
| Submit | RPC `insert_pending_business` or manage-business `submit_business` | Works | None |
| Photo upload | PhotoUploader: direct storage first, upload-photo fallback | Works (direct storage primary) | Ensure migration 20250311240000 applied |
| Admin sees pending | RPC `get_pending_businesses_for_admin` | Works | None |
| Admin sees all photos | RLS admin read + loadAllPhotos (direct DB then EF) | Works | None |
| Admin approve | RPC `review_pending_business` | Works if migrations 20250311250000, 20250311290000 applied | Ensure migrations |
| Move to businesses | RPC inserts + updates business_photos.business_id | Works | None |
| Owner sees approved | get_all_owner_data (RPC/EF) or direct DB fallback | Works if owner_id set | Ensure 20250311250000, 20250311260000 |
| Owner edit live | pending_edits flow | Implemented | None |
| Rejected → resubmit | resubmit_pending_business | Works if 20250311300000 applied | Ensure migration |

**Blockers:** Migrations not applied → approval doesn't move to businesses; owner_id NULL → dashboard empty.

### 4.2 Admin Photo Moderation

| Capability | Status | Notes |
|------------|--------|-------|
| View all photos | ✅ | Migration 20250311280000 + loadAllPhotos |
| Approve/reject per photo | ✅ | manage-business approve_photo, reject_photo |
| Bulk approve/reject | ✅ | AdminPanel handleBulkPhotoReview |

### 4.3 Tourist Pass Purchase

| Path | Current | Gap |
|------|---------|-----|
| Card | PaymentCheckout → process-card-payment `purchase_pass` | 501 stub; no pass created |
| PayPal | PassCards → (create-checkout missing) → redirect → PayPalReturnHandler → paypal-capture | create-checkout + paypal-capture not in repo |

**Conclusion:** Pass purchase is broken for both card and PayPal unless these Edge Functions are deployed elsewhere (e.g. Supabase project) but not in repo.

### 4.4 QR Verification & Redemption

| Step | Current | Gap |
|------|---------|-----|
| Business scans QR | QRScanner → invoke `verify-redemption` | Edge Function missing |
| Verify + record | N/A | No backend to validate pass + insert redemption |

**Conclusion:** QR verification is fully broken.

### 4.5 Tourist Pass Expiry (NEW REQUIREMENT)

| Requirement | Current | Gap |
|-------------|---------|-----|
| Track expiry | passes.expires_at exists | ✅ |
| Frontend hides expired | loadUserPass filters `expires_at > now` | ✅ |
| Backend set active=false | None | No cron/trigger |
| Post-expiry: delete or view-only | None | No logic |

**Conclusion:** Expired passes remain active in DB; no deletion or view-only logic.

### 4.6 Email Notifications

| Flow | Current | Gap |
|------|---------|-----|
| Admin approve/reject | AdminPanel calls send-email `send_business_decision` | ✅ Wired |
| SendGrid | send-email requires SENDGRID_API_KEY | Returns "not configured" if missing |
| Admin password reset | Supabase Auth (GoTrue) | Fails if email delivery misconfigured |

---

## 5. Unnecessary / Extra Features (Candidates for Removal)

| Feature | Location | Recommendation |
|---------|----------|----------------|
| Savings tracker | SavingsTracker, Dashboard | Deprioritize; keep if simple (redemptions.saved_amount) |
| Community feed | CommunityFeed, social_activity | Remove or hide from nav if not core |
| Referrals | referrals table, CommunityFeed | Deprioritize; not wired to pass purchase |
| Badges | CommunityFeed | Sample data; remove or simplify |
| Search history | search_history | Keep if used for UX; otherwise deprioritize |
| Support tickets | support_tickets, ticket_responses | Deprioritize; not core |
| Pass share bonus | extend-pass, PassCards | Core model; keep but needs extend-pass EF |
| SuperStar (6-star) | Implemented | Keep; core model |

---

## 6. Comprehensive Resolution Plan

### Phase 1: Critical Blockers (Business Listing & Admin)

| # | Action | Owner |
|---|--------|-------|
| 1.1 | **Apply all 19 migrations** in order (supabase db push or SQL Editor) | You |
| 1.2 | **Verify** review_pending_business inserts owner_id and moves business_photos | You |
| 1.3 | **Verify** pending_businesses has map_url, website, discount_valid_* (20250311300000) | You |
| 1.4 | **Deploy** manage-business, upload-photo, send-email Edge Functions | You |
| 1.5 | **Set** SENDGRID_API_KEY in Supabase Edge Function secrets | You |
| 1.6 | **Fix admin password reset** by confirming Supabase Auth email (SMTP/SendGrid) in Supabase Dashboard | You |

### Phase 2: Pass Purchase (Tourist Core)

| # | Action | Owner |
|---|--------|-------|
| 2.1 | **Clarify** current payment path: Card only vs PayPal only vs both | You |
| 2.2a | **If PayPal:** Create and deploy `create-checkout` (create PayPal order) + `paypal-capture` (capture + insert pass) | Dev |
| 2.2b | **If Card:** Implement `purchase_pass` in process-card-payment (create pass record, integrate Stripe/PayPal card) | Dev |
| 2.3 | **Ensure** pass creation sets user_id, pass_type, active=true, expires_at, valid_from, valid_until, max_people | Dev |

### Phase 3: QR Verification (Business Owner Core)

| # | Action | Owner |
|---|--------|-------|
| 3.1 | **Create** `verify-redemption` Edge Function | Dev |
| 3.2 | **Logic:** Decode QR (user_id + pass_id), validate pass active + not expired, insert redemption, return success | Dev |
| 3.3 | **Deploy** verify-redemption | You |

### Phase 4: Pass Expiry (NEW)

| # | Action | Owner |
|---|--------|-------|
| 4.1 | **Option A (view-only):** On login, frontend already hides expired passes (loadUserPass). Add backend job to set passes.active = false where expires_at < now(). | Dev |
| 4.2 | **Option B (delete):** Cron/trigger: delete auth.users + cascade for users whose only pass is expired and no recent activity. Higher risk; prefer view-only first. | Dev |
| 4.3 | **Implement** pg_cron or Supabase scheduled function to run daily: `UPDATE passes SET active = false WHERE expires_at < now()` | Dev |

### Phase 5: Share Bonus (Optional but Documented)

| # | Action | Owner |
|---|--------|-------|
| 5.1 | **Create** `extend-pass` Edge Function | Dev |
| 5.2 | **Logic:** Validate share_proof, increment pass validity (valid_until += bonus days), set share_bonus_applied | Dev |
| 5.3 | **Deploy** extend-pass | You |

### Phase 6: Simplification

| # | Action | Owner |
|---|--------|-------|
| 6.1 | Hide or remove Community feed from nav if not core | Dev |
| 6.2 | Simplify SavingsTracker to simple redemption total only | Dev |
| 6.3 | Remove or stub support tickets if unused | Dev |

---

## 7. Dependency Matrix

```
Migrations (1–19)
    ↓
Admin Approval (review_pending_business) → businesses + owner_id
    ↓
Owner Dashboard (get_all_owner_data) → requires owner_id
    ↓
Photo Moderation → requires admin RLS (20250311280000)

Pass Purchase (create-checkout + paypal-capture OR process-card-payment purchase_pass)
    ↓
passes table
    ↓
QR Verification (verify-redemption) → redemptions

Pass Expiry (cron/trigger) → passes.active = false
```

---

## 8. Verification Checklist

After applying fixes:

- [ ] Admin approves listing → appears in businesses with owner_id
- [ ] Business owner sees approved listing in dashboard
- [ ] Owner can edit live listing
- [ ] Owner can submit new listing with 5 photos
- [ ] Admin sees all photos for a pending listing
- [ ] Admin can approve/reject photos individually
- [ ] Rejected → Edit & Resubmit → success
- [ ] Tourist purchases pass (PayPal or card)
- [ ] Tourist sees QR after purchase
- [ ] Business owner scans QR → verification succeeds
- [ ] After pass expiry, tourist has no active pass (view-only)
- [ ] Owner receives email on approve/reject
- [ ] Admin can reset password (email delivery works)

---

## 9. Summary

| Category | Status | Priority |
|----------|--------|----------|
| Business listing approval | Fixable via migrations | P1 |
| Owner dashboard empty | Same root cause | P1 |
| Photo upload | Working (direct storage) | P2 verify |
| Admin photo moderation | Implemented | P2 verify |
| Pass purchase | Broken (EFs missing / stub) | P1 |
| QR verification | Broken (EF missing) | P1 |
| Pass expiry | Not implemented | P2 |
| Email notifications | Wired; needs SendGrid | P2 |
| Admin password reset | Config (email) | P2 |

**Critical Path:** Apply migrations → Deploy/create payment + verify-redemption Edge Functions → Test end-to-end.
