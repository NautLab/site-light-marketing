# 🚀 Guia Rápido de Configuração

## ⚡ Início Rápido (5 minutos)

### 1️⃣ Configurar Supabase

1. **Acesse:** https://supabase.com/dashboard/org/fshjwdffgjpzletnfugw
2. **Criar Projeto:**
   - Nome: `light-marketing`
   - Senha: escolha uma forte
   - Região: São Paulo, Brasil

3. **Configurar Database:**
   - Vá em **SQL Editor**
   - Copie todo conteúdo de `supabase-setup.sql`
   - Cole e clique **Run**

4. **Obter Credenciais:**
   - Vá em **Settings > API**
   - Copie:
     - `Project URL`
     - `anon/public key`

### 2️⃣ Configurar Stripe (Modo Test)

1. **Criar Conta:** https://dashboard.stripe.com/register
2. **Obter Chaves de Teste:**
   - Vá em **Developers > API keys**
   - Copie:
     - `Publishable key` (pk_test_...)
     - `Secret key` (sk_test_...)

3. **Criar Produtos:**
   - Vá em **Products > Add product**
   
   **Plano Basic:**
   - Nome: `Plano Basic`
   - Preço: `R$ 19.99/mês`
   - Copie o `Price ID` (price_...)
   
   **Plano Premium:**
   - Nome: `Plano Premium`
   - Preço: `R$ 49.99/mês`
   - Copie o `Price ID` (price_...)

### 3️⃣ Atualizar Código

**Edite `config/supabase-config.js`:**
```javascript
url: 'https://SEU_PROJECT_ID.supabase.co',
anonKey: 'SUA_ANON_KEY_AQUI'
```

**Edite `config/stripe-config.js`:**
```javascript
publishableKey: 'pk_test_SUA_KEY_AQUI',
products: {
    basic: {
        priceId: 'price_ID_DO_BASIC',
    },
    premium: {
        priceId: 'price_ID_DO_PREMIUM',
    }
}
```

### 4️⃣ Configurar Cloudflare Pages

1. **Variáveis de Ambiente:**
   - Acesse: Cloudflare Dashboard > Pages > Seu Projeto > Settings > Environment variables
   
   **Adicione (Production e Preview):**
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
   
   **Adicione (Apenas Production):**
   ```
   SUPABASE_SERVICE_ROLE_KEY=eyJ... (pegar em Supabase > Settings > API)
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_... (obter após criar webhook)
   ```

2. **Configurar Webhook do Stripe:**
   - Stripe Dashboard > Developers > Webhooks
   - Add endpoint: `https://seu-dominio.pages.dev/api/stripe-webhook`
   - Eventos: `customer.subscription.*`, `invoice.payment_*`
   - Copie o `Signing secret` e adicione como `STRIPE_WEBHOOK_SECRET`

### 5️⃣ Deploy

```bash
# Commitar mudanças
git add .
git commit -m "feat: adicionar autenticação e assinaturas"
git push origin main
```

Cloudflare fará deploy automático! ✅

### 6️⃣ Testar

1. **Criar Conta:** `https://seu-site.pages.dev/register.html`
2. **Confirmar Email** (verifique inbox)
3. **Fazer Login:** `https://seu-site.pages.dev/login.html`
4. **Acessar Dashboard:** Veja suas stats
5. **Testar Ferramenta:** Faça até 5 processamentos (limite free)
6. **Testar Upgrade:**
   - Clique em "Fazer Upgrade"
   - Use cartão de teste: `4242 4242 4242 4242`
   - CVC: `123`, Data: `12/25`
   - Confirme pagamento

## 🎯 Planos Implementados

| Plano | Limite Mensal | Preço |
|-------|--------------|-------|
| **Free** | 5 processamentos | Grátis |
| **Basic** | 50 processamentos | R$ 19,99/mês |
| **Premium** | Ilimitado | R$ 49,99/mês |

## ✅ Checklist de Configuração

- [ ] Supabase projeto criado
- [ ] Database configurado (SQL executado)
- [ ] Supabase credentials copiadas
- [ ] Stripe conta criada (modo test)
- [ ] Stripe produtos criados
- [ ] Stripe credentials copiadas
- [ ] Código atualizado com credentials
- [ ] Cloudflare env variables configuradas
- [ ] Deploy realizado
- [ ] Teste de registro funcionando
- [ ] Teste de login funcionando
- [ ] Teste da ferramenta funcionando
- [ ] Teste de upgrade funcionando

## 🔧 Comandos Úteis

```bash
# Instalar dependências das functions (se necessário)
cd functions
npm install

# Testar localmente com Wrangler
npm install -g wrangler
wrangler pages dev

# Ver logs do Cloudflare
# Cloudflare Dashboard > Pages > Seu Projeto > Functions > Logs
```

## 📱 URLs Importantes

- **Supabase Dashboard:** https://supabase.com/dashboard
- **Stripe Dashboard:** https://dashboard.stripe.com
- **Cloudflare Dashboard:** https://dash.cloudflare.com
- **Seu Site:** https://seu-dominio.pages.dev

## ⚠️ Troubleshooting Rápido

**Erro: "Supabase is not defined"**
→ Verifique se CDN do Supabase está carregando (veja console do navegador)

**Erro: "Cannot create checkout"**
→ Verifique variáveis de ambiente no Cloudflare

**Email não chega**
→ Verifique spam ou configure SMTP no Supabase

**Webhook não funciona**
→ Confirme URL e secret no Stripe Dashboard

## 🎉 Próximos Passos

Após tudo funcionando:

1. **Modo Produção do Stripe:**
   - Ative conta do Stripe
   - Troque para chaves live (pk_live_... e sk_live_...)
   - Recrie produtos em modo live
   - Atualize variáveis de ambiente

2. **Personalizar:**
   - Ajuste preços conforme necessário
   - Modifique limites na tabela `usage_limits`
   - Adicione mais features aos planos

3. **Marketing:**
   - Configure domínio customizado no Cloudflare
   - Adicione Google Analytics
   - Configure pixel do Facebook

---

**Dúvidas?** Consulte o `README-AUTH.md` completo para detalhes!
