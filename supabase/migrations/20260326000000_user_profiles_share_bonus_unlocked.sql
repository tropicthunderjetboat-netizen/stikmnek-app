-- StikmNek: Allow share bonus to be unlocked before pass purchase
-- This enables: user shares first → bonus is applied automatically during pass purchase.

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS share_bonus_unlocked boolean DEFAULT false;

COMMENT ON COLUMN user_profiles.share_bonus_unlocked IS 'If true, next pass purchase will apply share bonus and then clear this flag.';

