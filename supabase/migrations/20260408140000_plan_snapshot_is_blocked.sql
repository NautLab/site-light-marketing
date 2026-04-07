-- Add plan_name_snapshot to subscriptions (stores plan name at time of subscription)
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_name_snapshot TEXT;

-- Add is_blocked to profiles (prevents login when true)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
