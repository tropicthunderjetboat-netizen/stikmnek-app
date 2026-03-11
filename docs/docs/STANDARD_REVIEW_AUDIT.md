# Standard 1–5 Star Review Audit Report

**Date:** 2025-03-11  
**Goal:** Ensure standard 1–5 star reviews and purchased 6-star Superstar reviews work seamlessly.

---

## 1. Standard 1–5 Star Submission Flow

### ReviewForm.tsx & AppContext.tsx

| Check | Status | Details |
|-------|--------|---------|
| **Rating (1–5) received and saved** | ✅ | `handleSubmit` uses `effectiveRating = Math.min(rating, 5)` and passes to `submitReview`. For standard reviews (rating 1–5), `Math.min(rating, 5) === rating`. |
| **Comment text captured and submitted** | ✅ | `comment` state is bound to textarea, validated (min 10 chars), and passed as `comment.trim()` to `submitReview`. |
| **user_id and business_id associated** | ✅ | `submitReview` inserts `business_id`, `user_id: user.id`, `user_name: user.name`, `rating`, `comment`. |

### Flow Summary

- User selects 1–5 stars → `setRating(starValue)` (line 278)
- User types comment → `setComment(e.target.value)` (line 385)
- Submit → `validate()` checks rating ≠ 0 and comment ≥ 10 chars
- `submitReview(businessId, effectiveRating, comment.trim())` → direct Supabase insert

---

## 2. Database RLS for Standard Reviews

### reviews_insert_auth Policy

```sql
CREATE POLICY "reviews_insert_auth"
  ON public.reviews FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
```

- **Status:** ✅ Allows authenticated users to INSERT
- **No rating restriction** in RLS; only auth check
- **Standard reviews (rating 1–5)** are allowed

### Table Constraint

```sql
rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5)
```

- **Status:** ⚠️ **Blocks rating 6** — Superstar reviews would fail at insert
- **Standard reviews (1–5):** ✅ Allowed

---

## 3. UI for Standard Reviews

| Check | Status | Details |
|-------|--------|---------|
| **1–5 star selection** | ✅ | Buttons 1–5 map to `setRating(starValue)`; `wantsSuperStar` reset on standard star click |
| **Comment text area** | ✅ | Always visible, min 10 chars, max 1000, with character count |

---

## 4. Regression Risk from Superstar Fix

### Planned Superstar Changes

1. **ReviewForm.tsx:** Remove `Math.min(rating, 5)` — use `rating` directly so 6 can be submitted when Superstar is purchased.
2. **AppContext.tsx:** Add `has_super_star: rating === 6` to insert and to optimistic `newReview`.
3. **Database:** Relax CHECK to allow `rating` 1–6.

### Impact on Standard Reviews

| Scenario | Before Fix | After Fix |
|----------|------------|-----------|
| User selects 3 stars, submits | `effectiveRating = 3` → insert rating 3 | `rating = 3` → insert rating 3 |
| `has_super_star` | Not sent (defaults to false) | `rating === 6` → false for 1–5 |
| RLS | Allows | Unchanged |
| DB CHECK | Allows 1–5 | Will allow 1–6 (1–5 unchanged) |

**Conclusion:** No regression for standard 1–5 reviews. `has_super_star` will be `false` for ratings 1–5.

---

## 5. Additional Findings

### Realtime Subscription (AppContext.tsx)

The `postgres_changes` handler for `reviews` INSERT does **not** include `has_super_star`:

```javascript
setDbReviews(prev => [{
  id: r.id,
  business_id: r.business_id,
  user_name: r.user_name || 'Anonymous',
  rating: r.rating,
  comment: r.comment,
  created_at: r.created_at,
  // has_super_star missing
}, ...prev]);
```

**Fix:** Add `has_super_star: r.has_super_star || false` so Superstar reviews display correctly in realtime.

### Optimistic Update (submitReview)

The `newReview` object does **not** include `has_super_star`:

```javascript
const newReview: DBReview = {
  id: data?.id || `temp-${Date.now()}`,
  business_id: BusinessId,
  user_name: user.name,
  rating,
  comment,
  created_at: data?.created_at || new Date().toISOString(),
  // has_super_star missing
};
```

**Fix:** Add `has_super_star: rating === 6` so the UI shows the Superstar badge immediately after submit.

---

## 6. Summary

| Area | Standard 1–5 | Superstar 6 | Action |
|------|--------------|-------------|--------|
| ReviewForm submit | ✅ Works | ❌ Capped at 5 | Remove `Math.min`, pass `rating` |
| submitReview insert | ✅ Works | ❌ No `has_super_star` | Add `has_super_star: rating === 6` |
| Optimistic newReview | ✅ Works | ❌ No `has_super_star` | Add `has_super_star: rating === 6` |
| Realtime subscription | ✅ Works | ❌ No `has_super_star` | Add `has_super_star: r.has_super_star \|\| false` |
| DB CHECK | ✅ Allows 1–5 | ❌ Blocks 6 | Migration: allow rating 1–6 |
| RLS | ✅ Allows | ✅ Allows | No change |

**Standard review flow is fully functional.** The Superstar fix can be applied without breaking standard reviews.
