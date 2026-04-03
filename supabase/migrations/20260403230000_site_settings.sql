-- Migration: Create site_settings table for company/site data
-- Used in terms, policies, footer, etc.

CREATE TABLE IF NOT EXISTS public.site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read settings (public data)
CREATE POLICY "Public can read site_settings"
    ON public.site_settings FOR SELECT
    USING (true);

-- Only admins can update (via service_role in edge functions, or direct with admin RLS)
CREATE POLICY "Admins can manage site_settings"
    ON public.site_settings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'super_admin')
        )
    );

-- Seed default settings
INSERT INTO public.site_settings (key, value) VALUES
    ('company_name', 'Light Marketing'),
    ('cnpj', ''),
    ('address', ''),
    ('city', ''),
    ('state', ''),
    ('zip', ''),
    ('phone', ''),
    ('email', ''),
    ('website', '')
ON CONFLICT (key) DO NOTHING;
