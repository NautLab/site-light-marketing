-- Migration: Split address field into street, number, complement
-- Replaces the single 'address' key with three separate keys

-- Remove old address key
DELETE FROM public.site_settings WHERE key = 'address';

-- Insert new address fields (if not already present)
INSERT INTO public.site_settings (key, value) VALUES
    ('street',     ''),
    ('number',     ''),
    ('complement', '')
ON CONFLICT (key) DO NOTHING;
