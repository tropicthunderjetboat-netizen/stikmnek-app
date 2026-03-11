-- Add whatsapp_number to pending_businesses (matches businesses table)
-- Run in Supabase SQL Editor if pending_businesses insert fails with "column whatsapp_number does not exist"
ALTER TABLE public.pending_businesses
ADD COLUMN IF NOT EXISTS whatsapp_number text;

COMMENT ON COLUMN public.pending_businesses.whatsapp_number IS 'WhatsApp number for tourist contact (e.g. +678 5551234)';
