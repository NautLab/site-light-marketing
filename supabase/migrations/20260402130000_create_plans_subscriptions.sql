-- Migration: Create plans, subscriptions, and coupons tables
-- Date: 2026-04-02

-- ─────────────────────────────────────────
-- PLANS table (created/managed via admin panel + Stripe)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    tier TEXT NOT NULL CHECK (tier IN ('basic', 'premium')),
    price_brl NUMERIC(10, 2) NOT NULL,
    interval TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year')),
    stripe_product_id TEXT UNIQUE,
    stripe_price_id TEXT UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- SUBSCRIPTIONS table (managed by Stripe webhooks)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
    stripe_subscription_id TEXT UNIQUE,
    stripe_customer_id TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid', 'trialing', 'incomplete')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- COUPONS table (managed via admin panel + Stripe)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    stripe_coupon_id TEXT UNIQUE,
    stripe_promotion_code_id TEXT UNIQUE,
    code TEXT NOT NULL UNIQUE,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value NUMERIC(10, 2) NOT NULL,
    duration TEXT NOT NULL DEFAULT 'once' CHECK (duration IN ('once', 'repeating', 'forever')),
    duration_in_months INTEGER,                  -- only for 'repeating'
    max_redemptions INTEGER,                     -- NULL = unlimited
    times_redeemed INTEGER NOT NULL DEFAULT 0,
    redeem_by TIMESTAMPTZ,                       -- expiration date
    applies_to_tier TEXT CHECK (applies_to_tier IN ('basic', 'premium') OR applies_to_tier IS NULL),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_stripe_sub_idx ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS coupons_code_idx ON public.coupons(code);

-- ─────────────────────────────────────────
-- TRIGGERS: auto-update updated_at
-- ─────────────────────────────────────────
CREATE TRIGGER update_plans_updated_at
    BEFORE UPDATE ON public.plans
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_coupons_updated_at
    BEFORE UPDATE ON public.coupons
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────
-- RLS: Enable on all tables
-- ─────────────────────────────────────────
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Plans: anyone can read active plans
CREATE POLICY "Public can view active plans"
    ON public.plans FOR SELECT
    USING (is_active = true);

-- Plans: only admins can manage (writes go through Edge Functions with service_role)
-- (Edge Functions bypass RLS via service_role)

-- Subscriptions: users can see only their own
CREATE POLICY "Users can view own subscription"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id);

-- Coupons: active coupons are public (needed for checkout validation)
CREATE POLICY "Public can view active coupons"
    ON public.coupons FOR SELECT
    USING (is_active = true);

-- ─────────────────────────────────────────
-- Seed test data (will be manageable via admin panel)
-- ─────────────────────────────────────────
INSERT INTO public.plans (name, description, tier, price_brl, interval, is_active, display_order)
VALUES
    ('Básico', 'Ideal para vendedores iniciantes. Até 500 etiquetas por mês.', 'basic', 29.90, 'month', true, 1),
    ('Premium', 'Para vendedores profissionais. Etiquetas ilimitadas + todos os marketplaces.', 'premium', 59.90, 'month', true, 2)
ON CONFLICT DO NOTHING;
