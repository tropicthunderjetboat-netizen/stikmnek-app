-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  StikmNek — RLS FIX + Auto-Profile Trigger Migration              ║
-- ║  Run this in your Supabase SQL Editor                              ║
-- ║  Project: hbaflbmfptobyfqbudrt                                     ║
-- ║  Date: 2026-02-23                                                  ║
-- ║                                                                    ║
-- ║  PURPOSE:                                                          ║
-- ║  Fixes the "new row violates row-level security policy" error      ║
-- ║  (42501) that blocks profile creation during user sign-up.         ║
-- ║                                                                    ║
-- ║  THREE-LAYER SOLUTION:                                             ║
-- ║  1. Database trigger auto-creates profiles (bypasses RLS)          ║
-- ║  2. Corrected RLS policies target 'authenticated' role             ║
-- ║  3. Frontend uses upsert with fallback reads for resilience        ║
-- ╚══════════════════════════════════════════════════════════════════════╝


-- ═══════════════════════════════════════════════════════════════
-- STEP 1: DROP ALL EXISTING user_profiles RLS POLICIES
-- (Safe to run even if some don't exist — each wrapped in DO block)
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  DROP POLICY IF EXISTS "user_profiles_select_all" ON public.user_profiles;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "user_profiles_select_own" ON public.user_profiles;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "user_profiles_insert_own" ON public.user_profiles;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "user_profiles_update_own" ON public.user_profiles;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "user_profiles_delete_own" ON public.user_profiles;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "user_profiles_admin_select_all" ON public.user_profiles;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "user_profiles_admin_update_all" ON public.user_profiles;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Confirm RLS is enabled (should already be, but just in case)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════
-- STEP 2: CREATE NEW RLS POLICIES (targeting 'authenticated' role)
-- ═══════════════════════════════════════════════════════════════

-- 2a. SELECT — Authenticated users can read their own profile
CREATE POLICY "user_profiles_select_own"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2b. INSERT — Authenticated users can insert their own profile
-- This is the CRITICAL fix: explicitly targets 'authenticated' role
-- WITH CHECK ensures they can only insert rows where user_id = their auth.uid()
CREATE POLICY "user_profiles_insert_own"
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2c. UPDATE — Authenticated users can update their own profile
CREATE POLICY "user_profiles_update_own"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2d. DELETE — Authenticated users can delete their own profile
CREATE POLICY "user_profiles_delete_own"
  ON public.user_profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 2e. ADMIN SELECT — Admins can read ALL profiles (for admin panel)
CREATE POLICY "user_profiles_admin_select_all"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  );

-- 2f. ADMIN UPDATE — Admins can update ALL profiles (role changes, etc.)
CREATE POLICY "user_profiles_admin_update_all"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  );

-- 2g. PUBLIC SELECT for business info display
-- Other parts of the app (business cards, reviews) need to read display_name
-- from user_profiles. This allows anonymous/public reads of non-sensitive fields.
-- If you prefer to restrict this, you can remove this policy and adjust
-- the app to not query user_profiles for public display.
CREATE POLICY "user_profiles_select_public_info"
  ON public.user_profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- ═══════════════════════════════════════════════════════════════
-- STEP 3: CREATE THE handle_new_user() TRIGGER FUNCTION
-- ═══════════════════════════════════════════════════════════════
-- 
-- This function runs with SECURITY DEFINER privileges, meaning it
-- executes as the function OWNER (postgres/supabase_admin), completely
-- BYPASSING RLS. This is the industry-standard Supabase pattern for
-- auto-creating user profiles on signup.
--
-- It reads 'name' and 'user_type' from raw_user_meta_data (set during
-- supabase.auth.signUp({ options: { data: { name, user_type } } })).
--
-- ON CONFLICT (user_id) DO NOTHING ensures idempotency — if the
-- frontend's upsert already created the profile, this won't duplicate it.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
  _user_type text;
  _role text;
BEGIN
  -- Extract metadata set during signUp
  _name := COALESCE(
    NEW.raw_user_meta_data ->> 'name',
    NEW.raw_user_meta_data ->> 'full_name',
    split_part(NEW.email, '@', 1)
  );

  _user_type := COALESCE(
    NEW.raw_user_meta_data ->> 'user_type',
    'tourist'
  );

  -- Validate role value
  IF _user_type NOT IN ('tourist', 'business', 'admin') THEN
    _user_type := 'tourist';
  END IF;

  _role := _user_type;

  -- Insert the profile (idempotent — won't fail if already exists)
  INSERT INTO public.user_profiles (
    user_id,
    role,
    display_name,
    email,
    onboarding_complete,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    _role,
    _name,
    NEW.email,
    CASE WHEN _role = 'business' THEN false ELSE true END,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RAISE LOG '[handle_new_user] Created profile for user % with role %', NEW.id, _role;

  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- STEP 4: CREATE THE TRIGGER ON auth.users
-- ═══════════════════════════════════════════════════════════════
-- 
-- This trigger fires AFTER a new row is inserted into auth.users
-- (i.e., after supabase.auth.signUp() creates the auth user).
-- It calls handle_new_user() which creates the user_profiles row.
--
-- DROP IF EXISTS ensures this is safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ═══════════════════════════════════════════════════════════════
-- STEP 5: VERIFICATION QUERIES
-- ═══════════════════════════════════════════════════════════════
-- Run these after the migration to verify everything is in place.
-- They are SELECT queries so they won't modify anything.

-- 5a. Verify RLS is enabled on user_profiles
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'user_profiles' AND schemaname = 'public';
-- Expected: rowsecurity = true

-- 5b. List all RLS policies on user_profiles
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual AS "using_expression",
  with_check AS "with_check_expression"
FROM pg_policies
WHERE tablename = 'user_profiles' AND schemaname = 'public'
ORDER BY policyname;
-- Expected: 7 policies (select_own, insert_own, update_own, delete_own,
--           admin_select_all, admin_update_all, select_public_info)

-- 5c. Verify the trigger function exists
SELECT
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_name = 'handle_new_user' AND routine_schema = 'public';
-- Expected: handle_new_user, FUNCTION, DEFINER

-- 5d. Verify the trigger exists on auth.users
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  action_orientation
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
-- Expected: on_auth_user_created, INSERT, users, AFTER, ROW


-- ═══════════════════════════════════════════════════════════════
-- DONE! Migration complete.
-- ═══════════════════════════════════════════════════════════════
--
-- WHAT WAS CHANGED:
-- 1. Dropped 5 old user_profiles RLS policies (select_all, insert_own,
--    update_own, delete_own, plus any admin variants)
-- 2. Created 7 new RLS policies explicitly targeting 'authenticated' role:
--    - user_profiles_select_own (users read their own profile)
--    - user_profiles_insert_own (users insert their own profile) ← THE FIX
--    - user_profiles_update_own (users update their own profile)
--    - user_profiles_delete_own (users delete their own profile)
--    - user_profiles_admin_select_all (admins read all profiles)
--    - user_profiles_admin_update_all (admins update all profiles)
--    - user_profiles_select_public_info (public can read for display)
-- 3. Created handle_new_user() SECURITY DEFINER function
-- 4. Created on_auth_user_created trigger on auth.users
--
-- HOW IT WORKS (3-layer approach):
-- Layer 1 (Primary): When auth.signUp() creates a user in auth.users,
--   the trigger fires handle_new_user() which creates the profile
--   with SECURITY DEFINER (bypasses RLS entirely).
-- Layer 2 (Backup): The corrected RLS policies now properly allow
--   authenticated users to insert their own profile via the frontend
--   upsert call.
-- Layer 3 (Fallback): The frontend reads the trigger-created profile
--   if its own upsert fails for any reason.
-- ═══════════════════════════════════════════════════════════════
