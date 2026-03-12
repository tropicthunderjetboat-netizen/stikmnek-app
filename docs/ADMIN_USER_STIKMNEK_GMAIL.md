# Create stikmnek@gmail.com Admin User

**Date:** March 11, 2025

---

## Overview

The user `stikmnek@gmail.com` does not exist in Supabase `auth.users`. You cannot insert directly into `auth.users` via SQL for security reasons — Supabase manages this table. Use the Dashboard or Admin API.

---

## Step 1: Create the User in Supabase Auth

### Option A: Supabase Dashboard (Recommended)

1. Open **Supabase Dashboard** → **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Fill in:
   - **Email:** `stikmnek@gmail.com`
   - **Password:** Choose a strong password (e.g. `StikmNek2025!Secure`)
4. Check **Auto Confirm User** (so no email verification is needed)
5. Click **Create user**

### Option B: Supabase Auth Admin API (Programmatic)

If you have a script or Edge Function with service role:

```typescript
const { data, error } = await supabase.auth.admin.createUser({
  email: 'stikmnek@gmail.com',
  password: 'YourSecurePassword123!',
  email_confirm: true,
});
```

---

## Step 2: Assign Admin Role in user_profiles

After the user is created, the `handle_new_user` trigger will insert a row in `user_profiles` with default role `tourist`. Update it to `admin`:

### SQL (run in Supabase SQL Editor)

```sql
-- Promote stikmnek@gmail.com to admin
UPDATE public.user_profiles
SET role = 'admin', user_type = 'admin', updated_at = now()
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'stikmnek@gmail.com');

-- Verify (should return 1 row with role = 'admin')
SELECT up.user_id, up.display_name, up.role, up.user_type
FROM public.user_profiles up
JOIN auth.users u ON u.id = up.user_id
WHERE u.email = 'stikmnek@gmail.com';
```

### Alternative: Table Editor

1. Go to **Table Editor** → **user_profiles**
2. Find the row where `user_id` matches the new user (join with `auth.users` to find by email)
3. Edit: set `role` = `admin`, `user_type` = `admin`

---

## Step 3: Add to ADMIN_EMAILS (Already Done)

The app already includes `stikmnek@gmail.com` in `ADMIN_EMAILS` in `src/contexts/AppContext.tsx`. This ensures the user is always treated as admin regardless of DB state.

---

## Step 4: Verify Access

1. Sign out of the app (if logged in)
2. Sign in with `stikmnek@gmail.com` and the password you set
3. You should be redirected to the **Admin Panel**
4. Test admin features: pending businesses, user management, etc.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| User not found in auth.users | Create via Dashboard (Step 1) |
| user_profiles row missing | The trigger may not have run. Insert manually: `INSERT INTO user_profiles (user_id, display_name, role, user_type, email) SELECT id, 'Admin', 'admin', 'admin', email FROM auth.users WHERE email = 'stikmnek@gmail.com' ON CONFLICT (user_id) DO UPDATE SET role = 'admin', user_type = 'admin';` |
| Still not recognized as admin | Ensure `stikmnek@gmail.com` is in `ADMIN_EMAILS` in AppContext.tsx (already added) |
