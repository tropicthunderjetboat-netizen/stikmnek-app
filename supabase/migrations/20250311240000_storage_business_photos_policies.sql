-- ═══════════════════════════════════════════════════════════════
-- Storage: business-photos bucket policies
-- Allows authenticated users to upload; public read for display.
-- ═══════════════════════════════════════════════════════════════

-- Policy: Authenticated users can upload to business-photos
DROP POLICY IF EXISTS "Authenticated upload to business-photos" ON storage.objects;
CREATE POLICY "Authenticated upload to business-photos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'business-photos');

-- Policy: Public read for business-photos (display in gallery)
DROP POLICY IF EXISTS "Public read business-photos" ON storage.objects;
CREATE POLICY "Public read business-photos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'business-photos');
