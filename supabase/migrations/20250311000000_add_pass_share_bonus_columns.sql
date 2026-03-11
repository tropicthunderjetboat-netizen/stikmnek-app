-- StikmNek: Add share bonus columns to passes table
-- Run this migration if your passes table doesn't have max_people and share_bonus_applied.
-- The extend-pass edge function should update these when a user claims their share bonus.

-- Add max_people: capacity after share bonus (4->6 for daily/weekly, 7->8 for monthly)
ALTER TABLE passes
ADD COLUMN IF NOT EXISTS max_people integer DEFAULT 4;

-- Add share_bonus_applied: whether user has claimed the share bonus
ALTER TABLE passes
ADD COLUMN IF NOT EXISTS share_bonus_applied boolean DEFAULT false;

-- Backfill: Set max_people from pass_type base values for existing rows
-- Family Explorer (daily): 4, Extended Group (weekly): 4, Ultimate Crew (monthly): 7
UPDATE passes
SET max_people = CASE
  WHEN pass_type = 'daily' THEN 4
  WHEN pass_type = 'weekly' THEN 4
  WHEN pass_type = 'monthly' THEN 7
  ELSE 4
END
WHERE max_people IS NULL;

COMMENT ON COLUMN passes.max_people IS 'People capacity after share bonus (4->6 for daily/weekly, 7->8 for monthly)';
COMMENT ON COLUMN passes.share_bonus_applied IS 'Whether user claimed share bonus (extends valid_until and max_people)';
