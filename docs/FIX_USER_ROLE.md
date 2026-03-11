# Fix User Role (Tourist → Business)

If you signed up as a Business user but are being shown as a Tourist, your `user_profiles` row has the wrong role. Fix it with the SQL below.

## Immediate fix for tropicthunderjetboat@gmail.com

Run this in **Supabase Dashboard → SQL Editor**:

```sql
-- Update user_profiles to set role = 'business' for this email
UPDATE public.user_profiles
SET role = 'business',
    user_type = 'business',
    updated_at = now()
WHERE email = 'tropicthunderjetboat@gmail.com'
   OR user_id = (SELECT id FROM auth.users WHERE email = 'tropicthunderjetboat@gmail.com');
```

Then **sign out and sign back in** so the app picks up the new role.

## For any other user

Replace the email in the query:

```sql
UPDATE public.user_profiles
SET role = 'business',
    user_type = 'business',
    updated_at = now()
WHERE email = 'your-email@example.com';
```

## Verify

After running the SQL:

1. Sign out of the app
2. Sign back in
3. You should see "My Business" in the nav and be redirected to the Business Dashboard
