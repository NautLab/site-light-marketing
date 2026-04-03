-- Migration: Add annual pricing columns to plans table
-- Allows a single plan row to hold both monthly AND annual pricing

ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS annual_price_brl NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS annual_stripe_price_id TEXT,
    ADD COLUMN IF NOT EXISTS annual_observation TEXT;

-- Update tier constraint to include 'free'
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_tier_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_tier_check CHECK (tier IN ('free', 'basic', 'premium'));
