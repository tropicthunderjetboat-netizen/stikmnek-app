-- Master profile verification flag (set true when admin approves a listing).

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.businesses.is_verified IS
  'True once admin has approved at least one live offering for this profile.';
