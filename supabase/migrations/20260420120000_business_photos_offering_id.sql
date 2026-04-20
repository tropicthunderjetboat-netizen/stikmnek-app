-- Scope gallery rows to a specific listing (`business_offerings`) when set.
-- NULL = legacy rows (pre–per-listing photos) or non-listing use.

ALTER TABLE public.business_photos
  ADD COLUMN IF NOT EXISTS offering_id uuid REFERENCES public.business_offerings (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS business_photos_business_offering_idx
  ON public.business_photos (business_id, offering_id)
  WHERE offering_id IS NOT NULL;

COMMENT ON COLUMN public.business_photos.offering_id IS
  'Approved pending photos are relinked to this offering so each deal only shows its own gallery.';
