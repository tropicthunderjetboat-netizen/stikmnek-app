-- ═══════════════════════════════════════════════════════════════
-- Admins can read ALL business_photos (including pending)
-- Required for Admin Panel to display and moderate all photos
-- for pending business listings (business_id = pending_businesses.id)
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins read all business_photos" ON public.business_photos;
CREATE POLICY "Admins read all business_photos"
  ON public.business_photos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
