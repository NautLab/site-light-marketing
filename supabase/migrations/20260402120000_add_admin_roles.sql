-- Migration: Add admin role, free access, and Stripe fields to profiles
-- Date: 2026-04-02

-- 1. Add role column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin', 'super_admin'));

-- 2. Add free access fields
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS free_access BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS free_access_tier TEXT
    CHECK (free_access_tier IN ('basic', 'premium') OR free_access_tier IS NULL);

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS free_access_granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Add Stripe customer ID
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- 4. Index for role lookups (used heavily in RLS policies)
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_idx ON public.profiles(stripe_customer_id);

-- 5. Trigger: when free_access=true, keep subscription_tier in sync
CREATE OR REPLACE FUNCTION public.sync_free_access_tier()
RETURNS TRIGGER AS $$
BEGIN
    -- When granting free access, update subscription_tier
    IF NEW.free_access = true AND NEW.free_access_tier IS NOT NULL THEN
        NEW.subscription_tier := NEW.free_access_tier;
    END IF;
    -- When revoking free access, reset to 'free'
    IF NEW.free_access = false AND OLD.free_access = true THEN
        NEW.subscription_tier := 'free';
        NEW.free_access_tier := NULL;
        NEW.free_access_granted_by := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_free_access_tier_trigger
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_free_access_tier();
