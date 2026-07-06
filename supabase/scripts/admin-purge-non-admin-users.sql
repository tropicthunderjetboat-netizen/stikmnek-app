-- ═══════════════════════════════════════════════════════════════════════════
-- ADMIN ONLY — purge all users except admin@stikmnek.com
--
-- When to use: edge-function delete fails, or resetting a dev/staging database.
-- Do NOT run on production unless you intend to wipe all tourist/business accounts.
--
-- How to run: Supabase Dashboard → SQL Editor → paste → Run
-- Full instructions: docs/ADMIN_USER_PURGE_SQL.md (in this repo)
-- ═══════════════════════════════════════════════════════════════════════════

-- FAULT-TOLERANT: skips missing tables/columns
DO $$
DECLARE
  admin_id uuid;
  r record;
  del_count int := 0;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@stikmnek.com';

  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin user admin@stikmnek.com not found in auth.users!';
  END IF;

  RAISE NOTICE 'Admin ID: %', admin_id;

  BEGIN DELETE FROM favorites WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'favorites: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: favorites table not found'; WHEN undefined_column THEN RAISE NOTICE 'SKIP: favorites column mismatch'; WHEN OTHERS THEN RAISE NOTICE 'SKIP favorites: %', SQLERRM; END;

  BEGIN DELETE FROM pass_purchases WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'pass_purchases: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: pass_purchases table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP pass_purchases: %', SQLERRM; END;

  BEGIN DELETE FROM passes WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'passes: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: passes table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP passes: %', SQLERRM; END;

  BEGIN DELETE FROM redemptions WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'redemptions: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: redemptions table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP redemptions: %', SQLERRM; END;

  BEGIN DELETE FROM search_history WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'search_history: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: search_history table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP search_history: %', SQLERRM; END;

  BEGIN DELETE FROM support_tickets WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'support_tickets: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: support_tickets table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP support_tickets: %', SQLERRM; END;

  BEGIN DELETE FROM notifications WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'notifications: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: notifications table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP notifications: %', SQLERRM; END;

  BEGIN DELETE FROM feedback WHERE user_id IS NOT NULL AND user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'feedback: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: feedback table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP feedback: %', SQLERRM; END;

  BEGIN DELETE FROM error_logs WHERE user_id IS NOT NULL AND user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'error_logs: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: error_logs table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP error_logs: %', SQLERRM; END;

  BEGIN DELETE FROM reviews WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'reviews: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: reviews table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP reviews: %', SQLERRM; END;

  BEGIN DELETE FROM review_responses WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'review_responses: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: review_responses table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP review_responses: %', SQLERRM; END;

  BEGIN DELETE FROM business_photos WHERE uploaded_by != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'business_photos: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: business_photos table not found'; WHEN undefined_column THEN RAISE NOTICE 'SKIP: business_photos.uploaded_by column not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP business_photos: %', SQLERRM; END;

  BEGIN DELETE FROM pending_businesses WHERE owner_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'pending_businesses: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: pending_businesses table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP pending_businesses: %', SQLERRM; END;

  BEGIN DELETE FROM pending_edits WHERE owner_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'pending_edits: % rows deleted', del_count; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'SKIP: pending_edits table not found'; WHEN OTHERS THEN RAISE NOTICE 'SKIP pending_edits: %', SQLERRM; END;

  BEGIN DELETE FROM user_profiles WHERE user_id != admin_id; GET DIAGNOSTICS del_count = ROW_COUNT; RAISE NOTICE 'user_profiles: % rows deleted', del_count; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SKIP user_profiles: %', SQLERRM; END;

  FOR r IN SELECT id, email FROM auth.users WHERE id != admin_id
  LOOP
    BEGIN
      DELETE FROM auth.users WHERE id = r.id;
      RAISE NOTICE 'Deleted auth user: % (%)', r.email, r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'FAILED to delete auth user % (%): %', r.email, r.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'DONE — admin@stikmnek.com preserved.';
END $$;
