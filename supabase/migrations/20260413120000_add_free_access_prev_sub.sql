-- Migration: store the subscription period that was canceled when granting free_access
-- These fields are used to give back "remaining days" when free_access is revoked
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS free_access_prev_period_end TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS free_access_prev_plan_id    UUID        DEFAULT NULL;
