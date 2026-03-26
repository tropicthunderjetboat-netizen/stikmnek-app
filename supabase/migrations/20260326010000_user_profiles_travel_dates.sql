-- Tourist travel dates (Profile-First onboarding)
-- Used for pass recommendations and booking guidance.

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS expected_arrival_date date;

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS expected_departure_date date;

COMMENT ON COLUMN public.user_profiles.expected_arrival_date IS 'Tourist expected arrival date (Profile-First onboarding)';
COMMENT ON COLUMN public.user_profiles.expected_departure_date IS 'Tourist expected departure date (Profile-First onboarding)';

