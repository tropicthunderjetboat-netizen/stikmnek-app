-- ═══════════════════════════════════════════════════════════════════════════
-- business_photos: stable admin link + admin RPC alignment
--
-- 1) submission_pending_id — keeps the original pending_businesses.id after
--    approval when pending_id is cleared, so the admin panel can load gallery
--    rows for both queue and reviewed submissions without mis-keying.
-- 2) BEFORE INSERT/UPDATE trigger — stamps submission_pending_id from pending_id
--    on insert; preserves it when pending_id is cleared on approve.
-- 3) get_business_photos_for_admin — use user_profiles.role = 'admin' (same
--    pattern as review_pending_business) instead of a hardcoded email list.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.business_photos
  ADD COLUMN IF NOT EXISTS submission_pending_id uuid;

ALTER TABLE public.business_photos
  DROP CONSTRAINT IF EXISTS business_photos_submission_pending_id_fkey;

ALTER TABLE public.business_photos
  ADD CONSTRAINT business_photos_submission_pending_id_fkey
  FOREIGN KEY (submission_pending_id) REFERENCES public.pending_businesses (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.business_photos.submission_pending_id IS
  'Original pending_businesses.id for this upload; kept after approval when pending_id is cleared so admin/history views can group photos by submission.';

CREATE INDEX IF NOT EXISTS idx_business_photos_submission_pending_id
  ON public.business_photos (submission_pending_id)
  WHERE submission_pending_id IS NOT NULL;

-- Rows still on the moderation queue
UPDATE public.business_photos bp
SET submission_pending_id = bp.pending_id
WHERE bp.pending_id IS NOT NULL
  AND bp.submission_pending_id IS NULL;

-- Preserve submission link when pending_id is cleared (e.g. on approve)
CREATE OR REPLACE FUNCTION public.business_photos_stamp_submission_pending()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.pending_id IS NOT NULL AND NEW.submission_pending_id IS NULL THEN
      NEW.submission_pending_id := NEW.pending_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.pending_id IS NOT NULL
       AND NEW.pending_id IS DISTINCT FROM OLD.pending_id
       AND NEW.pending_id IS NULL
       AND NEW.submission_pending_id IS NULL THEN
      NEW.submission_pending_id := OLD.pending_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_photos_stamp_submission_pending_trigger ON public.business_photos;
CREATE TRIGGER business_photos_stamp_submission_pending_trigger
  BEFORE INSERT OR UPDATE ON public.business_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.business_photos_stamp_submission_pending();

-- ═══ Admin RPC: any user_profiles admin (not email allowlist) ═══
CREATE OR REPLACE FUNCTION public.get_business_photos_for_admin()
RETURNS SETOF public.business_photos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.business_photos
  ORDER BY created_at ASC;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.get_business_photos_for_admin() TO authenticated;
