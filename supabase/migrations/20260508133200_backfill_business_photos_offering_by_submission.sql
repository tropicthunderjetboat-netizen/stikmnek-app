-- One-time repair: backfill `business_photos.offering_id` for previously-pooled galleries.
--
-- Context:
-- - In the multi-listing workflow, each pending submission should end up with photos linked to the
--   specific `business_offerings` row created for that listing.
-- - Historic bug/legacy behavior left `offering_id` NULL or pointed many photos at the primary offering,
--   causing the first listing to accumulate photos from later listings.
--
-- Approach:
-- - Use `business_photos.submission_pending_id` (stable) / `pending_id` / legacy `business_id = <pending uuid>`
--   to find the originating pending submission.
-- - For each approved pending submission that targets an existing profile (`pending_businesses.business_id IS NOT NULL`),
--   pick the best-matching offering on that profile:
--     1) Prefer exact case-insensitive title match against `pending_businesses.name`
--     2) Otherwise choose the offering closest in time to the submission's approval timestamp.
-- - Re-link all non-rejected photos for that submission to: (business_id = profile id, offering_id = matched offering).
--
-- Notes:
-- - This is intentionally conservative: it only touches photos that can be traced back to a pending submission UUID.
-- - If a submission title was later edited to something totally different, the time-based fallback still selects an offering.

DO $$
DECLARE
  p record;
  v_offering_id uuid;
  v_anchor_ts timestamptz;
  v_updated_count int;
  v_total int := 0;
BEGIN
  -- Only run when the offering_id column exists (post Phase-2 photo scoping).
  IF to_regclass('public.business_photos') IS NULL OR to_regclass('public.business_offerings') IS NULL THEN
    RAISE NOTICE 'Skip backfill: required tables missing.';
    RETURN;
  END IF;

  FOR p IN
    SELECT
      id,
      business_id,
      owner_id,
      COALESCE(NULLIF(TRIM(name), ''), '') AS name,
      COALESCE(updated_at, created_at, now()) AS anchor_ts
    FROM public.pending_businesses
    WHERE status = 'approved'
      AND business_id IS NOT NULL
  LOOP
    v_anchor_ts := p.anchor_ts;

    -- Find best candidate offering for this submission on that business profile.
    SELECT o.id
    INTO v_offering_id
    FROM public.business_offerings o
    WHERE o.business_id = p.business_id
    ORDER BY
      -- Strong preference: exact title match.
      CASE
        WHEN p.name <> '' AND lower(trim(o.title)) = lower(p.name) THEN 0
        ELSE 1
      END,
      -- Next: closest created_at to approval time.
      abs(extract(epoch from (o.created_at - v_anchor_ts)))
    LIMIT 1;

    IF v_offering_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Re-link photos belonging to this submission.
    UPDATE public.business_photos bp
    SET
      business_id = p.business_id,
      pending_id = NULL,
      offering_id = v_offering_id,
      status = CASE
        WHEN bp.status = 'rejected' THEN 'rejected'
        ELSE COALESCE(bp.status, 'approved')
      END
    WHERE bp.status IS DISTINCT FROM 'rejected'
      AND (
        bp.submission_pending_id = p.id
        OR bp.pending_id = p.id
        OR (bp.pending_id IS NULL AND bp.business_id = p.id) -- legacy: pending uuid stored in business_id
      );

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    v_total := v_total + COALESCE(v_updated_count, 0);
  END LOOP;

  RAISE NOTICE 'Backfill complete. Updated % business_photos rows.', v_total;
END $$;

