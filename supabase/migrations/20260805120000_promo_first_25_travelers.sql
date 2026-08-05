-- First 25 travelers free — limited promo campaign (cold-start / trust-building).
-- Atomic slot reservation via reserve_promo_claim(); Edge Function creates the pass.

-- ─── Campaigns ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.promo_campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  label         text NOT NULL,
  max_claims    integer NOT NULL DEFAULT 25 CHECK (max_claims > 0),
  claims_count  integer NOT NULL DEFAULT 0 CHECK (claims_count >= 0),
  is_active     boolean NOT NULL DEFAULT true,
  starts_at     timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_campaigns_claims_lte_max CHECK (claims_count <= max_claims)
);

CREATE INDEX IF NOT EXISTS idx_promo_campaigns_active
  ON public.promo_campaigns (is_active)
  WHERE is_active = true;

COMMENT ON TABLE public.promo_campaigns IS
  'Limited free-pass promos (e.g. FIRST25). Toggle is_active to pause without a deploy.';

-- ─── Claims (one email per campaign) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.promo_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES public.promo_campaigns(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  pass_id         uuid REFERENCES public.passes(id) ON DELETE SET NULL,
  claimed_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_claims_email_unique UNIQUE (campaign_id, email_normalized),
  CONSTRAINT promo_claims_user_unique UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_claims_campaign_id
  ON public.promo_claims (campaign_id);

CREATE INDEX IF NOT EXISTS idx_promo_claims_user_id
  ON public.promo_claims (user_id);

COMMENT ON TABLE public.promo_claims IS
  'One claim per normalized email (and per user) per promo campaign.';

-- ─── Pass columns ────────────────────────────────────────────────────────────

ALTER TABLE public.passes
  ADD COLUMN IF NOT EXISTS promo_campaign_id uuid REFERENCES public.promo_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_promo_free boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_price numeric(12, 2);

CREATE INDEX IF NOT EXISTS idx_passes_is_promo_free
  ON public.passes (is_promo_free)
  WHERE is_promo_free = true;

CREATE INDEX IF NOT EXISTS idx_passes_promo_campaign_id
  ON public.passes (promo_campaign_id)
  WHERE promo_campaign_id IS NOT NULL;

COMMENT ON COLUMN public.passes.is_promo_free IS
  'True when issued via a free promo (amount_paid should be 0). Exclude from paid revenue.';
COMMENT ON COLUMN public.passes.original_price IS
  'What the pass would have cost in AUD if paid (reporting / value tracking).';

-- ─── Seed FIRST25 ────────────────────────────────────────────────────────────

INSERT INTO public.promo_campaigns (code, label, max_claims, claims_count, is_active)
VALUES ('FIRST25', 'First 25 travelers free', 25, 0, true)
ON CONFLICT (code) DO NOTHING;

-- ─── Atomic reserve (Edge Function calls this before inserting the pass) ─────

CREATE OR REPLACE FUNCTION public.reserve_promo_claim(
  p_campaign_code text,
  p_user_id uuid,
  p_email text
)
RETURNS TABLE (
  ok boolean,
  reason text,
  campaign_id uuid,
  claims_count integer,
  max_claims integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_camp public.promo_campaigns%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  v_email := lower(trim(coalesce(p_email, '')));
  IF p_user_id IS NULL OR v_email = '' OR position('@' in v_email) = 0 THEN
    ok := false;
    reason := 'invalid_identity';
    campaign_id := NULL;
    claims_count := NULL;
    max_claims := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT *
  INTO v_camp
  FROM public.promo_campaigns c
  WHERE c.code = upper(trim(p_campaign_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    ok := false;
    reason := 'not_found';
    campaign_id := NULL;
    claims_count := NULL;
    max_claims := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT v_camp.is_active
     OR (v_camp.starts_at IS NOT NULL AND v_camp.starts_at > v_now)
     OR (v_camp.ends_at IS NOT NULL AND v_camp.ends_at < v_now)
  THEN
    ok := false;
    reason := 'inactive';
    campaign_id := v_camp.id;
    claims_count := v_camp.claims_count;
    max_claims := v_camp.max_claims;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_camp.claims_count >= v_camp.max_claims THEN
    ok := false;
    reason := 'full';
    campaign_id := v_camp.id;
    claims_count := v_camp.claims_count;
    max_claims := v_camp.max_claims;
    RETURN NEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.promo_claims pc
    WHERE pc.campaign_id = v_camp.id
      AND (pc.email_normalized = v_email OR pc.user_id = p_user_id)
  ) THEN
    ok := false;
    reason := 'already_claimed';
    campaign_id := v_camp.id;
    claims_count := v_camp.claims_count;
    max_claims := v_camp.max_claims;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Atomic increment only while under cap
  UPDATE public.promo_campaigns c
  SET claims_count = c.claims_count + 1,
      updated_at = v_now
  WHERE c.id = v_camp.id
    AND c.claims_count < c.max_claims
    AND c.is_active = true
  RETURNING c.claims_count, c.max_claims INTO claims_count, max_claims;

  IF NOT FOUND THEN
    ok := false;
    reason := 'full';
    campaign_id := v_camp.id;
    claims_count := v_camp.claims_count;
    max_claims := v_camp.max_claims;
    RETURN NEXT;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.promo_claims (campaign_id, user_id, email_normalized)
    VALUES (v_camp.id, p_user_id, v_email);
  EXCEPTION
    WHEN unique_violation THEN
      -- Roll back the increment if insert raced
      UPDATE public.promo_campaigns c
      SET claims_count = GREATEST(0, c.claims_count - 1),
          updated_at = v_now
      WHERE c.id = v_camp.id;
      ok := false;
      reason := 'already_claimed';
      campaign_id := v_camp.id;
      SELECT c.claims_count, c.max_claims INTO claims_count, max_claims
      FROM public.promo_campaigns c WHERE c.id = v_camp.id;
      RETURN NEXT;
      RETURN;
  END;

  ok := true;
  reason := 'reserved';
  campaign_id := v_camp.id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_promo_claim(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_promo_claim(text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.reserve_promo_claim(text, uuid, text) IS
  'Atomically reserves one FIRST25 (or other) promo slot. Called by claim-promo-pass Edge Function with service role.';

-- Link pass_id after Edge inserts the pass
CREATE OR REPLACE FUNCTION public.attach_promo_claim_pass(
  p_campaign_id uuid,
  p_user_id uuid,
  p_pass_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.promo_claims
  SET pass_id = p_pass_id
  WHERE campaign_id = p_campaign_id
    AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_promo_claim_pass(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_promo_claim_pass(uuid, uuid, uuid) TO service_role;

-- Release a reserved slot if pass insert fails (best-effort)
CREATE OR REPLACE FUNCTION public.release_promo_claim(
  p_campaign_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.promo_claims
  WHERE campaign_id = p_campaign_id
    AND user_id = p_user_id
    AND pass_id IS NULL;

  IF FOUND THEN
    UPDATE public.promo_campaigns c
    SET claims_count = GREATEST(0, c.claims_count - 1),
        updated_at = now()
    WHERE c.id = p_campaign_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.release_promo_claim(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_promo_claim(uuid, uuid) TO service_role;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.promo_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_claims ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.promo_campaigns TO authenticated, anon;
GRANT SELECT, UPDATE ON public.promo_campaigns TO authenticated;
GRANT ALL ON public.promo_campaigns TO service_role;

GRANT SELECT ON public.promo_claims TO authenticated;
GRANT ALL ON public.promo_claims TO service_role;

-- Anyone can read campaign status (for banner: X of 25 left)
DROP POLICY IF EXISTS promo_campaigns_select ON public.promo_campaigns;
CREATE POLICY promo_campaigns_select
  ON public.promo_campaigns FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  );

-- Admins can pause / edit campaigns
DROP POLICY IF EXISTS promo_campaigns_admin_update ON public.promo_campaigns;
CREATE POLICY promo_campaigns_admin_update
  ON public.promo_campaigns FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  );

DROP POLICY IF EXISTS promo_claims_admin_select ON public.promo_claims;
CREATE POLICY promo_claims_admin_select
  ON public.promo_claims FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  );

DROP POLICY IF EXISTS promo_claims_own_select ON public.promo_claims;
CREATE POLICY promo_claims_own_select
  ON public.promo_claims FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
