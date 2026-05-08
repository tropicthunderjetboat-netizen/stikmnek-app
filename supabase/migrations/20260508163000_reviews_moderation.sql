-- Review moderation: allow admins to hide/unhide reviews (safer than hard delete).

ALTER TABLE IF EXISTS public.reviews
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS moderated_by uuid NULL,
  ADD COLUMN IF NOT EXISTS moderation_reason text NULL;

CREATE INDEX IF NOT EXISTS reviews_is_public_created_at_idx
  ON public.reviews (is_public, created_at DESC);

