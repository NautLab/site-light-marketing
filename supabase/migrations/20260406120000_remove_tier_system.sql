-- ══════════════════════════════════════════════════════════════
-- Migration: Remove tier classification from the system
-- Replace with plan-based access (free_access_plan_id)
-- ══════════════════════════════════════════════════════════════

-- 1. Drop ALL constraints first
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_free_access_tier_check;
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_tier_check;
ALTER TABLE public.marketplace_tools DROP CONSTRAINT IF EXISTS marketplace_tools_required_tier_check;

-- 2. Add new columns before updating data
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS free_access_plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL;

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false;

-- 3. Update trigger BEFORE updating data (prevents old trigger from resetting values)
CREATE OR REPLACE FUNCTION public.sync_free_access_tier()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.free_access = true AND NEW.free_access_plan_id IS NOT NULL THEN
        NEW.subscription_tier := 'paid';
    END IF;
    IF NEW.free_access = false AND OLD.free_access = true THEN
        NEW.subscription_tier := 'free';
        NEW.free_access_tier := NULL;
        NEW.free_access_plan_id := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Mark free plan
UPDATE public.plans SET is_free = true WHERE tier = 'free';

-- 5. Backfill free_access_plan_id from free_access_tier
UPDATE public.profiles p
SET free_access_plan_id = (
    SELECT id FROM public.plans
    WHERE tier = p.free_access_tier AND is_active = true AND is_archived = false
    ORDER BY created_at LIMIT 1
)
WHERE p.free_access = true AND p.free_access_tier IS NOT NULL AND p.free_access_plan_id IS NULL;

-- 6. Update subscription_tier: anything not 'free' or 'paid' becomes 'paid'
UPDATE public.profiles SET subscription_tier = 'paid'
    WHERE subscription_tier NOT IN ('free', 'paid') AND subscription_tier IS NOT NULL;

-- 7. NOW add the new constraint (all data is clean)
ALTER TABLE public.profiles ADD CONSTRAINT profiles_subscription_tier_check
    CHECK (subscription_tier IN ('free', 'paid'));
