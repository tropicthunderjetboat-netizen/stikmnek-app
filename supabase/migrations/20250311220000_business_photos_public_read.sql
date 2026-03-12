-- ═══════════════════════════════════════════════════════════════
-- business_photos: Allow public read for approved photos
-- Enables PhotoGallery to display all approved business photos.
-- ═══════════════════════════════════════════════════════════════

-- Ensure RLS is enabled
ALTER TABLE public.business_photos ENABLE ROW LEVEL SECURITY;

-- Grant SELECT to anon and authenticated (required for RLS)
GRANT SELECT ON public.business_photos TO anon;
GRANT SELECT ON public.business_photos TO authenticated;

-- Policy: Anyone can read approved business photos (for public gallery display)
DROP POLICY IF EXISTS "Public read approved business photos" ON public.business_photos;
CREATE POLICY "Public read approved business photos"
  ON public.business_photos
  FOR SELECT
  USING (status = 'approved');

-- Policy: Authenticated users can read their own pending photos (for business dashboard)
-- Covers: approved (all) + pending (own uploads)
DROP POLICY IF EXISTS "Users read own pending photos" ON public.business_photos;
CREATE POLICY "Users read own pending photos"
  ON public.business_photos
  FOR SELECT
  TO authenticated
  USING (status = 'approved' OR (status = 'pending' AND uploaded_by = auth.uid()));
