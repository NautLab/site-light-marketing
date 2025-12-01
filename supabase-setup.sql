-- =============================================
-- LIGHT MARKETING - SUPABASE DATABASE SETUP
-- =============================================
-- Execute este script no Supabase SQL Editor
-- Dashboard: https://supabase.com/dashboard/org/fshjwdffgjpzletnfugw

-- =============================================
-- 1. TABELA DE PERFIS DE USUÁRIOS
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'basic', 'premium')),
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'trialing')),
    subscription_start_date TIMESTAMPTZ,
    subscription_end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Usuários podem ver seu próprio perfil"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Usuários podem atualizar seu próprio perfil"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Trigger para criar perfil automaticamente ao registrar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 2. TABELA DE USO DA FERRAMENTA
-- =============================================
CREATE TABLE IF NOT EXISTS public.usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    process_type TEXT NOT NULL CHECK (process_type IN ('correios', 'xpress')),
    pdf_filename TEXT,
    xlsx_filename TEXT,
    files_processed INTEGER DEFAULT 1,
    processing_time_ms INTEGER,
    status TEXT DEFAULT 'success' CHECK (status IN ('success', 'error', 'pending')),
    error_message TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Usuários podem ver seus próprios logs"
    ON public.usage_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar seus próprios logs"
    ON public.usage_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Índices para performance
CREATE INDEX idx_usage_logs_user_id ON public.usage_logs(user_id);
CREATE INDEX idx_usage_logs_created_at ON public.usage_logs(created_at DESC);

-- =============================================
-- 3. TABELA DE LIMITES DE USO
-- =============================================
CREATE TABLE IF NOT EXISTS public.usage_limits (
    tier TEXT PRIMARY KEY CHECK (tier IN ('free', 'basic', 'premium')),
    monthly_limit INTEGER NOT NULL,
    price_monthly_cents INTEGER NOT NULL,
    features JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir limites padrão
INSERT INTO public.usage_limits (tier, monthly_limit, price_monthly_cents, features)
VALUES 
    ('free', 5, 0, '["5 processamentos por mês", "Suporte por email", "Correios e Xpress"]'::jsonb),
    ('basic', 50, 1999, '["50 processamentos por mês", "Suporte prioritário", "Correios e Xpress", "Histórico de 30 dias"]'::jsonb),
    ('premium', -1, 4999, '["Processamentos ilimitados", "Suporte VIP 24/7", "Correios e Xpress", "Histórico completo", "API de acesso", "Processamento em lote"]'::jsonb)
ON CONFLICT (tier) DO NOTHING;

-- Políticas de acesso (leitura pública)
ALTER TABLE public.usage_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Limites são públicos"
    ON public.usage_limits FOR SELECT
    TO PUBLIC
    USING (true);

-- =============================================
-- 4. FUNÇÃO PARA VERIFICAR LIMITE DE USO
-- =============================================
CREATE OR REPLACE FUNCTION public.check_usage_limit(p_user_id UUID)
RETURNS TABLE(
    can_process BOOLEAN,
    current_usage INTEGER,
    monthly_limit INTEGER,
    tier TEXT
) AS $$
DECLARE
    v_tier TEXT;
    v_limit INTEGER;
    v_usage INTEGER;
    v_start_date TIMESTAMPTZ;
BEGIN
    -- Buscar tier e data de início do período
    SELECT 
        p.subscription_tier,
        COALESCE(p.subscription_start_date, p.created_at)
    INTO v_tier, v_start_date
    FROM public.profiles p
    WHERE p.id = p_user_id;

    -- Buscar limite mensal
    SELECT ul.monthly_limit
    INTO v_limit
    FROM public.usage_limits ul
    WHERE ul.tier = v_tier;

    -- Calcular uso no mês atual (desde data de início ou início do mês)
    SELECT COUNT(*)::INTEGER
    INTO v_usage
    FROM public.usage_logs
    WHERE user_id = p_user_id
        AND created_at >= DATE_TRUNC('month', NOW())
        AND created_at >= v_start_date
        AND status = 'success';

    -- Retornar resultado
    RETURN QUERY SELECT 
        (v_limit = -1 OR v_usage < v_limit) as can_process,
        v_usage as current_usage,
        v_limit as monthly_limit,
        v_tier as tier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 5. FUNÇÃO PARA ATUALIZAR updated_at
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_profiles
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_usage_limits
    BEFORE UPDATE ON public.usage_limits
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- 6. VIEW PARA ESTATÍSTICAS DE USO
-- =============================================
CREATE OR REPLACE VIEW public.user_usage_stats AS
SELECT 
    p.id as user_id,
    p.email,
    p.subscription_tier,
    ul.monthly_limit,
    COUNT(ug.id) FILTER (WHERE ug.created_at >= DATE_TRUNC('month', NOW())) as usage_this_month,
    COUNT(ug.id) as total_usage,
    MAX(ug.created_at) as last_used_at
FROM public.profiles p
LEFT JOIN public.usage_limits ul ON p.subscription_tier = ul.tier
LEFT JOIN public.usage_logs ug ON p.id = ug.user_id AND ug.status = 'success'
GROUP BY p.id, p.email, p.subscription_tier, ul.monthly_limit;

-- Políticas para a view
ALTER VIEW public.user_usage_stats SET (security_invoker = true);

-- =============================================
-- 7. TABELA DE WEBHOOKS DO STRIPE
-- =============================================
CREATE TABLE IF NOT EXISTS public.stripe_webhooks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    customer_id TEXT,
    subscription_id TEXT,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_stripe_webhooks_event_id ON public.stripe_webhooks(event_id);
CREATE INDEX idx_stripe_webhooks_customer_id ON public.stripe_webhooks(customer_id);
CREATE INDEX idx_stripe_webhooks_processed ON public.stripe_webhooks(processed, created_at);

-- =============================================
-- 8. SEEDS DE TESTE (OPCIONAL - COMENTADO)
-- =============================================
/*
-- Descomentar para criar usuários de teste
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES 
    (gen_random_uuid(), 'teste@lightmarketing.com', crypt('senha123', gen_salt('bf')), NOW(), NOW(), NOW());
*/

-- =============================================
-- VERIFICAÇÃO FINAL
-- =============================================
SELECT 'Banco de dados configurado com sucesso!' as message;
SELECT 'Tabelas criadas:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'usage_logs', 'usage_limits', 'stripe_webhooks')
ORDER BY table_name;
