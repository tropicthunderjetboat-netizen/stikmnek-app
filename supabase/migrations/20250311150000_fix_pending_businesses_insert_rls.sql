-- ═══════════════════════════════════════════════════════════════
-- Fix pending_businesses INSERT — Permission + RLS
-- Fixes: "permission denied for table pending_businesses"
--
-- 1. Grant INSERT to authenticated role (base table permission)
-- 2. Replace RLS policy with auth.uid() = owner_id (more reliable than auth.role())
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Ensure authenticated role has INSERT permission
GRANT INSERT ON public.pending_businesses TO authenticated;

-- Step 2: Drop and recreate the INSERT RLS policy
DROP POLICY IF EXISTS "pending_businesses_insert_auth" ON public.pending_businesses;

CREATE POLICY "pending_businesses_insert_auth"
  ON public.pending_businesses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);
