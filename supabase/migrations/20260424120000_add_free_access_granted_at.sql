-- Add free_access_granted_at to track when the subscription was cancelled at grant time.
-- Used to calculate remaining paid days correctly: remaining = prev_period_end - granted_at
-- Then on restore: restored = now + remaining
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS free_access_granted_at TIMESTAMPTZ;
