# Admin: purge non-admin users (SQL fallback)

Use this **only** when in-app deletion fails (Admin → Users → Delete / Danger zone) or when resetting a dev/staging database.

**Preserves:** `admin@stikmnek.com`  
**Removes:** all other users from app tables and `auth.users`

---

## Preferred method (in the app)

1. Open **Admin Dashboard → Users**
2. Delete individuals with **Delete**, or use **Danger zone → Delete All Non-Admin** at the bottom of the page
3. Check the deletion log if anything fails

---

## SQL fallback (Supabase)

### Quick run — full script

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**
2. Open this file in the repo: **`supabase/scripts/admin-purge-non-admin-users.sql`**
3. Copy the entire script, paste into SQL Editor, click **Run**
4. Read the **Messages** tab for `RAISE NOTICE` output (skipped tables, deleted rows)

### Simple version (if the full script fails)

Run these two blocks in order:

```sql
DELETE FROM user_profiles
WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');
```

```sql
DO $$
DECLARE
  admin_id uuid;
  r record;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@stikmnek.com';
  FOR r IN SELECT id, email FROM auth.users WHERE id != admin_id
  LOOP
    BEGIN
      DELETE FROM auth.users WHERE id = r.id;
      RAISE NOTICE 'Deleted: %', r.email;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed %: %', r.email, SQLERRM;
    END;
  END LOOP;
END $$;
```

### Step-by-step (one query at a time)

Run each line in SQL Editor. **Skip** any query that errors, then continue.

1. `DELETE FROM favorites WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
2. `DELETE FROM pass_purchases WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
3. `DELETE FROM passes WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
4. `DELETE FROM redemptions WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
5. `DELETE FROM search_history WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
6. `DELETE FROM support_tickets WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
7. `DELETE FROM notifications WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
8. `DELETE FROM feedback WHERE user_id IS NOT NULL AND user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
9. `DELETE FROM error_logs WHERE user_id IS NOT NULL AND user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
10. `DELETE FROM reviews WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
11. `DELETE FROM review_responses WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
12. `DELETE FROM pending_businesses WHERE owner_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
13. `DELETE FROM pending_edits WHERE owner_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
14. `DELETE FROM user_profiles WHERE user_id != (SELECT id FROM auth.users WHERE email = 'admin@stikmnek.com');`
15. Auth users loop (same as simple version step 2 above)

---

## Last resort — Supabase UI

**Authentication → Users** → ⋮ next to each user → **Delete user**

Slow but always works if SQL is blocked.

---

## Repo paths

| File | Purpose |
|------|---------|
| `supabase/scripts/admin-purge-non-admin-users.sql` | One-shot fault-tolerant script |
| `docs/ADMIN_USER_PURGE_SQL.md` | This guide |
