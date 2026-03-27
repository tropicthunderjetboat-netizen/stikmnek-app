-- Add mega_group pass type support for passes.
-- Handles either:
-- 1) enum type public.pass_type, or
-- 2) text/varchar column with CHECK constraint.

DO $$
BEGIN
  -- If a Postgres enum named public.pass_type exists, add the value safely.
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'pass_type'
      AND t.typtype = 'e'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TYPE public.pass_type ADD VALUE IF NOT EXISTS ''mega_group''';
    EXCEPTION
      WHEN others THEN
        -- On older PG versions without IF NOT EXISTS support,
        -- ignore duplicate-value failures.
        IF position('already exists' in SQLERRM) = 0 THEN
          RAISE;
        END IF;
    END;
  END IF;
END $$;

DO $$
DECLARE
  c record;
BEGIN
  -- For text/check-based schemas, replace legacy pass_type IN(...) checks.
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'passes'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%pass_type%'
      AND pg_get_constraintdef(con.oid) ILIKE '%daily%'
      AND pg_get_constraintdef(con.oid) ILIKE '%weekly%'
      AND pg_get_constraintdef(con.oid) ILIKE '%monthly%'
  LOOP
    EXECUTE format('ALTER TABLE public.passes DROP CONSTRAINT %I', c.conname);
  END LOOP;

  -- Add canonical check constraint when pass_type is text-like.
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
      CHECK (pass_type IN ('daily', 'weekly', 'monthly', 'mega_group'));
  END IF;
END $$;
