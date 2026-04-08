-- Add optional expiry date to free_access grants
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS free_access_expires_at TIMESTAMPTZ;
