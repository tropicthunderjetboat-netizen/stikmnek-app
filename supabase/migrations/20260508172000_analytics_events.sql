-- Analytics events (views/clicks/whatsapp taps) for business dashboards
-- Stores lightweight, privacy-safe interaction events for aggregated analytics only.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  offering_id uuid NULL REFERENCES public.business_offerings(id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Basic guardrails
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'analytics_events'
      AND c.conname = 'analytics_events_event_type_check'
  ) THEN
    ALTER TABLE public.analytics_events
      ADD CONSTRAINT analytics_events_event_type_check
      CHECK (event_type IN (
        'view_listing',
        'click_listing',
        'tap_request_booking',
        'tap_whatsapp'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_analytics_events_business_created_at
  ON public.analytics_events (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_offering_created_at
  ON public.analytics_events (offering_id, created_at DESC)
  WHERE offering_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created_at
  ON public.analytics_events (event_type, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Allow any client (anon/authenticated) to INSERT events.
-- We intentionally do not allow SELECT/UPDATE/DELETE from clients (edge function provides aggregates).
GRANT INSERT ON public.analytics_events TO anon, authenticated;

DROP POLICY IF EXISTS "analytics_events_insert_any" ON public.analytics_events;
CREATE POLICY "analytics_events_insert_any"
  ON public.analytics_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    business_id IS NOT NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

