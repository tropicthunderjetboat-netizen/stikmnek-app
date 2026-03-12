-- ═══════════════════════════════════════════════════════════════
-- Rejected submission: allow owners to edit and resubmit
--
-- 1. RLS: Owners can update their own rejected submissions
--    (so they can edit and set status back to 'pending')
-- 2. pending_edits stays for edits to APPROVED businesses only.
--    Rejected NEW submissions stay in pending_businesses.
-- ═══════════════════════════════════════════════════════════════

-- Allow owners to update their own rejected submissions (for edit & resubmit)
DROP POLICY IF EXISTS "pending_businesses_update_own" ON public.pending_businesses;
CREATE POLICY "pending_businesses_update_own"
  ON public.pending_businesses FOR UPDATE
  USING (
    auth.uid() = owner_id
    AND (status = 'pending' OR status = 'rejected')
  );
