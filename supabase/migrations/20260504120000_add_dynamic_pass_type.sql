-- Allow `dynamic` pass_type for new variable-priced passes (see pricingDynamic + Edge functions).

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

  ALTER TABLE public.passes
    ADD CONSTRAINT passes_pass_type_check
    CHECK (pass_type IN ('daily', 'weekly', 'monthly', 'mega_group', 'dynamic'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON CONSTRAINT passes_pass_type_check ON public.passes IS
  'Legacy catalog types plus dynamic priced passes.';
