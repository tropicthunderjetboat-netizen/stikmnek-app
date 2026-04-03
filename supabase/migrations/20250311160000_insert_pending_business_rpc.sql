-- ═══════════════════════════════════════════════════════════════
-- insert_pending_business RPC — Bypasses RLS
-- Fixes: "permission denied for table pending_businesses"
--
-- Uses SECURITY DEFINER so it runs as the function owner (postgres)
-- and bypasses RLS. Verifies auth.uid() = owner_id for security.
--
-- If multiple overloads of this name already exist (e.g. DB ahead of migrations),
-- `GRANT EXECUTE ON FUNCTION public.insert_pending_business` without a signature
-- fails with: function name "public.insert_pending_business" is not unique.
-- Drop known signatures first; later migrations recreate the evolved overloads.
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.insert_pending_business(
  uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, text, date, date, text, jsonb, uuid
);
DROP FUNCTION IF EXISTS public.insert_pending_business(
  uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, text, date, date, text, jsonb
);
DROP FUNCTION IF EXISTS public.insert_pending_business(
  uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, text, date, date, text
);

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
  -- Must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Must be inserting as self
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

GRANT EXECUTE ON FUNCTION public.insert_pending_business(
  uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, text, date, date, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_pending_business(
  uuid, text, text, text, text, numeric, numeric, text, text, text, text, text, text, text, date, date, text
) TO service_role;
