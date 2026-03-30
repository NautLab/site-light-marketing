-- Tabela de ferramentas por marketplace
-- Permite ao administrador gerenciar quais marketplaces estão disponíveis,
-- em qual plano cada um está, e a ordem de exibição.
-- Novas ferramentas adicionadas aqui aparecerão automaticamente no painel admin.

CREATE TABLE public.marketplace_tools (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    required_tier TEXT NOT NULL DEFAULT 'free' CHECK (required_tier IN ('free', 'basic', 'premium')),
    display_order INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir marketplaces iniciais
INSERT INTO public.marketplace_tools (slug, name, is_active, required_tier, display_order, description) VALUES
    ('shopee', 'Shopee', true, 'free', 1, 'Formatador de etiquetas Shopee (Correios/Xpress)'),
    ('tiktok', 'TikTok', false, 'free', 2, 'Formatador de etiquetas TikTok Shop'),
    ('shein', 'Shein', false, 'free', 3, 'Formatador de etiquetas Shein');

-- Habilitar RLS
ALTER TABLE public.marketplace_tools ENABLE ROW LEVEL SECURITY;

-- Leitura pública (todos os usuários autenticados e anônimos podem ver quais ferramentas existem)
CREATE POLICY "Anyone can view marketplace tools"
    ON public.marketplace_tools
    FOR SELECT
    USING (true);

-- Escrita restrita: apenas futuramente via service_role ou admin.
-- Por enquanto, nenhuma política de INSERT/UPDATE/DELETE para usuários comuns.
-- O painel administrativo usará service_role key para gerenciar.

-- Trigger para atualizar updated_at automaticamente
CREATE TRIGGER update_marketplace_tools_updated_at
    BEFORE UPDATE ON public.marketplace_tools
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comentário na tabela para documentação
COMMENT ON TABLE public.marketplace_tools IS 'Ferramentas de marketplace disponíveis na plataforma. Gerenciável pelo admin para controlar acesso por plano de assinatura.';
COMMENT ON COLUMN public.marketplace_tools.slug IS 'Identificador único usado no frontend (ex: shopee, tiktok, shein)';
COMMENT ON COLUMN public.marketplace_tools.required_tier IS 'Plano mínimo necessário para acessar esta ferramenta (free, basic, premium)';
COMMENT ON COLUMN public.marketplace_tools.is_active IS 'Se a ferramenta está ativa e disponível para uso';
COMMENT ON COLUMN public.marketplace_tools.display_order IS 'Ordem de exibição nas abas do frontend';
