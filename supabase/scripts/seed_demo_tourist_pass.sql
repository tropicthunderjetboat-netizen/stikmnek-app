-- Demo tourist pass for business presentations (Ima Tourist / tourist@gmail.com)
--
-- Run in Supabase Dashboard → SQL Editor (service role / postgres).
-- Safe to re-run: upserts profile and refreshes the demo pass row by payment_session_id.
--
-- QR code = passes.id (UUID). Redemption checks valid_from / valid_until and active=true.
-- Hourly cron sets active=false when expires_at < now() — this pass uses year 2099.

DO $$
DECLARE
  v_email text := 'tourist@gmail.com';
  v_uid uuid;
  v_pass_id uuid;
  v_demo_session text := 'demo-ima-tourist';
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION
      'No auth user for %. Create "Ima Tourist" in Authentication → Users first, then re-run this script.',
      v_email;
  END IF;

  INSERT INTO public.user_profiles (
    user_id,
    role,
    user_type,
    display_name,
    name,
    email,
    num_adults,
    num_children,
    num_infants,
    post_pass_profile_completed,
    onboarding_complete,
    updated_at
  )
  VALUES (
    v_uid,
    'tourist',
    'tourist',
    'Ima Tourist',
    'Ima Tourist',
    v_email,
    2,
    0,
    0,
    true,
    true,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    role = EXCLUDED.role,
    user_type = EXCLUDED.user_type,
    display_name = EXCLUDED.display_name,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    num_adults = GREATEST(COALESCE(public.user_profiles.num_adults, 0), 2),
    post_pass_profile_completed = true,
    onboarding_complete = true,
    updated_at = now();

  -- Only one active demo pass; retire other active rows for this user.
  UPDATE public.passes
  SET active = false
  WHERE user_id = v_uid
    AND active = true
    AND COALESCE(payment_session_id, '') <> v_demo_session;

  SELECT id INTO v_pass_id
  FROM public.passes
  WHERE user_id = v_uid AND payment_session_id = v_demo_session
  LIMIT 1;

  IF v_pass_id IS NULL THEN
    INSERT INTO public.passes (
      user_id,
      pass_type,
      active,
      valid_from,
      valid_until,
      expires_at,
      max_people,
      share_bonus_applied,
      amount_paid,
      currency,
      payment_provider,
      payment_session_id,
      purchased_at
    )
    VALUES (
      v_uid,
      'dynamic',
      true,
      '2020-01-01'::date,
      '2099-12-31'::date,
      '2099-12-31 23:59:59+00'::timestamptz,
      20,
      false,
      0,
      'AUD',
      'demo',
      v_demo_session,
      now()
    )
    RETURNING id INTO v_pass_id;
  ELSE
    UPDATE public.passes
    SET
      pass_type = 'dynamic',
      active = true,
      valid_from = '2020-01-01'::date,
      valid_until = '2099-12-31'::date,
      expires_at = '2099-12-31 23:59:59+00'::timestamptz,
      max_people = 20,
      share_bonus_applied = false,
      amount_paid = 0,
      currency = 'AUD',
      payment_provider = 'demo'
    WHERE id = v_pass_id;
  END IF;

  RAISE NOTICE 'Demo pass ready for % (user_id=%). Pass UUID (QR payload)=%',
    v_email, v_uid, v_pass_id;
END $$;
