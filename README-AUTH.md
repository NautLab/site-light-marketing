# 🚀 Light Marketing - Sistema de Autenticação e Assinaturas

Sistema completo de autenticação com Supabase e integração de pagamentos com Stripe.

## 📋 Estrutura do Projeto

```
site-light-marketing/
├── config/
│   ├── supabase-config.js      # Configuração do Supabase
│   └── stripe-config.js         # Configuração do Stripe
├── js/
│   ├── auth.js                  # Lógica de autenticação
│   └── dashboard.js             # Lógica do dashboard
├── css/
│   ├── auth.css                 # Estilos das páginas de auth
│   └── dashboard.css            # Estilos do dashboard
├── functions/                   # Cloudflare Pages Functions (criar)
│   ├── api/
│   │   ├── create-checkout-session.js
│   │   ├── create-portal-session.js
│   │   └── stripe-webhook.js
├── login.html                   # Página de login
├── register.html                # Página de registro
├── forgot-password.html         # Recuperação de senha
├── reset-password.html          # Redefinição de senha
├── dashboard.html               # Dashboard do usuário
├── index.html                   # Ferramenta principal (protegida)
├── supabase-setup.sql          # Script SQL para configurar BD
└── README-AUTH.md              # Este arquivo
```

## 🔧 Configuração Passo a Passo

### 1. Configurar Supabase

#### 1.1. Criar Projeto
1. Acesse https://supabase.com/dashboard/org/fshjwdffgjpzletnfugw
2. Clique em "New Project"
3. Nomeie o projeto: "light-marketing" (ou nome desejado)
4. Escolha senha forte para o database
5. Escolha região mais próxima (São Paulo, Brasil)
6. Aguarde ~2 minutos para criar

#### 1.2. Configurar Banco de Dados
1. No dashboard do Supabase, vá em **SQL Editor**
2. Clique em "New Query"
3. Copie TODO o conteúdo do arquivo `supabase-setup.sql`
4. Cole no editor e clique em **Run**
5. Verifique se todas as tabelas foram criadas (profiles, usage_logs, usage_limits, stripe_webhooks)

#### 1.3. Configurar Autenticação
1. Vá em **Authentication > Providers**
2. Habilite **Email** provider
3. Configure:
   - Enable Email Confirmations: ✅ (recomendado)
   - Enable Email Change Confirmation: ✅
   - Secure Email Change: ✅

#### 1.4. Configurar URLs de Redirecionamento
1. Em **Authentication > URL Configuration**, adicione:
   ```
   Site URL: https://SEU-DOMINIO.pages.dev
   
   Redirect URLs:
   - https://SEU-DOMINIO.pages.dev/login.html
   - https://SEU-DOMINIO.pages.dev/reset-password.html
   - https://SEU-DOMINIO.pages.dev/dashboard.html
   - http://localhost:8080/* (para desenvolvimento)
   ```

#### 1.5. Obter Credenciais
1. Vá em **Settings > API**
2. Copie:
   - **Project URL** (ex: https://xxxxx.supabase.co)
   - **anon/public key** (começa com "eyJ...")

### 2. Configurar Stripe

#### 2.1. Criar Conta Stripe
1. Acesse https://dashboard.stripe.com/register
2. Complete o cadastro (pode usar modo TEST inicialmente)

#### 2.2. Criar Produtos e Preços
1. Vá em **Products** no dashboard do Stripe
2. Crie 2 produtos:

**Produto 1: Basic**
- Nome: Plano Basic - Light Marketing
- Descrição: 50 processamentos por mês
- Preço: R$ 19,99/mês (ou valor desejado)
- Tipo: Recurring (Mensal)
- Copie o **Price ID** (price_xxxxxxxxxxxx)

**Produto 2: Premium**
- Nome: Plano Premium - Light Marketing
- Descrição: Processamentos ilimitados
- Preço: R$ 49,99/mês (ou valor desejado)
- Tipo: Recurring (Mensal)
- Copie o **Price ID** (price_xxxxxxxxxxxx)

#### 2.3. Obter Credenciais
1. Vá em **Developers > API keys**
2. Copie:
   - **Publishable key** (pk_test_xxxx ou pk_live_xxxx)
   - **Secret key** (sk_test_xxxx ou sk_live_xxxx) ⚠️ NUNCA EXPONHA!

#### 2.4. Configurar Webhook
1. Vá em **Developers > Webhooks**
2. Clique em "Add endpoint"
3. URL do endpoint: `https://SEU-DOMINIO.pages.dev/api/stripe-webhook`
4. Selecione eventos:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copie o **Signing secret** (whsec_xxxx)

### 3. Configurar Variáveis de Ambiente no Cloudflare Pages

1. Acesse https://dash.cloudflare.com
2. Vá em **Pages > seu-projeto > Settings > Environment variables**
3. Adicione as seguintes variáveis:

**Para Preview e Production:**
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...seu_anon_key
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...sua_publishable_key

# Apenas Production (variáveis secretas)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...service_role_key
STRIPE_SECRET_KEY=sk_test_...sua_secret_key
STRIPE_WEBHOOK_SECRET=whsec_...seu_webhook_secret
```

⚠️ **IMPORTANTE**: 
- Nunca commite chaves secretas no Git
- Use variáveis de ambiente do Cloudflare Pages
- `VITE_` prefix torna variáveis acessíveis no frontend
- Chaves sem prefix são apenas backend

### 4. Criar Cloudflare Pages Functions

Crie a pasta `functions/api/` na raiz do projeto e adicione os seguintes arquivos:

#### 4.1. `functions/api/create-checkout-session.js`
```javascript
export async function onRequestPost(context) {
    try {
        const { priceId, customerId, successUrl, cancelUrl } = await context.request.json();
        
        const stripe = require('stripe')(context.env.STRIPE_SECRET_KEY);
        
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'subscription',
            success_url: successUrl,
            cancel_url: cancelUrl,
        });
        
        return new Response(JSON.stringify({ sessionId: session.id }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
```

#### 4.2. `functions/api/create-portal-session.js`
```javascript
export async function onRequestPost(context) {
    try {
        const { customerId, returnUrl } = await context.request.json();
        
        const stripe = require('stripe')(context.env.STRIPE_SECRET_KEY);
        
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl,
        });
        
        return new Response(JSON.stringify({ url: session.url }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
```

#### 4.3. `functions/api/stripe-webhook.js`
```javascript
export async function onRequestPost(context) {
    try {
        const stripe = require('stripe')(context.env.STRIPE_SECRET_KEY);
        const signature = context.request.headers.get('stripe-signature');
        const body = await context.request.text();
        
        const event = stripe.webhooks.constructEvent(
            body,
            signature,
            context.env.STRIPE_WEBHOOK_SECRET
        );
        
        // Processar evento
        // Aqui você conectaria com Supabase para atualizar o status da assinatura
        
        return new Response(JSON.stringify({ received: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
```

### 5. Atualizar Configurações no Código

#### 5.1. Editar `config/supabase-config.js`
Substitua no código:
```javascript
url: 'https://xxxxx.supabase.co', // Seu Project URL
anonKey: 'eyJhbGc...' // Seu anon key
```

#### 5.2. Editar `config/stripe-config.js`
Substitua no código:
```javascript
publishableKey: 'pk_test_...', // Sua publishable key
products: {
    basic: {
        priceId: 'price_...', // Price ID do plano Basic
    },
    premium: {
        priceId: 'price_...', // Price ID do plano Premium
    }
}
```

### 6. Deploy no Cloudflare Pages

1. Commit todas as mudanças:
```bash
git add .
git commit -m "feat: adicionar sistema de autenticação e assinaturas"
git push origin main
```

2. O Cloudflare Pages fará deploy automático
3. Aguarde ~2-3 minutos para build completar

### 7. Testar Sistema

#### 7.1. Testar Registro
1. Acesse `https://SEU-DOMINIO.pages.dev/register.html`
2. Crie uma conta
3. Verifique email de confirmação
4. Faça login

#### 7.2. Testar Dashboard
1. Acesse o dashboard
2. Verifique se stats aparecem corretamente
3. Teste navegação entre páginas

#### 7.3. Testar Ferramenta
1. Vá para página inicial
2. Tente usar a ferramenta
3. Verifique se limite de 5 processamentos funciona
4. Após 5 usos, deve bloquear e pedir upgrade

#### 7.4. Testar Upgrade (Modo TEST do Stripe)
1. No dashboard, clique em "Fazer Upgrade"
2. Escolha um plano
3. Use cartão de teste do Stripe:
   - Número: 4242 4242 4242 4242
   - CVC: qualquer 3 dígitos
   - Data: qualquer data futura
4. Complete o checkout
5. Verifique se plano foi atualizado

## 📊 Recursos Implementados

✅ **Autenticação Completa**
- Login com email/senha
- Registro de usuários
- Confirmação de email
- Recuperação de senha
- Logout
- Proteção de rotas

✅ **Sistema de Assinaturas**
- 3 planos (Free, Basic, Premium)
- Integração com Stripe
- Checkout seguro
- Portal de gerenciamento
- Atualização automática de status

✅ **Controle de Uso**
- Rastreamento de processamentos
- Limites por plano
- Bloqueio ao atingir limite
- Dashboard com estatísticas

✅ **Dashboard**
- Visualização de uso
- Gerenciamento de assinatura
- Histórico de atividades
- Informações do plano atual

✅ **Segurança**
- Row Level Security (RLS) no Supabase
- Variáveis de ambiente
- Validação de webhooks
- Tokens seguros

## 🎨 Personalização

### Modificar Limites de Planos
Edite a tabela `usage_limits` no Supabase:
```sql
UPDATE usage_limits 
SET monthly_limit = 10 
WHERE tier = 'free';
```

### Modificar Preços
1. Altere no Stripe Dashboard
2. Atualize Price IDs em `config/stripe-config.js`
3. Atualize tabela `usage_limits` se necessário

### Adicionar Features
1. Adicione nova coluna `features` como JSON na tabela
2. Renderize no dashboard.js

## 🐛 Troubleshooting

### "Supabase is not defined"
- Verifique se o script do Supabase CDN está carregando
- Confirme ordem dos scripts no HTML

### "Cannot create checkout session"
- Verifique se variáveis de ambiente estão configuradas
- Confirme que Price IDs estão corretos
- Verifique logs do Cloudflare Pages

### "Email not sending"
- Configure SMTP no Supabase (Settings > Auth > SMTP)
- Ou use serviço de email do Supabase (limitado)

### "Webhook failing"
- Verifique URL do webhook no Stripe
- Confirme que `STRIPE_WEBHOOK_SECRET` está configurado
- Veja logs no Stripe Dashboard

## 📞 Suporte

Para questões:
1. Verifique documentação do Supabase: https://supabase.com/docs
2. Verifique documentação do Stripe: https://stripe.com/docs
3. Verifique logs do Cloudflare Pages

## 🔒 Segurança

⚠️ **NUNCA commite:**
- Secret keys do Stripe
- Service role key do Supabase
- Webhook secrets
- Qualquer credencial sensível

✅ **Sempre use:**
- Variáveis de ambiente
- RLS no Supabase
- HTTPS em produção
- Validação de webhooks

---

Desenvolvido com ❤️ por Light Marketing
