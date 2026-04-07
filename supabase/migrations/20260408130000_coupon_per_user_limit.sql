-- Migration: Add per-user coupon limit, redemption tracking, and subscription billing_interval

-- Per-user limit column on coupons
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_redemptions_per_user INTEGER;

-- Track individual coupon redemptions
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_checkout_session_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_user_idx
    ON public.coupon_redemptions(coupon_id, user_id);

-- Enable RLS
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own redemptions (needed for per-user limit check)
CREATE POLICY "Users can read own redemptions"
    ON public.coupon_redemptions FOR SELECT
    USING (auth.uid() = user_id);

-- Service role inserts (webhook) bypass RLS automatically

-- Billing interval on subscriptions (month / year)
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'month';
