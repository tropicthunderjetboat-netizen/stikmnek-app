-- ═══════════════════════════════════════════════════════════════
-- Fix pending_businesses INSERT RLS Policy
-- Fixes: "approval denied for table" / "permission denied" on insert
--
-- The policy auth.role() = 'authenticated' can fail in some Supabase
-- configurations. We replace it with auth.uid() = owner_id which:
-- 1. Ensures the user is authenticated (auth.uid() IS NOT NULL)
-- 2. Ensures they can only insert rows where they are the owner
-- ═══════════════════════════════════════════════════════════════

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "pending_businesses_insert_auth" ON public.pending_businesses;

-- Create a new INSERT policy: authenticated users can insert where owner_id = their user id
CREATE POLICY "pending_businesses_insert_auth"
  ON public.pending_businesses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);
