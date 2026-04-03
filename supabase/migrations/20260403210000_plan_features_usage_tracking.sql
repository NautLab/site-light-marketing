-- Migration: Plan features, unlocked screens and monthly usage tracking
-- Date: 2026-04-03

-- ─────────────────────────────────────────
-- PLANS: add monthly_limit and unlocked_screens
-- ─────────────────────────────────────────
ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS monthly_limit INTEGER,             -- NULL = unlimited
    ADD COLUMN IF NOT EXISTS unlocked_screens JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ─────────────────────────────────────────
-- PROFILES: add per-user monthly usage tracking
-- ─────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS monthly_usage_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS usage_month TEXT NOT NULL DEFAULT '';

-- Allow users to read their own updated profile columns
-- (existing RLS policies already cover this via "Users can view own profile")

-- Allow authenticated users to increment their own usage count
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'profiles'
          AND policyname = 'Users can update own usage'
    ) THEN
        CREATE POLICY "Users can update own usage" ON public.profiles
            FOR UPDATE
            USING (auth.uid() = id)
            WITH CHECK (auth.uid() = id);
    END IF;
END
$$;
