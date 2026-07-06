-- ═══════════════════════════════════════════════════════════════════════════
-- Activate master business profiles when they have live offerings.
--
-- Problem: profile-first onboarding creates businesses.active = false stubs;
-- approving a deal on that profile (pending_businesses.business_id set) only
-- inserted business_offerings and left the profile inactive.
--
-- Fix:
-- 1) Backfill existing profiles that already have active offerings.
-- 2) Trigger: flip businesses.active → true when an offering becomes active
--    (covers Path B approval, reactivation, admin add listing, etc.).
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.businesses.active IS
  'Company profile visibility. false = onboarding stub (no live deal yet). '
  'Automatically set true when at least one business_offerings row is active; '
  'tourist discovery uses business_offerings.active, not this flag alone.';

-- ─── One-time backfill ───
UPDATE public.businesses b
SET
  active = true,
  updated_at = now()
WHERE b.active IS NOT TRUE
  AND EXISTS (
    SELECT 1
    FROM public.business_offerings o
    WHERE o.business_id = b.id
      AND o.active IS TRUE
  );

-- ─── Keep profile active in sync when offerings go live ───
CREATE OR REPLACE FUNCTION public.sync_business_profile_active_from_offerings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.active, false) IS TRUE AND NEW.business_id IS NOT NULL THEN
    UPDATE public.businesses b
    SET
      active = true,
      updated_at = now()
    WHERE b.id = NEW.business_id
      AND b.active IS NOT TRUE;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_business_profile_active_from_offerings() IS
  'When an offering is inserted/activated, mark its master businesses row active (exit onboarding stub).';

DROP TRIGGER IF EXISTS trg_sync_business_profile_active_from_offerings ON public.business_offerings;

CREATE TRIGGER trg_sync_business_profile_active_from_offerings
  AFTER INSERT OR UPDATE OF active ON public.business_offerings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_business_profile_active_from_offerings();
