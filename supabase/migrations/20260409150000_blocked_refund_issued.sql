-- Track whether a refund was issued while a user was blocked.
-- If true, access must NOT be restored upon unblock.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blocked_refund_issued BOOLEAN NOT NULL DEFAULT false;
