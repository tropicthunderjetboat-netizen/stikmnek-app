-- Fix: ensure public.businesses.updated_at exists
-- Error observed: column "updated_at" of relation "businesses" does not exist
-- Triggers/functions (set_updated_at_businesses, update_business_rating) require this column.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- If you want to be extra safe (optional), uncomment:
-- UPDATE public.businesses SET updated_at = created_at WHERE updated_at IS NULL;

