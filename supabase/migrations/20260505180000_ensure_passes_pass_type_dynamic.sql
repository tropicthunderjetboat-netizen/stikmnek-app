-- Ensure variable-priced checkout can INSERT pass_type = 'dynamic'.
-- Idempotent: safe if 20260504120000_add_dynamic_pass_type.sql already ran.
--
-- Fixes: "new row for relation passes violates check constraint passes_pass_type_check"
-- when production DB never picked up the earlier migration.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'passes'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%pass_type%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.passes DROP CONSTRAINT %I', cname);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'passes'
      AND column_name = 'pass_type'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE public.passes
      ADD CONSTRAINT passes_pass_type_check
      CHECK (pass_type IN ('daily', 'weekly', 'monthly', 'mega_group', 'dynamic'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- If passes.pass_type uses a Postgres enum, add the value (ignored when not an enum).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    JOIN pg_type t ON t.typname = c.udt_name
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE c.table_schema = 'public'
      AND c.table_name = 'passes'
      AND c.column_name = 'pass_type'
      AND t.typtype = 'e'
      AND n.nspname = 'public'
      AND t.typname = 'pass_type'
  ) THEN
    BEGIN
      ALTER TYPE public.pass_type ADD VALUE 'dynamic';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
