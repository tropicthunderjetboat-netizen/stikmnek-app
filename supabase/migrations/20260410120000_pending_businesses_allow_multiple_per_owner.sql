-- ═══════════════════════════════════════════════════════════════
-- Multiple pending submissions per owner / per profile
--
-- If a mistaken UNIQUE(owner_id) or UNIQUE(business_id) was added in the
-- Dashboard or an old script, new listings can fail with duplicate key errors
-- or "ghost" rows that conflict. This migration drops UNIQUE constraints on
-- public.pending_businesses that involve ONLY owner_id or ONLY business_id
-- (single-column uniques). Composite uniques and PRIMARY KEY on id are kept.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
  col_count int;
  att name;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid, c.conkey
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'pending_businesses'
      AND c.contype = 'u'
  LOOP
    SELECT count(*) INTO col_count FROM unnest(r.conkey) AS x(attnum);

    IF col_count <> 1 THEN
      CONTINUE;
    END IF;

    SELECT a.attname INTO att
    FROM unnest(r.conkey) AS x(attnum)
    JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = x.attnum AND NOT a.attisdropped;

    IF att IN ('owner_id', 'business_id') THEN
      EXECUTE format(
        'ALTER TABLE public.pending_businesses DROP CONSTRAINT IF EXISTS %I',
        r.conname
      );
      RAISE NOTICE 'Dropped UNIQUE on % on pending_businesses (constraint %)', att, r.conname;
    END IF;
  END LOOP;
END $$;
