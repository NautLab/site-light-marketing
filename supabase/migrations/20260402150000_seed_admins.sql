-- Migration: Seed super_admin roles for known admin emails
-- Date: 2026-04-02
-- NOTE: Both users must be already registered before running this migration.

UPDATE public.profiles
SET role = 'super_admin'
WHERE email IN (
    'arthurhenriky.san@gmail.com',
    'mateus2002ns@gmail.com'
);
