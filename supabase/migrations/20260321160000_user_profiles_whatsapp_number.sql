-- Dedicated WhatsApp for tourists (separate from general phone; optional)
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS whatsapp_number text;

COMMENT ON COLUMN public.user_profiles.whatsapp_number IS 'Tourist WhatsApp number for bookings/contact (E.164 or local digits)';
