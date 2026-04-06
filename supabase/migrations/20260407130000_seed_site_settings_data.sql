-- Migration: Seed site_settings with actual company data from terms/policy pages

INSERT INTO public.site_settings (key, value) VALUES
    ('company_name', 'Light Marketing'),
    ('cnpj',         '54.910.242/0001-41'),
    ('phone',        '(37) 99155-7510'),
    ('email',        'llightmarketingoficial@gmail.com'),
    ('website',      'https://lightmarketing.com.br'),
    ('street',       'Praça Ana Rosa de São José'),
    ('number',       '46'),
    ('complement',   'Sala 201'),
    ('city',         'Nova Serrana'),
    ('state',        'MG'),
    ('zip',          '35520-063')
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = now();
