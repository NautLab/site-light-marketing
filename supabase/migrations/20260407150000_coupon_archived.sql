-- Add is_archived column to coupons table
ALTER TABLE public.coupons
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
