-- Migration: Fix plans.tier NOT NULL constraint and ensure free plan exists
-- The tier column was kept from the original schema but its CHECK constraint was
-- dropped in the remove_tier_system migration. The column itself must be made
-- nullable so new plans can be inserted without it.

-- 1. Make tier column nullable (and remove any stale default)
ALTER TABLE public.plans
    ALTER COLUMN tier DROP NOT NULL;

ALTER TABLE public.plans
    ALTER COLUMN tier SET DEFAULT NULL;

-- 2. Ensure a free plan exists (creates one only if none has is_free = true)
INSERT INTO public.plans (
    name,
    description,
    tier,
    price_brl,
    interval,
    is_active,
    is_free,
    display_order,
    unlocked_screens,
    monthly_limit
)
SELECT
    'Free',
    'Para quem está começando. Experimente sem compromisso.',
    NULL,
    0.00,
    'month',
    true,
    true,
    0,
    '["shopee","tiktok"]'::jsonb,
    50
WHERE NOT EXISTS (
    SELECT 1 FROM public.plans WHERE is_free = true
);
