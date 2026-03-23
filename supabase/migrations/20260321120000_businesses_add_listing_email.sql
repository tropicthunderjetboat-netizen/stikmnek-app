-- Listing contact email (optional). Used by booking inquiry + app mapping (contactEmail).
-- Edge function also checks contact_email / business_email if present from older schemas.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS business_email text;

COMMENT ON COLUMN public.businesses.email IS 'Public listing email for booking inquiries (optional; falls back to owner auth/profile email)';
