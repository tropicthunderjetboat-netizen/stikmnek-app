-- Dashboard-friendly reset: `business-photos` bucket + RLS policies on `storage.objects`.
-- Does NOT run ALTER on `storage.objects` (avoids "must be owner of table objects" in some roles).
-- Policies are bucket-scoped only: bucket_id = 'business-photos'::text
--
-- Run in Supabase SQL Editor as a user with rights to create policies on `storage.objects`
-- (typically the project owner / postgres role).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Bucket: ensure `business-photos` exists and is public
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-photos',
  'business-photos',
  true,
  NULL,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  name = EXCLUDED.name;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Policies: create only if missing (no DROP required for first-time setup)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Allow Authenticated Uploads
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow Authenticated Uploads'
  ) THEN
    CREATE POLICY "Allow Authenticated Uploads"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'business-photos'::text);
  END IF;

  -- Allow Authenticated Updates
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow Authenticated Updates'
  ) THEN
    CREATE POLICY "Allow Authenticated Updates"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'business-photos'::text)
      WITH CHECK (bucket_id = 'business-photos'::text);
  END IF;

  -- Allow Public View
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow Public View'
  ) THEN
    CREATE POLICY "Allow Public View"
      ON storage.objects
      FOR SELECT
      TO PUBLIC
      USING (bucket_id = 'business-photos'::text);
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Optional: remove legacy policy names from older migrations (uncomment if you need a clean slate)
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS "Authenticated upload to business-photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Authenticated select business-photos" ON storage.objects;
-- DROP POLICY IF EXISTS "Public read business-photos" ON storage.objects;

-- Verify policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'Allow %';
