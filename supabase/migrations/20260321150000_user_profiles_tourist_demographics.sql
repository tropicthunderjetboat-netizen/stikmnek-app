-- Tourist demographics & contact prefs (post-pass profile, analytics)
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS num_adults integer NOT NULL DEFAULT 0;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS num_children integer NOT NULL DEFAULT 0;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS num_infants integer NOT NULL DEFAULT 0;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS preferred_contact_method text NOT NULL DEFAULT 'email';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS resort_name text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS post_pass_profile_completed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.num_adults IS 'Adults 13+ (tourism)';
COMMENT ON COLUMN public.user_profiles.preferred_contact_method IS 'email | whatsapp | phone';
COMMENT ON COLUMN public.user_profiles.post_pass_profile_completed IS 'True after tourist completes post-purchase profile form';
