-- Add pass_purchases purge (FK to auth.users) — was missing from initial delete_public_app_data_for_user.

CREATE OR REPLACE FUNCTION public.delete_public_app_data_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;

  DELETE FROM public.review_responses WHERE user_id = p_user_id;
  DELETE FROM public.reviews WHERE user_id = p_user_id;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'favorites') THEN
    DELETE FROM public.favorites WHERE user_id = p_user_id;
  END IF;

  -- Receipt / audit rows often FK to auth.users (blocks Auth UI delete if skipped)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pass_purchases') THEN
    DELETE FROM public.pass_purchases WHERE user_id = p_user_id;
  END IF;

  DELETE FROM public.passes WHERE user_id = p_user_id;
  DELETE FROM public.redemptions WHERE user_id = p_user_id;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_history') THEN
    DELETE FROM public.search_history WHERE user_id = p_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_tickets') THEN
    DELETE FROM public.support_tickets WHERE user_id = p_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    DELETE FROM public.notifications WHERE user_id = p_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'feedback') THEN
    DELETE FROM public.feedback WHERE user_id = p_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'error_logs') THEN
    DELETE FROM public.error_logs WHERE user_id IS NOT NULL AND user_id = p_user_id;
  END IF;

  DELETE FROM public.business_photos WHERE uploaded_by = p_user_id;
  DELETE FROM public.pending_edits WHERE owner_id = p_user_id;
  DELETE FROM public.pending_businesses WHERE owner_id = p_user_id;

  DELETE FROM public.businesses WHERE owner_id = p_user_id;

  DELETE FROM public.user_profiles WHERE user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.delete_public_app_data_for_user(uuid) IS
  'Removes public schema rows keyed to an auth user so auth.users deletion succeeds. Includes pass_purchases.';

REVOKE ALL ON FUNCTION public.delete_public_app_data_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_public_app_data_for_user(uuid) TO service_role;
