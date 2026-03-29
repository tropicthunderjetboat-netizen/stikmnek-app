-- public.businesses: ensure `active` exists (public visibility; false = hidden e.g. onboarding stubs)
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.businesses.active IS
  'When false, listing is hidden from public discovery (owner onboarding stub, moderation, etc.).';

CREATE INDEX IF NOT EXISTS idx_businesses_active ON public.businesses(active);
