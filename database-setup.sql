-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  StikmNek — Complete Database Setup Script                         ║
-- ║  Run this in your Supabase SQL Editor (https://supabase.com/dashboard) ║
-- ║  Project: hbaflbmfptobyfqbudrt                                     ║
-- ║  Generated: 2026-02-23                                             ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════
-- 0. EXTENSIONS
-- ═══════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════
-- 1. USER_PROFILES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'tourist' CHECK (role IN ('tourist', 'business', 'admin')),
  display_name  text,
  email         text,
  phone         text DEFAULT '',
  avatar_url    text,
  business_name       text,
  business_category   text,
  business_description text,
  business_location   text,
  business_phone      text,
  business_email      text,
  business_hours      text,
  home_country        text,
  travel_dates        text,
  onboarding_complete boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "user_profiles_select_own"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own profile
CREATE POLICY "user_profiles_insert_own"
  ON public.user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "user_profiles_update_own"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own profile
CREATE POLICY "user_profiles_delete_own"
  ON public.user_profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all profiles (for admin panel)
CREATE POLICY "user_profiles_admin_select_all"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
  );

-- Admins can update all profiles (role changes, etc.)
CREATE POLICY "user_profiles_admin_update_all"
  ON public.user_profiles FOR UPDATE
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

-- Public can read profiles for display (business info, display names)
CREATE POLICY "user_profiles_select_public_info"
  ON public.user_profiles FOR SELECT
  TO anon, authenticated
  USING (true);


CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);

-- ═══════════════════════════════════════════════════════════════
-- 2. BUSINESSES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.businesses (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            text NOT NULL,
  category        text NOT NULL DEFAULT 'dining',
  description     text,
  description_fr  text,
  description_bi  text,
  image           text DEFAULT '',
  rating          numeric(3,2) NOT NULL DEFAULT 0,
  review_count    integer NOT NULL DEFAULT 0,
  discount        text DEFAULT '',
  original_price  numeric(12,2) NOT NULL DEFAULT 0,
  deal_price      numeric(12,2) NOT NULL DEFAULT 0,
  location        text DEFAULT '',
  lat             numeric(10,7) DEFAULT 0,
  lng             numeric(11,7) DEFAULT 0,
  hours           text DEFAULT '',
  phone           text DEFAULT '',
  whatsapp_number text,
  tags            text[] DEFAULT '{}',
  featured        boolean NOT NULL DEFAULT false,
  active          boolean NOT NULL DEFAULT true,
  owner_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  super_star_count integer NOT NULL DEFAULT 0,
  map_url         text,
  website         text,
  discount_valid_from  date,
  discount_valid_until date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- Anyone can read active businesses
CREATE POLICY "businesses_select_all"
  ON public.businesses FOR SELECT
  USING (true);

-- Authenticated users can insert (edge function also inserts via service role)
CREATE POLICY "businesses_insert_auth"
  ON public.businesses FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Owner or admin can update their own business
CREATE POLICY "businesses_update_owner"
  ON public.businesses FOR UPDATE
  USING (auth.uid() = owner_id OR EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Admin can delete businesses
CREATE POLICY "businesses_delete_admin"
  ON public.businesses FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_businesses_category ON public.businesses(category);
CREATE INDEX IF NOT EXISTS idx_businesses_featured ON public.businesses(featured DESC);
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON public.businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_businesses_active ON public.businesses(active);

-- ═══════════════════════════════════════════════════════════════
-- 3. REVIEWS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.reviews (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name     text DEFAULT 'Anonymous',
  rating        integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment       text,
  has_super_star boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read reviews
CREATE POLICY "reviews_select_all"
  ON public.reviews FOR SELECT
  USING (true);

-- Authenticated users can insert reviews
CREATE POLICY "reviews_insert_auth"
  ON public.reviews FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Users can update their own reviews
CREATE POLICY "reviews_update_own"
  ON public.reviews FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own reviews, admins can delete any
CREATE POLICY "reviews_delete_own_or_admin"
  ON public.reviews FOR DELETE
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_reviews_business_id ON public.reviews(business_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 4. REVIEW_RESPONSES (business owner replies to reviews)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.review_responses (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id     uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  response      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;

-- Anyone can read review responses
CREATE POLICY "review_responses_select_all"
  ON public.review_responses FOR SELECT
  USING (true);

-- Authenticated users can insert (business owners respond via edge function)
CREATE POLICY "review_responses_insert_auth"
  ON public.review_responses FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Owner can update their response
CREATE POLICY "review_responses_update_own"
  ON public.review_responses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_review_responses_review_id ON public.review_responses(review_id);
CREATE INDEX IF NOT EXISTS idx_review_responses_business_id ON public.review_responses(business_id);

-- ═══════════════════════════════════════════════════════════════
-- 5. FAVORITES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.favorites (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, business_id)
);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- Users can read their own favorites
CREATE POLICY "favorites_select_own"
  ON public.favorites FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own favorites
CREATE POLICY "favorites_insert_own"
  ON public.favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own favorites
CREATE POLICY "favorites_delete_own"
  ON public.favorites FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_business_id ON public.favorites(business_id);

-- ═══════════════════════════════════════════════════════════════
-- 6. PASSES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.passes (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pass_type     text NOT NULL CHECK (pass_type IN ('daily', 'weekly', 'monthly')),
  active        boolean NOT NULL DEFAULT true,
  purchased_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  valid_from    date,
  valid_until   date,
  amount_paid   numeric(12,2) DEFAULT 0,
  currency      text DEFAULT 'USD',
  payment_provider text,
  payment_session_id text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.passes ENABLE ROW LEVEL SECURITY;

-- Users can read their own passes
CREATE POLICY "passes_select_own"
  ON public.passes FOR SELECT
  USING (auth.uid() = user_id);

-- Authenticated users can insert (payment flow creates passes)
CREATE POLICY "passes_insert_auth"
  ON public.passes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Users can update their own passes (e.g., deactivate)
CREATE POLICY "passes_update_own"
  ON public.passes FOR UPDATE
  USING (auth.uid() = user_id);

-- Admin can read all passes
CREATE POLICY "passes_select_admin"
  ON public.passes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_passes_user_id ON public.passes(user_id);
CREATE INDEX IF NOT EXISTS idx_passes_active ON public.passes(active);
CREATE INDEX IF NOT EXISTS idx_passes_expires_at ON public.passes(expires_at);

-- ═══════════════════════════════════════════════════════════════
-- 7. REDEMPTIONS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.redemptions (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  pass_id       uuid REFERENCES public.passes(id) ON DELETE SET NULL,
  saved_amount  numeric(12,2) NOT NULL DEFAULT 0,
  redeemed_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own redemptions
CREATE POLICY "redemptions_select_own"
  ON public.redemptions FOR SELECT
  USING (auth.uid() = user_id);

-- Authenticated users can insert redemptions
CREATE POLICY "redemptions_insert_auth"
  ON public.redemptions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Admin can read all redemptions
CREATE POLICY "redemptions_select_admin"
  ON public.redemptions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Business owners can read redemptions for their businesses
CREATE POLICY "redemptions_select_business_owner"
  ON public.redemptions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.businesses
    WHERE businesses.id = redemptions.business_id
      AND businesses.owner_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_redemptions_user_id ON public.redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_business_id ON public.redemptions(business_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_redeemed_at ON public.redemptions(redeemed_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 8. BUSINESS_PHOTOS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.business_photos (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   uuid NOT NULL,
  url           text NOT NULL,
  file_path     text,
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_main       boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_photos ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved photos; admins and uploaders can see all
CREATE POLICY "business_photos_select_public"
  ON public.business_photos FOR SELECT
  USING (
    status = 'approved'
    OR auth.uid() = uploaded_by
    OR EXISTS (
      SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Authenticated users can insert photos
CREATE POLICY "business_photos_insert_auth"
  ON public.business_photos FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Uploaders and admins can update photos
CREATE POLICY "business_photos_update_owner_or_admin"
  ON public.business_photos FOR UPDATE
  USING (
    auth.uid() = uploaded_by
    OR EXISTS (
      SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Uploaders and admins can delete photos
CREATE POLICY "business_photos_delete_owner_or_admin"
  ON public.business_photos FOR DELETE
  USING (
    auth.uid() = uploaded_by
    OR EXISTS (
      SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_business_photos_business_id ON public.business_photos(business_id);
CREATE INDEX IF NOT EXISTS idx_business_photos_status ON public.business_photos(status);

-- ═══════════════════════════════════════════════════════════════
-- 9. PENDING_BUSINESSES (submissions awaiting admin approval)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.pending_businesses (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name            text NOT NULL,
  category        text NOT NULL DEFAULT 'dining',
  description     text,
  discount        text DEFAULT '',
  original_price  numeric(12,2) DEFAULT 0,
  deal_price      numeric(12,2) DEFAULT 0,
  location        text DEFAULT '',
  phone           text DEFAULT '',
  email           text DEFAULT '',
  hours           text DEFAULT '',
  image           text DEFAULT '',
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes     text,
  map_url         text,
  website         text,
  discount_valid_from  date,
  discount_valid_until date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_businesses ENABLE ROW LEVEL SECURITY;

-- Owners can read their own submissions
CREATE POLICY "pending_businesses_select_own"
  ON public.pending_businesses FOR SELECT
  USING (auth.uid() = owner_id);

-- Admins can read all submissions
CREATE POLICY "pending_businesses_select_admin"
  ON public.pending_businesses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Authenticated users can insert submissions
CREATE POLICY "pending_businesses_insert_auth"
  ON public.pending_businesses FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Owners can update their own pending submissions
CREATE POLICY "pending_businesses_update_own"
  ON public.pending_businesses FOR UPDATE
  USING (auth.uid() = owner_id AND status = 'pending');

-- Admins can update any submission (approve/reject)
CREATE POLICY "pending_businesses_update_admin"
  ON public.pending_businesses FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_pending_businesses_status ON public.pending_businesses(status);
CREATE INDEX IF NOT EXISTS idx_pending_businesses_owner_id ON public.pending_businesses(owner_id);

-- ═══════════════════════════════════════════════════════════════
-- 10. PENDING_EDITS (business listing edit requests)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.pending_edits (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  owner_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changes       jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes   text DEFAULT '',
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz
);

ALTER TABLE public.pending_edits ENABLE ROW LEVEL SECURITY;

-- Owners can read their own edits
CREATE POLICY "pending_edits_select_own"
  ON public.pending_edits FOR SELECT
  USING (auth.uid() = owner_id);

-- Admins can read all edits
CREATE POLICY "pending_edits_select_admin"
  ON public.pending_edits FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Authenticated users can insert edits
CREATE POLICY "pending_edits_insert_auth"
  ON public.pending_edits FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Admins can update edits (approve/reject)
CREATE POLICY "pending_edits_update_admin"
  ON public.pending_edits FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_pending_edits_business_id ON public.pending_edits(business_id);
CREATE INDEX IF NOT EXISTS idx_pending_edits_status ON public.pending_edits(status);
CREATE INDEX IF NOT EXISTS idx_pending_edits_owner_id ON public.pending_edits(owner_id);

-- ═══════════════════════════════════════════════════════════════
-- 11. PAYMENT_SESSIONS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pass_type           text NOT NULL CHECK (pass_type IN ('daily', 'weekly', 'monthly')),
  amount              numeric(12,2) NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'USD',
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded')),
  provider            text DEFAULT 'paypal',
  provider_session_id text,
  provider_order_id   text,
  metadata            jsonb DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;

-- Users can read their own payment sessions
CREATE POLICY "payment_sessions_select_own"
  ON public.payment_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- Authenticated users can insert payment sessions
CREATE POLICY "payment_sessions_insert_auth"
  ON public.payment_sessions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Users can update their own sessions (e.g., status change)
CREATE POLICY "payment_sessions_update_own"
  ON public.payment_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can read all payment sessions
CREATE POLICY "payment_sessions_select_admin"
  ON public.payment_sessions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Admins can update any payment session
CREATE POLICY "payment_sessions_update_admin"
  ON public.payment_sessions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_payment_sessions_user_id ON public.payment_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_status ON public.payment_sessions(status);

-- ═══════════════════════════════════════════════════════════════
-- 12. NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.notifications (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type              text NOT NULL DEFAULT 'info',
  title             text NOT NULL,
  message           text NOT NULL,
  link_view         text,
  link_business_id  text,
  is_read           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- System/edge functions insert notifications (service role); users can also insert
CREATE POLICY "notifications_insert_auth"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Users can update their own notifications (mark as read)
CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 13. FEEDBACK
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.feedback (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email    text,
  user_name     text,
  type          text DEFAULT 'other',
  message       text NOT NULL,
  rating        integer,
  page          text,
  user_agent    text,
  screen_size   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Anyone can insert feedback (including anonymous users)
CREATE POLICY "feedback_insert_all"
  ON public.feedback FOR INSERT
  WITH CHECK (true);

-- Admins can read all feedback
CREATE POLICY "feedback_select_admin"
  ON public.feedback FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Users can read their own feedback
CREATE POLICY "feedback_select_own"
  ON public.feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 14. SUPPORT_TICKETS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email    text NOT NULL,
  user_name     text DEFAULT 'Anonymous',
  subject       text NOT NULL,
  description   text NOT NULL,
  category      text DEFAULT 'general',
  priority      text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  admin_notes   text,
  resolution    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Users can read their own tickets
CREATE POLICY "support_tickets_select_own"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all tickets
CREATE POLICY "support_tickets_select_admin"
  ON public.support_tickets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Anyone can insert tickets (including anonymous)
CREATE POLICY "support_tickets_insert_all"
  ON public.support_tickets FOR INSERT
  WITH CHECK (true);

-- Admins can update any ticket
CREATE POLICY "support_tickets_update_admin"
  ON public.support_tickets FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Users can update their own tickets
CREATE POLICY "support_tickets_update_own"
  ON public.support_tickets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);

-- ═══════════════════════════════════════════════════════════════
-- 15. TICKET_RESPONSES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ticket_responses (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id       uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  responder_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responder_name  text DEFAULT 'System',
  responder_type  text DEFAULT 'user' CHECK (responder_type IN ('user', 'admin', 'system')),
  message         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_responses ENABLE ROW LEVEL SECURITY;

-- Users can read responses for their own tickets
CREATE POLICY "ticket_responses_select_own"
  ON public.ticket_responses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.support_tickets
    WHERE support_tickets.id = ticket_responses.ticket_id
      AND support_tickets.user_id = auth.uid()
  ));

-- Admins can read all responses
CREATE POLICY "ticket_responses_select_admin"
  ON public.ticket_responses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Authenticated users can insert responses
CREATE POLICY "ticket_responses_insert_auth"
  ON public.ticket_responses FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_ticket_responses_ticket_id ON public.ticket_responses(ticket_id);

-- ═══════════════════════════════════════════════════════════════
-- 16. ERROR_LOGS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.error_logs (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid,
  error_type    text NOT NULL,
  error_message text NOT NULL,
  error_stack   text,
  component     text,
  page_url      text,
  user_agent    text,
  metadata      jsonb DEFAULT '{}',
  severity      text DEFAULT 'error' CHECK (severity IN ('warning', 'error', 'critical')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Anyone can insert error logs (including anonymous users for error tracking)
CREATE POLICY "error_logs_insert_all"
  ON public.error_logs FOR INSERT
  WITH CHECK (true);

-- Admins can read all error logs
CREATE POLICY "error_logs_select_admin"
  ON public.error_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON public.error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON public.error_logs(error_type);

-- ═══════════════════════════════════════════════════════════════
-- 17. REFERRALS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.referrals (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code   text NOT NULL,
  referred_email  text,
  referred_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed_up', 'purchased', 'rewarded')),
  reward_amount   numeric(12,2) DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Users can read their own referrals
CREATE POLICY "referrals_select_own"
  ON public.referrals FOR SELECT
  USING (auth.uid() = referrer_id);

-- Authenticated users can insert referrals
CREATE POLICY "referrals_insert_auth"
  ON public.referrals FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Admins can read all referrals
CREATE POLICY "referrals_select_admin"
  ON public.referrals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referral_code ON public.referrals(referral_code);

-- ═══════════════════════════════════════════════════════════════
-- 18. SEARCH_HISTORY
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.search_history (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query         text NOT NULL,
  results_count integer DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

-- Users can read their own search history
CREATE POLICY "search_history_select_own"
  ON public.search_history FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own search history
CREATE POLICY "search_history_insert_own"
  ON public.search_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own search history
CREATE POLICY "search_history_delete_own"
  ON public.search_history FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON public.search_history(user_id);

-- ═══════════════════════════════════════════════════════════════
-- 19. SOCIAL_ACTIVITY (community feed)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.social_activity (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name     text DEFAULT 'Anonymous',
  activity_type text NOT NULL DEFAULT 'redemption',
  business_name text,
  business_id   uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  category      text,
  amount_saved  numeric(12,2) DEFAULT 0,
  message       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_activity ENABLE ROW LEVEL SECURITY;

-- Anyone can read social activity (it's a public feed)
CREATE POLICY "social_activity_select_all"
  ON public.social_activity FOR SELECT
  USING (true);

-- Authenticated users can insert activity
CREATE POLICY "social_activity_insert_auth"
  ON public.social_activity FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_social_activity_created_at ON public.social_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_activity_type ON public.social_activity(activity_type);

-- ═══════════════════════════════════════════════════════════════
-- 20. HELPER FUNCTION: auto-update updated_at timestamp
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to tables that have an updated_at column
CREATE TRIGGER set_updated_at_user_profiles
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_businesses
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_pending_businesses
  BEFORE UPDATE ON public.pending_businesses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_payment_sessions
  BEFORE UPDATE ON public.payment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_support_tickets
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ═══════════════════════════════════════════════════════════════
-- 20b. AUTO-CREATE USER PROFILE ON SIGNUP (SECURITY DEFINER)
-- ═══════════════════════════════════════════════════════════════
-- This trigger function runs as the DB owner (bypasses RLS) and
-- auto-creates a user_profiles row whenever a new auth user is created.
-- This is the industry-standard Supabase pattern for profile creation.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
  _user_type text;
  _role text;
BEGIN
  _name := COALESCE(
    NEW.raw_user_meta_data ->> 'name',
    NEW.raw_user_meta_data ->> 'full_name',
    split_part(NEW.email, '@', 1)
  );

  _user_type := COALESCE(
    NEW.raw_user_meta_data ->> 'user_type',
    'tourist'
  );

  IF _user_type NOT IN ('tourist', 'business', 'admin') THEN
    _user_type := 'tourist';
  END IF;

  _role := _user_type;

  INSERT INTO public.user_profiles (
    user_id, role, display_name, email, onboarding_complete, created_at, updated_at
  ) VALUES (
    NEW.id, _role, _name, NEW.email,
    CASE WHEN _role = 'business' THEN false ELSE true END,
    now(), now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger: fires after a new user is created in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();



-- ═══════════════════════════════════════════════════════════════
-- 21. HELPER FUNCTION: auto-update business rating & review_count
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_business_rating()
RETURNS TRIGGER AS $$
DECLARE
  avg_rating numeric;
  total_reviews integer;
BEGIN
  SELECT
    COALESCE(AVG(rating), 0),
    COUNT(*)
  INTO avg_rating, total_reviews
  FROM public.reviews
  WHERE business_id = COALESCE(NEW.business_id, OLD.business_id);

  UPDATE public.businesses
  SET
    rating = ROUND(avg_rating, 2),
    review_count = total_reviews,
    updated_at = now()
  WHERE id = COALESCE(NEW.business_id, OLD.business_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_business_rating_on_review
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_business_rating();

-- ═══════════════════════════════════════════════════════════════
-- 22. ENABLE REALTIME for key tables
-- ═══════════════════════════════════════════════════════════════
-- The app subscribes to realtime changes on these tables:
ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE public.businesses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_businesses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.social_activity;

-- ═══════════════════════════════════════════════════════════════
-- 23. STORAGE BUCKET for business photos
-- ═══════════════════════════════════════════════════════════════
-- Note: Run this separately if it fails (bucket may already exist)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-photos',
  'business-photos',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for business-photos bucket
CREATE POLICY "business_photos_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-photos');

CREATE POLICY "business_photos_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'business-photos' AND auth.role() = 'authenticated');

CREATE POLICY "business_photos_storage_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'business-photos' AND auth.role() = 'authenticated');

CREATE POLICY "business_photos_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'business-photos' AND auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════
-- 24. SEED DATA: Insert the 16 default businesses
-- ═══════════════════════════════════════════════════════════════
-- These match the hardcoded fallback data in src/data/businesses.ts
-- so the app displays real DB data instead of falling back to hardcoded.

INSERT INTO public.businesses (id, name, category, description, description_fr, description_bi, image, rating, review_count, discount, original_price, deal_price, location, lat, lng, hours, phone, tags, featured)
VALUES
  ('b1', 'Waterfront Bar & Grill', 'dining', 'Enjoy fresh seafood with stunning harbour views. Our signature coconut crab is a must-try!', 'Savourez des fruits de mer frais avec une vue imprenable sur le port.', 'Enjoem fres sifud wetem nambawan viu blong haba.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856900792_67ead30b.jpg', 4.8, 124, '25% OFF', 5500, 4125, 'Seafront, Port Vila', -17.7416, 168.3120, '11:00 AM - 10:00 PM', '+678 22345', ARRAY['seafood', 'waterfront', 'dinner'], true),
  ('b2', 'Nambawan Café', 'dining', 'Authentic Melanesian cuisine meets modern flavors.', 'La cuisine mélanésienne authentique rencontre les saveurs modernes.', 'Tru Melanesian kakae i mitim modern flavas.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856911430_8432056a.png', 4.6, 89, '20% OFF', 3500, 2800, 'Main Street, Port Vila', -17.7390, 168.3110, '7:00 AM - 9:00 PM', '+678 23456', ARRAY['local cuisine', 'breakfast', 'lunch'], true),
  ('b3', 'Tropical Breeze Restaurant', 'dining', 'Fine dining with a tropical twist.', 'Gastronomie avec une touche tropicale.', 'Nambawan kakae wetem tropikal tanis.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856910655_1d6c7b2d.png', 4.9, 201, '30% OFF', 8500, 5950, 'Iririki Island Resort', -17.7450, 168.3050, '6:00 PM - 11:00 PM', '+678 24567', ARRAY['fine dining', 'fusion', 'romantic'], true),
  ('b4', 'Vila Sunset Lounge', 'dining', 'Cocktails and tapas with the best sunset views.', 'Cocktails et tapas avec les meilleures vues du coucher de soleil.', 'Koktels mo tapas wetem beswan sunset viu.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856918924_80900148.png', 4.5, 67, '15% OFF', 4500, 3825, 'Erakor Lagoon', -17.7520, 168.3200, '4:00 PM - 12:00 AM', '+678 25678', ARRAY['cocktails', 'sunset', 'live music'], false),
  ('b5', 'Blue Lagoon Snorkeling', 'activities', 'Explore vibrant coral reefs and swim with tropical fish.', 'Explorez des récifs coralliens vibrants.', 'Eksploarem nambawan korel rif.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856938935_27ebc816.png', 4.9, 312, '35% OFF', 10000, 6500, 'Blue Lagoon, Efate', -17.6800, 168.3500, '8:00 AM - 4:00 PM', '+678 26789', ARRAY['snorkeling', 'marine life', 'adventure'], true),
  ('b6', 'Vanuatu Kayak Adventures', 'activities', 'Paddle through mangroves and hidden coves.', 'Pagayez à travers les mangroves.', 'Padol tru mangrov mo haed kof.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856947762_e1259494.png', 4.7, 156, '20% OFF', 7000, 5600, 'Mele Bay', -17.7100, 168.2800, '7:00 AM - 6:00 PM', '+678 27890', ARRAY['kayaking', 'nature', 'sunset'], false),
  ('b7', 'Hideaway Island Diving', 'activities', 'Discover the underwater post office and marine sanctuary.', 'Découvrez le bureau de poste sous-marin.', 'Faenem andawota pos ofis.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856935987_2414e599.jpg', 4.8, 245, '25% OFF', 15000, 11250, 'Hideaway Island', -17.7150, 168.2650, '8:00 AM - 5:00 PM', '+678 28901', ARRAY['diving', 'PADI', 'marine sanctuary'], true),
  ('b8', 'Cascade Waterfall Trek', 'activities', 'Guided jungle trek to the stunning Mele Cascades.', 'Randonnée guidée dans la jungle.', 'Gaeded jangol trek go long Mele Cascades.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856951990_2d695c38.png', 4.6, 189, '15% OFF', 5000, 4250, 'Mele Village', -17.7000, 168.2900, '8:00 AM - 3:00 PM', '+678 29012', ARRAY['trekking', 'waterfall', 'nature'], false),
  ('b9', 'Ekasup Cultural Village', 'tours', 'Experience authentic Ni-Vanuatu culture.', 'Vivez la culture authentique Ni-Vanuatu.', 'Eksperiens tru Ni-Vanuatu kalsa.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856976443_5ee434da.png', 4.9, 278, '20% OFF', 6500, 5200, 'Ekasup Village', -17.7350, 168.2950, '9:00 AM - 4:00 PM', '+678 30123', ARRAY['culture', 'traditional', 'kava'], true),
  ('b10', 'Port Vila Heritage Walk', 'tours', 'Discover the colonial history and vibrant markets.', E'Découvrez l''histoire coloniale et les marchés vibrants.', 'Faenem kolonial histri mo nambawan maket.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856985705_805475fe.png', 4.5, 134, '10% OFF', 4500, 4050, 'Port Vila Town', -17.7380, 168.3140, '8:00 AM - 12:00 PM', '+678 31234', ARRAY['history', 'walking tour', 'markets'], false),
  ('b11', 'Tanna Volcano Day Trip', 'tours', 'Fly to Tanna and witness Mount Yasur active volcano.', E'Envolez-vous vers Tanna et admirez le volcan actif.', 'Flae go long Tanna mo lukim Mount Yasur volkeno.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856973624_1b887f4a.jpg', 4.9, 356, '15% OFF', 45000, 38250, 'Tanna Island', -19.5300, 169.4400, 'Departs 7:00 AM', '+678 32345', ARRAY['volcano', 'adventure', 'day trip'], true),
  ('b12', 'Chief Roi Mata Tour', 'tours', 'Visit the UNESCO World Heritage site.', E'Visitez le site du patrimoine mondial de l''UNESCO.', 'Visitim UNESCO World Heritage saet.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856981439_d4c47fd2.png', 4.7, 198, '20% OFF', 9500, 7600, 'North Efate', -17.6500, 168.3800, '9:00 AM - 3:00 PM', '+678 33456', ARRAY['UNESCO', 'heritage', 'history'], false),
  ('b13', 'Erakor Island Spa', 'spa', 'Luxury spa treatments using local volcanic mud and coconut oil.', 'Soins spa de luxe utilisant de la boue volcanique locale.', 'Lakseri spa tritmen wetem lokal volkenik mad.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770857000182_f55ad882.jpg', 4.8, 167, '30% OFF', 12000, 8400, 'Erakor Island', -17.7550, 168.3250, '9:00 AM - 7:00 PM', '+678 34567', ARRAY['spa', 'massage', 'relaxation'], true),
  ('b14', 'Paradise Cove Resort', 'accommodation', 'Beachfront bungalows with private beach access.', E'Bungalows en bord de mer avec accès privé.', 'Bichfron bangalo wetem praevet bich akses.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770856999889_357acdad.jpg', 4.7, 223, '25% OFF', 23000, 17250, 'North Shore, Efate', -17.6700, 168.3600, 'Check-in: 2:00 PM', '+678 35678', ARRAY['resort', 'beachfront', 'luxury'], true),
  ('b15', 'Vanuatu Handicraft Market', 'shopping', 'Authentic handmade crafts, wood carvings, and traditional textiles.', 'Artisanat authentique fait main.', 'Tru handmade kraft, wud kavin.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770857002898_1909faf0.jpg', 4.4, 98, '15% OFF', 3000, 2550, 'Central Market, Port Vila', -17.7400, 168.3160, '7:00 AM - 5:00 PM', '+678 36789', ARRAY['crafts', 'souvenirs', 'local art'], false),
  ('b16', 'Coconut Palms Wellness', 'spa', 'Traditional Melanesian healing combined with modern wellness.', 'Guérison mélanésienne traditionnelle combinée au bien-être moderne.', 'Tradisonal Melanesian hilin kombaenem wetem modern welnes.', 'https://d64gsuwffb70l.cloudfront.net/698d2153e3f311f6bf471393_1770857004548_0b22487d.jpg', 4.6, 112, '20% OFF', 7500, 6000, 'Vila Bay', -17.7480, 168.3080, '6:00 AM - 8:00 PM', '+678 37890', ARRAY['yoga', 'wellness', 'meditation'], false)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 25. SEED DATA: Insert sample reviews
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.reviews (id, business_id, user_name, rating, comment, created_at)
VALUES
  ('r1', 'b1', 'Sarah M.', 5, 'Absolutely incredible seafood! The coconut crab was the best I''ve ever had.', '2026-02-01T10:00:00Z'),
  ('r2', 'b1', 'Jean-Pierre L.', 5, 'Magnifique! Le poisson était parfaitement préparé.', '2026-01-28T14:00:00Z'),
  ('r3', 'b5', 'Mike T.', 5, 'Best snorkeling experience of my life!', '2026-02-05T09:00:00Z'),
  ('r4', 'b9', 'Emma W.', 5, 'Such an authentic cultural experience.', '2026-01-30T11:00:00Z'),
  ('r5', 'b11', 'David K.', 5, 'Mount Yasur is absolutely breathtaking.', '2026-02-08T08:00:00Z'),
  ('r6', 'b13', 'Lisa R.', 4, 'The volcanic mud treatment was amazing.', '2026-02-03T15:00:00Z'),
  ('r7', 'b3', 'Tom H.', 5, 'Fine dining at its best.', '2026-01-25T19:00:00Z'),
  ('r8', 'b7', 'Anna S.', 5, 'The underwater post office is so unique!', '2026-02-10T10:00:00Z')
ON CONFLICT (id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════
-- DONE! Your database is now fully set up.
-- ═══════════════════════════════════════════════════════════════
-- 
-- Tables created (19 total):
--   1.  user_profiles        - User accounts & roles
--   2.  businesses           - Business listings
--   3.  reviews              - Business reviews
--   4.  review_responses     - Business owner replies to reviews
--   5.  favorites            - User saved/favorited businesses
--   6.  passes               - Purchased discount passes
--   7.  redemptions          - Deal redemptions
--   8.  business_photos      - Uploaded business photos
--   9.  pending_businesses   - Business submissions awaiting approval
--   10. pending_edits        - Listing edit requests
--   11. payment_sessions     - Payment tracking
--   12. notifications        - User notifications
--   13. feedback             - User feedback & bug reports
--   14. support_tickets      - Support ticket system
--   15. ticket_responses     - Support ticket replies
--   16. error_logs           - Frontend error tracking
--   17. referrals            - Referral program
--   18. search_history       - User search history
--   19. social_activity      - Community activity feed
--
-- Also includes:
--   - RLS policies for all tables
--   - Indexes for performance
--   - Auto-update triggers for updated_at columns
--   - Auto-update trigger for business rating/review_count
--   - Realtime enabled for key tables
--   - Storage bucket for business photos
--   - Seed data: 16 businesses + 8 reviews
-- ═══════════════════════════════════════════════════════════════
