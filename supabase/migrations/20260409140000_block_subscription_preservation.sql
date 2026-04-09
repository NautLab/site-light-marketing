-- Add fields to profiles to track block date and preserve subscription period upon blocking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_sub_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_sub_plan_id UUID;
