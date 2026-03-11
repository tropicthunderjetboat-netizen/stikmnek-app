-- ═══════════════════════════════════════════════════════════════
-- CONSOLIDATED FIX: pending_businesses — Permission & RPC
--
-- Ensures:
-- 1. whatsapp_number column exists
-- 2. Table-level GRANTs for authenticated and service_role
-- 3. RLS INSERT policy (auth.uid() = owner_id)
-- 4. insert_pending_business RPC (SECURITY DEFINER, bypasses RLS)
--
-- Run this in Supabase SQL Editor if migrations were not applied.
-- ═══════════════════════════════════════════════════════════════

-- 1. Add whatsapp_number if missing
ALTER TABLE public.pending_businesses
  ADD COLUMN IF NOT EXISTS whatsapp_number text;

-- 2. Table-level GRANTs (required for RLS to work; anon has no table access by default)
GRANT SELECT, INSERT, UPDATE ON public.pending_businesses TO authenticated;
GRANT ALL ON public.pending_businesses TO service_role;

-- 3. RLS INSERT policy
DROP POLICY IF EXISTS "pending_businesses_insert_auth" ON public.pending_businesses;
CREATE POLICY "pending_businesses_insert_auth"
  ON public.pending_businesses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- 4. RPC function (SECURITY DEFINER — runs as postgres, bypasses RLS)
CREATE OR REPLACE FUNCTION public.insert_pending_business(
  p_owner_id uuid,
  p_name text,
  p_category text DEFAULT 'dining',
  p_description text DEFAULT '',
  p_discount text DEFAULT '',
  p_original_price numeric DEFAULT 0,
  p_deal_price numeric DEFAULT 0,
  p_location text DEFAULT 'Port Vila, Vanuatu',
  p_phone text DEFAULT '',
  p_email text DEFAULT '',
  p_hours text DEFAULT '',
  p_image text DEFAULT '',
  p_map_url text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_discount_valid_from date DEFAULT NULL,
  p_discount_valid_until date DEFAULT NULL,
  p_whatsapp_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF auth.uid() != p_owner_id THEN
    RAISE EXCEPTION 'owner_id must match authenticated user';
  END IF;

  INSERT INTO public.pending_businesses (
    owner_id, name, category, description, discount,
    original_price, deal_price, location, phone, email, hours,
    image, map_url, website, discount_valid_from, discount_valid_until,
    whatsapp_number, status
  ) VALUES (
    p_owner_id, p_name, p_category, p_description, p_discount,
    p_original_price, p_deal_price, p_location, p_phone, p_email, p_hours,
    p_image, p_map_url, p_website, p_discount_valid_from, p_discount_valid_until,
    p_whatsapp_number, 'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_pending_business TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_pending_business TO service_role;
