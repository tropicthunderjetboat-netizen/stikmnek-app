-- Full purge before auth.users delete: tables from database-setup.sql + storage.objects
-- (pass_purchases, payment_sessions, referrals, ticket_responses/support_tickets order, etc.)

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

  -- Review / reply rows
  DELETE FROM public.review_responses WHERE user_id = p_user_id;
  DELETE FROM public.reviews WHERE user_id = p_user_id;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'favorites') THEN
    DELETE FROM public.favorites WHERE user_id = p_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pass_purchases') THEN
    DELETE FROM public.pass_purchases WHERE user_id = p_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_sessions') THEN
    DELETE FROM public.payment_sessions WHERE user_id = p_user_id;
  END IF;

  -- redemptions reference passes — delete first when passes may still exist
  DELETE FROM public.redemptions WHERE user_id = p_user_id;
  DELETE FROM public.passes WHERE user_id = p_user_id;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_history') THEN
    DELETE FROM public.search_history WHERE user_id = p_user_id;
  END IF;

  -- Ticket replies before tickets (avoid FK errors if CASCADE missing)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ticket_responses')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_tickets') THEN
    DELETE FROM public.ticket_responses
    WHERE responder_id = p_user_id
       OR ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = p_user_id);
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ticket_responses') THEN
    DELETE FROM public.ticket_responses WHERE responder_id = p_user_id;
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

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') THEN
    DELETE FROM public.referrals
    WHERE referrer_id = p_user_id OR referred_user_id = p_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'social_activity') THEN
    DELETE FROM public.social_activity WHERE user_id = p_user_id;
  END IF;

  DELETE FROM public.business_photos WHERE uploaded_by = p_user_id;
  DELETE FROM public.pending_edits WHERE owner_id = p_user_id;
  DELETE FROM public.pending_businesses WHERE owner_id = p_user_id;

  DELETE FROM public.businesses WHERE owner_id = p_user_id;

  DELETE FROM public.user_profiles WHERE user_id = p_user_id;

  -- Older projects: storage.objects.owner → auth.users blocks Auth UI delete
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'objects' AND column_name = 'owner'
  ) THEN
    DELETE FROM storage.objects WHERE owner = p_user_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.delete_public_app_data_for_user(uuid) IS
  'Full public + storage purge for one auth user so auth.users delete succeeds.';

REVOKE ALL ON FUNCTION public.delete_public_app_data_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_public_app_data_for_user(uuid) TO service_role;
