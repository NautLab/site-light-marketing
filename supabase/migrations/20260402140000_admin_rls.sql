-- Migration: Admin RLS policies
-- Date: 2026-04-02

-- ─────────────────────────────────────────
-- Helper: get current user's role (SECURITY DEFINER to avoid RLS recursion)
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ─────────────────────────────────────────
-- PROFILES: Admin read all
-- ─────────────────────────────────────────
CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (
        auth.uid() = id
        OR public.get_my_role() IN ('admin', 'super_admin')
    );

-- Drop the old select-own policy (replaced by the combined one above)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- ─────────────────────────────────────────
-- PROFILES: Admin update (respects role hierarchy)
-- ─────────────────────────────────────────
-- Admin can update any profile that is not super_admin tier;
-- super_admin can update any profile.
CREATE POLICY "Admins can update profiles"
    ON public.profiles FOR UPDATE
    USING (
        auth.uid() = id
        OR (
            public.get_my_role() = 'super_admin'
        )
        OR (
            public.get_my_role() = 'admin'
            AND role != 'super_admin'       -- admin cannot modify super_admin rows
        )
    )
    WITH CHECK (
        -- Prevent non-super_admin from assigning super_admin role
        (role != 'super_admin' OR public.get_my_role() = 'super_admin')
        -- Prevent non-super_admin from removing super_admin role from others
        AND (
            auth.uid() = id                 -- own profile: always allowed
            OR public.get_my_role() = 'super_admin'
            OR (public.get_my_role() = 'admin' AND role != 'super_admin')
        )
    );

-- Drop old update-own policy (replaced above)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- ─────────────────────────────────────────
-- SUBSCRIPTIONS: Admins can view all
-- ─────────────────────────────────────────
CREATE POLICY "Admins can view all subscriptions"
    ON public.subscriptions FOR SELECT
    USING (
        auth.uid() = user_id
        OR public.get_my_role() IN ('admin', 'super_admin')
    );

-- Drop the original user-own policy if it exists (replaced above)
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;

-- ─────────────────────────────────────────
-- PLANS: Admins can view all (including inactive)
-- ─────────────────────────────────────────
CREATE POLICY "Admins can view all plans"
    ON public.plans FOR SELECT
    USING (
        is_active = true
        OR public.get_my_role() IN ('admin', 'super_admin')
    );

-- Drop the public-active-only policy (replaced by the combined one above)
DROP POLICY IF EXISTS "Public can view active plans" ON public.plans;

-- ─────────────────────────────────────────
-- COUPONS: Admins can view all (including inactive)
-- ─────────────────────────────────────────
CREATE POLICY "Admins can view all coupons"
    ON public.coupons FOR SELECT
    USING (
        is_active = true
        OR public.get_my_role() IN ('admin', 'super_admin')
    );

-- Drop the public-active-only coupon policy (replaced above)
DROP POLICY IF EXISTS "Public can view active coupons" ON public.coupons;
