-- Add whatsapp_number to pending_businesses (matches businesses table)
-- Run in Supabase SQL Editor or via: supabase db push
-- Fixes: "column whatsapp_number does not exist" on direct insert

ALTER TABLE public.pending_businesses
ADD COLUMN IF NOT EXISTS whatsapp_number text;

COMMENT ON COLUMN public.pending_businesses.whatsapp_number IS 'WhatsApp number for tourist contact (e.g. +678 5551234)';
