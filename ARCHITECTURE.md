# 🏗️ Arquitetura do Sistema

## 📊 Diagrama de Fluxo

```
┌─────────────────────────────────────────────────────────────┐
│                      USUÁRIO / NAVEGADOR                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              CLOUDFLARE PAGES (Frontend)                     │
│                                                              │
│  • index.html (Ferramenta - Protegida)                      │
│  • login.html / register.html (Auth Pages)                  │
│  • dashboard.html (Painel de Controle)                      │
│  • CSS/JS (Lógica de UI e Client-side)                      │
└─────────────┬───────────────────────┬───────────────────────┘
              │                       │
              ▼                       ▼
┌─────────────────────┐    ┌──────────────────────────┐
│   SUPABASE          │    │  CLOUDFLARE FUNCTIONS    │
│   (Backend)         │    │  (Serverless API)        │
│                     │    │                          │
│ • Auth              │    │ • create-checkout        │
│ • Database (PostgreSQL)  │ • create-portal          │
│ • Row Level Security│    │ • stripe-webhook         │
│ • Real-time         │    └───────────┬──────────────┘
└──────────────────┬──┘                │
                   │                   │
                   │                   ▼
                   │         ┌──────────────────┐
                   │         │  STRIPE API      │
                   │         │                  │
                   │         │ • Checkout       │
                   │         │ • Subscriptions  │
                   │         │ • Webhooks       │
                   │         └──────────────────┘
                   │
                   ▼
        ┌──────────────────────────┐
        │  BANCO DE DADOS          │
        │                          │
        │ Tables:                  │
        │  • profiles              │
        │  • usage_logs            │
        │  • usage_limits          │
        │  • stripe_webhooks       │
        └──────────────────────────┘
```

## 🔄 Fluxo de Registro de Usuário

```
1. Usuário acessa register.html
   ↓
2. Preenche formulário (nome, email, senha)
   ↓
3. auth.js envia para Supabase Auth
   ↓
4. Supabase:
   - Cria usuário em auth.users
   - Trigger automático cria perfil em profiles
   - Envia email de confirmação
   ↓
5. Usuário confirma email (clica no link)
   ↓
6. Redirect para login.html?verified=true
   ↓
7. Usuário faz login e vai para dashboard.html
```

## 🔐 Fluxo de Autenticação

```
1. Usuário acessa login.html
   ↓
2. Insere credenciais (email + senha)
   ↓
3. auth.js chama Supabase.auth.signInWithPassword()
   ↓
4. Supabase valida e retorna:
   - Session token (JWT)
   - User data
   ↓
5. Token armazenado em localStorage (automático)
   ↓
6. Redirect para dashboard.html
   ↓
7. Dashboard carrega:
   - Perfil do usuário
   - Estatísticas de uso
   - Plano atual
```

## 💳 Fluxo de Upgrade de Plano

```
1. Usuário no dashboard.html
   ↓
2. Clica em "Fazer Upgrade" → seleciona plano
   ↓
3. dashboard.js chama StripeClient.createCheckoutSession()
   ↓
4. Requisição POST para /api/create-checkout-session
   ↓
5. Cloudflare Function:
   - Valida dados
   - Cria Stripe Checkout Session
   - Retorna sessionId
   ↓
6. Frontend redireciona para Stripe Checkout
   ↓
7. Usuário preenche dados de pagamento
   ↓
8. Pagamento aprovado → Stripe redireciona de volta
   ↓
9. URL: dashboard.html?checkout=success
   ↓
10. Stripe envia webhook para /api/stripe-webhook
    ↓
11. Webhook atualiza Supabase:
    - subscription_tier (free → basic/premium)
    - stripe_customer_id
    - subscription_status
    ↓
12. Dashboard recarrega com novo plano ✅
```

## 🛠️ Fluxo de Uso da Ferramenta

```
1. Usuário acessa index.html
   ↓
2. script.js verifica autenticação
   ↓
3. Se NÃO autenticado:
   - Mostra overlay de bloqueio
   - Botão "Fazer Login"
   ↓
4. Se autenticado:
   - Verifica limites (checkUsageLimit)
   - Se limite atingido → bloqueia + "Ver Planos"
   - Se OK → libera ferramenta
   ↓
5. Usuário seleciona PDF + XLSX
   ↓
6. Clica "Processar"
   ↓
7. script.js:
   - Processa arquivos
   - Registra uso no Supabase (logUsage)
   - Incrementa contador
   ↓
8. Supabase:
   - Insert em usage_logs
   - Atualiza estatísticas
   ↓
9. Download gerado
   ↓
10. Dashboard atualizado com novo uso
```

## 📦 Estrutura de Dados

### `profiles` (Supabase)
```sql
{
  id: UUID (FK → auth.users.id)
  email: TEXT
  full_name: TEXT
  subscription_tier: 'free' | 'basic' | 'premium'
  stripe_customer_id: TEXT
  stripe_subscription_id: TEXT
  subscription_status: 'active' | 'canceled' | 'past_due'
  subscription_start_date: TIMESTAMP
  subscription_end_date: TIMESTAMP
  created_at: TIMESTAMP
  updated_at: TIMESTAMP
}
```

### `usage_logs` (Supabase)
```sql
{
  id: UUID
  user_id: UUID (FK → profiles.id)
  process_type: 'correios' | 'xpress'
  pdf_filename: TEXT
  xlsx_filename: TEXT
  files_processed: INTEGER
  status: 'success' | 'error'
  created_at: TIMESTAMP
}
```

### `usage_limits` (Supabase)
```sql
{
  tier: 'free' | 'basic' | 'premium' (PK)
  monthly_limit: INTEGER (-1 = ilimitado)
  price_monthly_cents: INTEGER
  features: JSONB []
}

Dados iniciais:
├─ free: 5 processamentos, R$ 0
├─ basic: 50 processamentos, R$ 19.99
└─ premium: ilimitado, R$ 49.99
```

## 🔒 Segurança

### Row Level Security (RLS) - Supabase

**profiles:**
```sql
SELECT: auth.uid() = id
UPDATE: auth.uid() = id
```

**usage_logs:**
```sql
SELECT: auth.uid() = user_id
INSERT: auth.uid() = user_id
```

**usage_limits:**
```sql
SELECT: PUBLIC (todos podem ler)
```

### Environment Variables (Cloudflare Pages)

**Frontend (VITE_ prefix):**
- `VITE_SUPABASE_URL` → visível no client
- `VITE_SUPABASE_ANON_KEY` → visível no client (safe, RLS protege)
- `VITE_STRIPE_PUBLISHABLE_KEY` → visível no client (safe)

**Backend (apenas functions):**
- `SUPABASE_SERVICE_ROLE_KEY` → bypass RLS (apenas server)
- `STRIPE_SECRET_KEY` → operações sensitivas
- `STRIPE_WEBHOOK_SECRET` → validação de webhooks

## 📈 Performance

### Caching
- **Supabase:** Cache automático de queries
- **Cloudflare:** CDN global para assets estáticos
- **Browser:** LocalStorage para session tokens

### Otimizações
- Scripts carregados com `defer`
- Images com lazy loading
- CSS minificado em produção
- Consultas SQL otimizadas com índices

## 🚀 Deploy Pipeline

```
1. Developer push para GitHub
   ↓
2. GitHub webhook notifica Cloudflare Pages
   ↓
3. Cloudflare build:
   - Instala dependências (functions/package.json)
   - Build assets
   - Deploy functions
   ↓
4. Deploy completo em ~2 minutos
   ↓
5. Disponível em:
   - Preview: PR-specific URL
   - Production: domínio principal
```

## 🎯 Integrações

### Supabase Features Utilizadas
✅ Authentication (Email/Password)
✅ Database (PostgreSQL)
✅ Row Level Security
✅ Triggers (auto-create profile)
✅ Functions (check_usage_limit)
✅ Real-time (opcional, para futuro)

### Stripe Features Utilizadas
✅ Checkout Sessions
✅ Subscriptions
✅ Customer Portal
✅ Webhooks
✅ Test Mode

### Cloudflare Features Utilizadas
✅ Pages (Static Hosting)
✅ Pages Functions (Serverless)
✅ Environment Variables
✅ CDN Global
✅ SSL Automático

## 📊 Monitoramento

### Logs Disponíveis

**Supabase:**
- Auth logs: Login/signup attempts
- Database logs: Query performance
- API logs: Request rates

**Stripe:**
- Payment logs: Success/failures
- Webhook logs: Delivery status
- Customer logs: Subscription changes

**Cloudflare:**
- Pages logs: Build history
- Function logs: API calls
- Analytics: Traffic metrics

---

## 🔮 Extensões Futuras

**Features Planejadas:**
- [ ] OAuth (Google, GitHub)
- [ ] 2FA (Two-Factor Auth)
- [ ] API Keys para desenvolvedores
- [ ] Webhooks para integrações
- [ ] Relatórios exportáveis (PDF/CSV)
- [ ] Notificações por email (avisos de limite)
- [ ] Dark mode toggle
- [ ] Multi-language (i18n)
- [ ] Mobile app (React Native)

**Integrações Possíveis:**
- [ ] Zapier integration
- [ ] Slack notifications
- [ ] Discord webhooks
- [ ] Google Analytics
- [ ] Hotjar/Mixpanel
- [ ] Sentry (error tracking)

---

**Documentação completa:** `README-AUTH.md`  
**Início rápido:** `QUICK-START.md`
