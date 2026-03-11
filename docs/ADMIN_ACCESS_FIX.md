# Admin Access Fix — Temporary Access & Password Reset Diagnosis

**Date:** 2025-03-11

---

## 1. Temporary Admin Access (Immediate Workaround)

### Step 1: Create a New User in Supabase Auth

1. Open **Supabase Dashboard** → **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Fill in:
   - **Email:** `testadmin@example.com`
   - **Password:** `TempAdmin123!` (or another strong password you choose)
4. Leave **Auto Confirm User** checked (so no email verification is needed)
5. Click **Create user**

### Step 2: Promote the User to Admin in `user_profiles`

The `handle_new_user` trigger creates a `user_profiles` row with default role `tourist`. You must update it to `admin`.

**Option A: Via Supabase SQL Editor**

1. Go to **SQL Editor** → **New query**
2. Run:

```sql
-- Promote testadmin@example.com to admin
UPDATE public.user_profiles
SET role = 'admin', user_type = 'admin', updated_at = now()
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'testadmin@example.com');

-- Verify (should return 1 row with role = 'admin')
SELECT up.user_id, up.email, up.role, up.user_type
FROM public.user_profiles up
JOIN auth.users u ON u.id = up.user_id
WHERE u.email = 'testadmin@example.com';
```

**Option B: Via Table Editor**

1. Go to **Table Editor** → **user_profiles**
2. Find the row where `user_id` matches the new user (or join with `auth.users` to find by email)
3. Edit the row: set `role` = `admin`, `user_type` = `admin`

### Step 3: Sign In and Verify

1. In your app, sign out (if logged in)
2. Sign in with `testadmin@example.com` and the password you set
3. You should be redirected to the **Admin Panel**
4. Test admin features (pending submissions, user management, etc.)

---

## 2. Diagnose `admin@stikmnek.com` Password Reset Failure

### 2.1 Supabase Auth Logs

1. **Supabase Dashboard** → **Logs** → **Auth**
2. Trigger a "Forgot Password" for `admin@stikmnek.com`
3. In the app: Sign In → Forgot Password? → enter `admin@stikmnek.com` → Send Reset Link
4. Check Auth logs for:
   - `recovery_requested` or similar event
   - Any error messages (e.g. rate limit, invalid email, SMTP failure)
   - Whether Supabase attempted to send the email

### 2.2 Supabase Email Settings

1. **Supabase Dashboard** → **Authentication** → **Email Templates**
2. Open **Reset Password**
3. Verify:
   - `{{ .ConfirmationURL }}` is present (this is the reset link)
   - Redirect URL is correct (e.g. `{{ .SiteURL }}/` or your app URL)

4. **Authentication** → **URL Configuration**
   - **Site URL:** Your app URL (e.g. `https://your-app.vercel.app`)
   - **Redirect URLs:** Include your app URL and any auth callback paths

### 2.3 Custom SMTP (SendGrid) Configuration

If you use **SendGrid** or custom SMTP:

1. **Supabase Dashboard** → **Project Settings** → **Auth** → **SMTP Settings**
2. Check:
   - SMTP is enabled
   - Host, port, user, password are correct
   - Sender email is verified in SendGrid

3. **SendGrid Dashboard** → **Activity** → **Email Activity**
   - Filter by recipient: `admin@stikmnek.com` or `stikmnek@gmail.com`
   - Check for: Delivered, Bounced, Deferred, Dropped
   - If no events: Supabase may not be sending to SendGrid, or the recipient is different

### 2.4 Admin User Data Check

Run in **SQL Editor**:

```sql
-- Check if admin@stikmnek.com exists and its email
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE email = 'admin@stikmnek.com';

-- Check user_profiles for this user
SELECT up.*
FROM public.user_profiles up
JOIN auth.users u ON u.id = up.user_id
WHERE u.email = 'admin@stikmnek.com';
```

Confirm:
- The user exists in `auth.users`
- `email` is exactly `admin@stikmnek.com` (no typos, no extra spaces)
- If you expect emails at `stikmnek@gmail.com`, Supabase sends to the `email` in `auth.users` — so it would send to `admin@stikmnek.com` unless that address forwards to Gmail

### 2.5 Common Causes & Fixes

| Cause | Fix |
|-------|-----|
| **Email goes to admin@stikmnek.com, not Gmail** | Add a mail forward from `admin@stikmnek.com` → `stikmnek@gmail.com`, or change the user's email in `auth.users` (see below) |
| **Supabase default SMTP rate limits** | Use custom SMTP (SendGrid) in Project Settings → Auth → SMTP |
| **Reset link in spam** | Check spam/junk for `admin@stikmnek.com` and for your SendGrid sender |
| **Wrong redirect URL** | Update Site URL and Redirect URLs in Auth → URL Configuration |
| **Email not confirmed** | For password reset, Supabase typically still sends; confirm the user exists and is not disabled |

### 2.6 Change Admin Email to Gmail (If Needed)

If `admin@stikmnek.com` does not receive mail and you want reset emails at `stikmnek@gmail.com`:

```sql
-- WARNING: This changes the login email. You will sign in with the new email.
UPDATE auth.users
SET email = 'stikmnek@gmail.com', raw_user_meta_data = raw_user_meta_data || '{"email":"stikmnek@gmail.com"}'::jsonb
WHERE email = 'admin@stikmnek.com';

-- Update user_profiles to match
UPDATE public.user_profiles
SET email = 'stikmnek@gmail.com', updated_at = now()
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'stikmnek@gmail.com');
```

**Note:** You must also add `stikmnek@gmail.com` to `ADMIN_EMAILS` in `src/contexts/AppContext.tsx` (line 14), or the app will not treat this user as admin. Alternatively, keep `admin@stikmnek.com` in `ADMIN_EMAILS` and ensure that address can receive mail.

---

## 3. Admin Role Recognition

The app already resolves admin correctly:

1. **ADMIN_EMAILS** (`AppContext.tsx` line 14): `admin@stikmnek.com` → always treated as admin
2. **user_profiles.role = 'admin'**: Any user with `role = 'admin'` in the DB is also treated as admin (e.g. `testadmin@example.com` after the SQL update)
3. **redirectForRole**: Admin users are redirected to `setCurrentView('admin')` (Admin Panel)

**resolveRole flow:**
- If `email` is in `ADMIN_EMAILS` → admin
- Else if `user_profiles` has `role = 'admin'` or `user_type = 'admin'` → admin
- Else → tourist or business from profile

No code changes are needed for admin recognition. The temporary `testadmin@example.com` user will work once `user_profiles` is updated.

---

## 4. Quick Reference: Temporary Admin Setup

```sql
-- 1. Create user via Supabase Dashboard (Auth → Users → Add user)
--    Email: testadmin@example.com, Password: TempAdmin123!

-- 2. Run this to promote to admin:
UPDATE public.user_profiles
SET role = 'admin', user_type = 'admin', updated_at = now()
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'testadmin@example.com');
```

Then sign in with `testadmin@example.com` / `TempAdmin123!` and you should land on the Admin Panel.
