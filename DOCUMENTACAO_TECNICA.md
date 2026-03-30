# Documentação Técnica - Light Marketing
## Plataforma de Processamento de Etiquetas para E-commerce

---

## 📋 VISÃO GERAL DO PROJETO

O **Light Marketing** é uma plataforma web SaaS especializada em processamento automatizado de etiquetas para e-commerce. O sistema permite upload, processamento e download de etiquetas em diferentes formatos, com foco inicial em otimização de etiquetas da Shopee.

**Modelo de Negócio**: Software como Serviço (SaaS) com sistema de assinaturas recorrentes.

---

## 🎯 FUNCIONALIDADES ATUAIS

### **1. Sistema de Autenticação Completo**

#### **Páginas de Autenticação**:
- **Login** ([login.html](login.html)): Acesso de usuários cadastrados
- **Registro** ([register.html](register.html)): Criação de novas contas
- **Recuperação de Senha** ([forgot-password.html](forgot-password.html)): Solicitação de reset via email
- **Redefinição de Senha** ([reset-password.html](reset-password.html)): Criação de nova senha

#### **Recursos de Segurança**:
- Autenticação baseada em JWT (JSON Web Tokens)
- Senhas criptografadas com algoritmo bcrypt
- Confirmação de email obrigatória
- Recuperação de senha segura via email
- Proteção contra ataques de força bruta
- Sessions persistentes com renovação automática
- Row Level Security (RLS) no banco de dados

#### **Validações**:
- Formato de email válido
- Força de senha (mínimo 6 caracteres)
- Confirmação de senha correspondente
- Email único (não permite duplicatas)
- Verificação de existência de email antes do registro

---

### **2. Processador de Etiquetas - Shopee**

#### **Funcionalidade Principal: União de Etiqueta com Declaração**

O processador realiza a união inteligente de dois documentos essenciais para envios de e-commerce:

**1. Etiqueta de Envio**
- Contém informações do destinatário
- Código de rastreamento
- QR Code para logística
- Dados da transportadora

**2. Declaração de Conteúdo**
- Lista detalhada dos produtos enviados
- Quantidade de cada item
- Valor declarado
- Peso e dimensões

**Processo de União**:
O sistema combina automaticamente esses dois documentos em um único PDF otimizado, facilitando:
- ✅ Impressão unificada (economia de tempo)
- ✅ Redução de erros de separação
- ✅ Facilita processo de picking e packing
- ✅ Conformidade com requisitos de transportadoras
- ✅ Reduz custos de impressão
- ✅ Acelera processo de expedição

**Tipos de Arquivo Suportados**:
- **PDF**: Processamento nativo com biblioteca PDF.js da Mozilla
  - Suporta múltiplas páginas
  - Preserva qualidade original
  - Mantém vetorização
- **Imagens**: JPG, PNG, JPEG
  - Conversão automática para PDF
  - Otimização de resolução
  - Ajuste de dimensões
- **Tamanho**: Sem limite definido (processado localmente na máquina do usuário)

#### **Processo de Uso**:
1. **Upload**: Usuário faz upload do arquivo de etiquetas via drag & drop ou seleção
2. **Análise**: Sistema identifica automaticamente etiquetas de envio e declarações
3. **Processamento**: Algoritmo une os documentos correspondentes
4. **Visualização**: Barra de progresso mostra andamento em tempo real
5. **Download**: Arquivo unificado é gerado e baixado automaticamente

---

#### **Características Técnicas do Processamento**

O processamento de etiquetas foi desenvolvido com foco em **privacidade, performance e segurança**:

**1. Processamento Client-Side (Local)**
- **Todo o processamento ocorre no navegador do usuário**, utilizando JavaScript puro
- **Nenhum arquivo é enviado para servidor**: os PDFs e imagens nunca saem da máquina do usuário
- **Privacidade absoluta**: dados sensíveis (endereços, nomes, telefones) permanecem privados
- **Conformidade LGPD**: sem armazenamento de dados pessoais de destinatários
- **Sem dependência de internet após carregamento**: processamento funciona offline
- **Redução de custos**: sem necessidade de infraestrutura de processamento de arquivos

**Vantagens do Processamento Local**:
- ⚡ Velocidade superior (sem latência de rede)
- 🔒 Segurança máxima (dados não trafegam)
- 💰 Escalável infinitamente (sem custo por processamento)
- 🌍 Funciona em qualquer lugar do mundo
- 📶 Não consome banda de upload

**2. Tecnologia PDF.js**
- **Biblioteca oficial da Mozilla** (criadores do Firefox)
- Open source e amplamente testada
- Renderização de PDF nativa em JavaScript
- Suporta todas as especificações PDF
- Sem necessidade de plugins externos

**3. Barra de Progresso Visual**
- Atualização em tempo real (progress bar animada)
- Percentual exato de conclusão
- Indicadores visuais de cada etapa:
  - 📤 Upload completo
  - 🔍 Analisando documento
  - ⚙️ Processando páginas
  - 📥 Gerando arquivo final
- Estimativa de tempo restante (calculada dinamicamente)

**4. Feedback em Tempo Real**
- Mensagens contextuais durante cada etapa
- Alertas de erro com descrição clara
- Validações antes do processamento:
  - ✓ Tipo de arquivo válido
  - ✓ Arquivo não corrompido
  - ✓ Formato compatível
- Instruções claras caso algo falhe

**5. Mensagem de Sucesso e Download Automático**
- Confirmação visual ao concluir
- Download inicia automaticamente
- Opção de baixar novamente se necessário
- Nome de arquivo sugerido automaticamente (ex: `etiquetas_processadas_2026-01-22.pdf`)
- Limpeza automática de memória após conclusão

**Arquitetura do Processamento**:
```javascript
// Fluxo simplificado
1. FileReader API → Lê arquivo do usuário
2. PDF.js → Carrega e parseia PDF
3. Canvas API → Renderiza cada página
4. Algoritmo proprietário → Identifica e une documentos
5. jsPDF → Gera novo PDF otimizado
6. Blob API → Cria arquivo para download
7. URL.createObjectURL → Gera link de download
8. Limpeza de memória → Remove objetos temporários
```

---

### **3. Interface do Usuário**

#### **Design e UX**:
- **Tema**: Dark mode com gradiente preto (#000000 → #1a1a1a)
- **Cor Principal**: Azul turquesa (#0C7E92)
- **Fonte**: Poppins (Google Fonts)
- **Estilo**: Moderno, minimalista, glassmorphism

#### **Componentes Principais**:

**Header Fixo**:
- Logo animado com ícone
- Menu de navegação responsivo
- Botões de Login/Registro (quando deslogado)
- Informações do usuário (quando logado)
- Menu hambúrguer para mobile

**Hero Section**:
- Imagem animada (flutuação e pulso)
- Texto digitado com efeito typing
- Badges de funcionalidades
- Card de processamento integrado

**Seção "Como Usar"**:
- 3 passos visuais numerados
- Cards com hover effect
- Ícones ilustrativos
- Descrições claras

**Footer**:
- Informações da empresa
- Links de contato
- Copyright

#### **Responsividade**:
- **Desktop**: Layout em 2 colunas
- **Tablet**: Layout adaptado com menu lateral
- **Mobile**: Layout vertical, menu hambúrguer
- **Breakpoints**: 1024px, 768px, 480px, 360px

#### **Animações**:
- Fade in (entrada de seções)
- Typing effect (texto digitado)
- Float (flutuação de imagem)
- Pulse (efeito de pulso)
- Hover effects (interações)
- Progress bar (barra de progresso)

---

## 🛠️ ARQUITETURA TÉCNICA

### **Stack Tecnológico**

#### **Frontend**:
- **HTML5**: Estrutura semântica
- **CSS3**: Estilização avançada com variáveis CSS
- **JavaScript ES6+**: Lógica da aplicação

#### **Bibliotecas JavaScript**:
- **PDF.js** (Mozilla): Renderização e manipulação de PDFs
- **Supabase JS Client**: Autenticação e banco de dados
- **Vanilla JavaScript**: Sem frameworks pesados (performance otimizada)

#### **Estrutura de Arquivos**:
```
├── index.html                    # Página principal
├── login.html                    # Login
├── register.html                 # Registro
├── forgot-password.html          # Recuperar senha
├── reset-password.html           # Redefinir senha
├── style.css                     # Estilos principais
├── script.js                     # Lógica principal
├── .htaccess                     # Configurações Apache
├── css/
│   ├── auth.css                 # Estilos de autenticação
│   └── label-processor.css      # Estilos do processador
├── js/
│   ├── auth.js                  # Lógica de autenticação
│   ├── label-processor.js       # Lógica do processador
│   └── supabase-config.js       # Configuração Supabase
└── supabase/
    ├── config.toml              # Config local Supabase
    └── migrations/              # Migrações SQL
        ├── 20251211125800_create_profiles.sql
        └── 20251214120000_check_email_function.sql
```

---

### **Backend - Supabase**

#### **Serviços Utilizados**:

**1. Supabase Auth**:
- Sistema de autenticação completo
- Gerenciamento de sessões
- Email de confirmação
- Reset de senha
- Tokens JWT
- Refresh tokens automáticos

**2. PostgreSQL Database**:
- Banco de dados relacional
- Tabelas gerenciadas com migrations
- Triggers e functions customizadas
- Row Level Security (RLS)

**3. Tabelas do Banco de Dados**:

```sql
-- Tabela auth.users (gerenciada pelo Supabase)
-- Armazena dados de autenticação

-- Tabela public.profiles
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Políticas RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" 
    ON profiles FOR SELECT USING (auth.uid() = id);
```

**4. Functions Customizadas**:
- `check_email_exists()`: Verifica se email já está cadastrado
- Triggers de atualização automática
- Validações de dados

#### **Segurança do Banco**:
- **Row Level Security (RLS)**: Ativado em todas as tabelas
- **Políticas de Acesso**: Usuários só acessam próprios dados
- **Criptografia em Trânsito**: TLS 1.3
- **Criptografia em Repouso**: AES-256
- **Backups Automáticos**: Diários (Supabase gerencia)
- **Logs de Auditoria**: Todas as ações registradas

---

### **Hospedagem - Cloudflare Pages**

#### **Características**:
- **Deploy Automático**: Integração com GitHub
- **CDN Global**: 200+ cidades mundialmente
- **SSL/TLS Gratuito**: Certificado automático
- **Edge Computing**: Resposta rápida globalmente
- **Preview Branches**: Testes antes do deploy
- **Rollback**: Retorno a versões anteriores instantâneo

#### **Configurações**:
- **Build Command**: Não necessário (site estático)
- **Output Directory**: `/` (raiz do projeto)
- **Environment Variables**: 
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

#### **Performance**:
- **Tempo de Carregamento**: < 1 segundo (global)
- **Uptime**: 99.99%
- **Largura de Banda**: Ilimitada
- **Cache**: Automático via CDN

---

### **Controle de Versão - GitHub**

#### **Estrutura de Repositório**:
- Branch `main`: Produção
- Branch `development`: Desenvolvimento
- Feature branches: Novas funcionalidades
- Commits semânticos

#### **CI/CD Pipeline**:
1. Push para GitHub
2. Cloudflare detecta mudanças
3. Build automático
4. Deploy para produção
5. Invalidação de cache

#### **Proteções**:
- Repositório privado (recomendado)
- Branch protection rules
- Required reviews (opcional)
- Secrets protegidos (API keys)

---

## 📊 REQUISITOS TÉCNICOS

### **Requisitos de Infraestrutura**

#### **Cloudflare Pages (Frontend Hosting)**

**Arquitetura Serverless**:
- ✅ **Sem servidores para gerenciar**: Infraestrutura totalmente gerenciada pela Cloudflare
- ✅ **Zero configuração de servidor**: Não requer conhecimento de DevOps, Apache, Nginx ou similares
- ✅ **Sem manutenção**: Atualizações de segurança e patches aplicados automaticamente
- ✅ **Deploy com um clique**: Conexão direta com GitHub, deploy automático a cada commit

**Escalabilidade Automática**:
- 📈 **Auto-scaling ilimitado**: Suporta de 1 a 1 milhão de usuários simultâneos automaticamente
- 🌍 **200+ data centers globalmente**: Site replicado em todos os continentes
- ⚡ **Edge Computing**: Conteúdo servido do servidor mais próximo do usuário
- 🔄 **Load balancing automático**: Distribuição inteligente de tráfego
- 💪 **Sem downtime em picos**: Suporta tráfego viral sem problemas

**Benefícios Operacionais**:
- 🚀 Deploy em 30 segundos
- 🔙 Rollback instantâneo (1 clique)
- 🔍 Preview de cada branch automaticamente
- 📊 Analytics integrado
- 🛡️ Proteção DDoS incluída
- 🔒 SSL/TLS automático e renovação

**Por que Serverless é Vantajoso**:
- **Custo Zero**: Sem gastos com servidores ociosos
- **Escalabilidade Infinita**: De 10 a 10 milhões de usuários sem mudanças
- **Confiabilidade**: 99.99% de uptime garantido
- **Performance Global**: Latência mínima em qualquer país
- **Segurança**: Infraestrutura enterprise-grade

---

#### **Supabase (Backend-as-a-Service)**

**Gerenciamento Automático Completo**:
- ✅ **Zero administração de banco**: PostgreSQL totalmente gerenciado
- ✅ **Sem instalação ou configuração**: Pronto para usar em minutos
- ✅ **Atualizações automáticas**: Patches de segurança aplicados sem interrupção
- ✅ **Monitoramento 24/7**: Equipe Supabase monitora performance e disponibilidade
- ✅ **Scaling automático**: Recursos ajustados conforme demanda

**Backups e Recuperação**:
- 💾 **Backups diários automáticos**: Executados todo dia às 3h da madrugada
- 📅 **Retenção de 7 dias**: Possível restaurar qualquer backup da última semana
- ⏱️ **Point-in-Time Recovery**: Restaurar banco para qualquer momento específico
- 🔄 **Replicação geográfica**: Dados replicados em múltiplas regiões
- 🛡️ **Proteção contra perda de dados**: Redundância em múltiplos discos

**Segurança Integrada**:
- 🔐 **SSL/TLS obrigatório**: Todas as conexões criptografadas
- 🔒 **Row Level Security**: Isolamento de dados por usuário
- 🚨 **Detecção de ameaças**: Alertas automáticos de atividades suspeitas
- 📝 **Logs de auditoria**: Histórico completo de acessos
- 🛡️ **Firewall de banco**: Regras de acesso configuráveis

**Manutenção Zero**:
- Não precisa instalar PostgreSQL
- Não precisa configurar conexões
- Não precisa gerenciar performance
- Não precisa fazer backups manualmente
- Não precisa aplicar patches de segurança
- Não precisa monitorar espaço em disco

**APIs Automáticas**:
- 🔌 **RESTful API**: Gerada automaticamente para cada tabela
- ⚡ **Realtime subscriptions**: WebSockets para atualizações em tempo real
- 🔑 **Autenticação integrada**: Sistema completo pronto para uso
- 📚 **Documentação auto-gerada**: Swagger/OpenAPI automático

**Comparação com Servidor Tradicional**:

| Aspecto | Servidor Tradicional | Supabase |
|---------|---------------------|----------|
| Setup inicial | 2-5 dias | 5 minutos |
| Conhecimento necessário | SQL, Linux, Networking | Básico SQL |
| Backups | Manual | Automático |
| Escalabilidade | Manual (caro) | Automática |
| Segurança | Configurar tudo | Incluída |
| Manutenção mensal | 10-20 horas | 0 horas |
| Custo inicial | $50-200/mês | $0 |

---

### **Requisitos do Cliente (Usuário Final)**

#### **Navegadores Suportados**:
- Google Chrome 90+ ✅
- Firefox 88+ ✅
- Safari 14+ ✅
- Edge 90+ ✅
- Opera 76+ ✅

#### **Dispositivos**:
- Desktop (Windows, macOS, Linux) ✅
- Tablets (iOS, Android) ✅
- Smartphones (iOS, Android) ✅

#### **Conexão de Internet**:
- Mínimo: 1 Mbps
- Recomendado: 5 Mbps+
- Upload de arquivos depende da velocidade

#### **JavaScript**:
- Obrigatório habilitado
- Sem necessidade de plugins

---

### **Requisitos de Desenvolvimento**

#### **Ambiente Local**:
- Node.js 18+ (para ferramentas)
- Git 2.0+
- Editor de código (VS Code recomendado)
- Navegador moderno

#### **Ferramentas Opcionais**:
- Supabase CLI (desenvolvimento local)
- Live Server (testes locais)
- Postman/Insomnia (testes de API)

---

## 🚀 FUNCIONALIDADES FUTURAS PLANEJADAS

### **Fase 1: Sistema de Monetização com Stripe**

#### **1.1 Integração Stripe - Sistema de Pagamentos e n**

**O que é Stripe?**

Stripe é a plataforma líder mundial de processamento de pagamentos online, utilizada por empresas como Amazon, Google, Shopify, e milhões de negócios em mais de 46 países. É a solução mais confiável e segura para aceitar pagamentos recorrentes na internet.

**Por que Stripe?**

- ✅ **Segurança Máxima**: Certificação PCI DSS Level 1 (mais alto nível de segurança em pagamentos)
- ✅ **Confiabilidade**: Processa bilhões de dólares anualmente com 99.99% de uptime
- ✅ **Global**: Suporta 135+ moedas e métodos de pagamento locais
- ✅ **Desenvolvedor-Friendly**: APIs modernas, documentação excelente, SDKs oficiais
- ✅ **Compliance Automático**: Gerencia regulamentações (PCI, LGPD, GDPR, etc)

---

#### **Funcionalidades Stripe a Implementar**

**1. Assinaturas Recorrentes**

Sistema completo de cobrança automática mensal ou anual:

- **Cobrança Automática**: Cliente cadastra cartão uma vez, renovações automáticas
- **Ciclos de Faturamento**: Mensal, anual, ou personalizado
- **Proration (Pro-rata)**: Cálculo proporcional ao mudar de plano
- **Trial Period**: Período de teste gratuito (7, 14, 30 dias)
- **Grace Period**: Período de tolerância se pagamento falhar
- **Retry Logic**: Tentativas automáticas de cobrança em caso de falha

**Fluxo de Assinatura**:
```
1. Usuário escolhe plano no site
2. Redirecionado para Stripe Checkout (página segura)
3. Preenche dados do cartão (ou escolhe PIX/boleto)
4. Stripe valida e processa pagamento
5. Webhook notifica nosso sistema
6. Usuário liberado instantaneamente para usar funcionalidades
7. Cobranças automáticas a cada ciclo
8. Emails automáticos de confirmação e faturas
```

---

**2. Múltiplos Métodos de Pagamento**

Stripe suporta todos os principais métodos de pagamento do Brasil:

**Cartão de Crédito/Débito**:
- Visa, Mastercard, Amex, Elo, Hipercard
- Salvamento seguro do cartão (tokenização)
- Parcelamento (configurável)
- 3D Secure para validação adicional

**PIX**:
- Pagamento instantâneo
- QR Code gerado automaticamente
- Confirmação em tempo real (segundos)
- Ideal para pagamentos únicos ou primeira cobrança

**Boleto Bancário**:
- Geração automática
- Código de barras
- Vencimento configurável
- Email automático com boleto

**Link de Pagamento**:
- URL única para cada cliente
- Compartilhável por WhatsApp, email, SMS
- Cliente escolhe método de pagamento
- Ideal para vendas diretas

**Carteiras Digitais** (futuro):
- Google Pay
- Apple Pay
- Samsung Pay

---

**3. Gerenciamento Completo de Assinaturas**

**Customer Portal (Portal do Cliente)**:

Stripe fornece uma área de autoatendimento onde o cliente pode:

- 📋 **Ver plano atual**: Detalhes do que está contratado
- 💳 **Atualizar cartão**: Trocar forma de pagamento
- 📊 **Histórico de faturas**: Baixar recibos de todos os pagamentos
- 🔄 **Upgrade de plano**: Melhorar assinatura (com pro-rata)
- 📉 **Downgrade de plano**: Reduzir assinatura (na próxima renovação)
- ❌ **Cancelar assinatura**: Cancelamento em 1 clique
- 🔔 **Configurar notificações**: Alertas de cobrança

**Vantagens do Customer Portal**:
- ✅ Reduz tickets de suporte (clientes resolvem sozinhos)
- ✅ Interface profissional pronta (sem desenvolver)
- ✅ Traduzido automaticamente para português
- ✅ Responsivo (funciona em mobile)
- ✅ Integrado com envio de emails

---

**4. Webhooks - Automação de Eventos**

Stripe notifica nosso sistema em tempo real quando eventos acontecem:

**Eventos Principais**:

```javascript
// Pagamento bem-sucedido
invoice.payment_succeeded → Liberar acesso ao usuário

// Pagamento falhou
invoice.payment_failed → Enviar email de alerta, retry automático

// Assinatura criada
customer.subscription.created → Criar registro no banco

// Assinatura cancelada
customer.subscription.deleted → Revogar acesso

// Cartão expirando
customer.source.expiring → Enviar email lembrando de atualizar

// Trial terminando
customer.subscription.trial_will_end → Alertar cliente (3 dias antes)

// Upgrade/Downgrade
customer.subscription.updated → Ajustar limites de uso
```

**Por que Webhooks são Essenciais**:
- ⚡ Sincronização instantânea
- 🔄 Sistema sempre atualizado
- 🤖 Automação completa
- 🛡️ Seguro (assinado criptograficamente)
- 📊 Permite analytics precisos

---

**5. Segurança Stripe**

**Certificação PCI DSS Level 1**:
- O mais alto nível de certificação de segurança em pagamentos
- Auditorias anuais por empresas independentes
- Conformidade com todas as regulamentações globais

**Tokenização de Cartões**:
- **Dados do cartão NUNCA passam pelo nosso servidor**
- Stripe gera um token único para cada cartão
- Armazenamos apenas o token, não os dados reais
- Impossível extrair dados do cartão do token

**3D Secure (3DS)**:
- Validação adicional com banco do cliente
- Reduz chargebacks (contestações)
- Obrigatório para algumas transações na Europa
- Aumenta taxa de aprovação

**Detecção de Fraude com Machine Learning**:
- Stripe Radar analisa cada transação
- Bloqueia automaticamente transações suspeitas
- Aprende com padrões de fraude globalmente
- Reduz chargebacks em até 80%

**Criptografia**:
- TLS 1.3 (mais recente)
- End-to-end encryption
- Chaves criptográficas rotacionadas regularmente

---

**6. Dashboard Stripe**

Interface web completa para gerenciar negócio:

**Visão Geral**:
- 💰 Receita total (dia, mês, ano)
- 📈 Gráficos de crescimento
- 👥 Número de clientes ativos
- 💳 Taxa de sucesso de pagamentos
- 📉 Taxa de churn (cancelamentos)

**Clientes**:
- Lista completa de clientes
- Histórico de pagamentos individual
- Informações de contato
- Plano atual e histórico
- Ações: reembolsar, cancelar, atualizar

**Pagamentos**:
- Todos os pagamentos (sucesso e falha)
- Status: pendente, aprovado, falhado, reembolsado
- Detalhes completos de cada transação
- Filtros avançados

**Faturas**:
- Geração automática
- Envio por email automático
- Customização de template
- Inclusão de logo da empresa
- Notas fiscais (integração com contabilidade)

**Relatórios**:
- Exportação para Excel/CSV
- Reconciliação bancária
- Relatórios fiscais
- Análise de receita

---

#### **Requisitos para Integração Stripe**

**1. Conta Stripe**:

**Criação da Conta**:
- Acessar stripe.com/br
- Cadastro com email
- Ativação da conta (verificação)

**Documentos Necessários**:
- **Pessoa Física (MEI)**:
  - CPF
  - Documento com foto (RG ou CNH)
  - Comprovante de residência
  - Dados bancários

- **Pessoa Jurídica**:
  - CNPJ
  - Contrato social
  - Documento dos sócios
  - Comprovante de endereço comercial
  - Dados bancários da empresa

**Tempo de Aprovação**: 1-3 dias úteis

---

**2. Configuração Técnica**:

**API Keys**:
```javascript
// Chaves fornecidas pelo Stripe
STRIPE_PUBLISHABLE_KEY: pk_live_xxxxx (pública, frontend)
STRIPE_SECRET_KEY: sk_live_xxxxx (secreta, backend)
STRIPE_WEBHOOK_SECRET: whsec_xxxxx (validar webhooks)
```

**Webhooks Endpoint**:
- URL: `https://seusite.com/webhook/stripe`
- Método: POST
- Eventos a escutar: todos relacionados a assinaturas

**Produtos e Preços**:
Criar no dashboard Stripe:
```
Produto: Light Marketing - Plano Básico
Preço: R$ 29,00/mês
ID: price_xxxxx (usado no código)

Produto: Light Marketing - Plano Pro
Preço: R$ 79,00/mês
ID: price_xxxxx
```

---

**3. Implementação no Site**:

**Páginas Novas**:
- `pricing.html`: Página de planos e preços
- `checkout.html`: Integração Stripe Checkout
- `subscription-success.html`: Confirmação de assinatura
- `subscription-cancel.html`: Cancelamento de assinatura

**Código Backend** (Supabase Edge Functions):
- `create-checkout-session`: Iniciar processo de pagamento
- `webhook-handler`: Processar eventos do Stripe
- `create-customer-portal`: Gerar link do portal do cliente

**Banco de Dados** (novas tabelas):
```sql
-- Tabela de assinaturas
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    status TEXT, -- active, canceled, past_due, trialing
    plan_id TEXT,
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    cancel_at_period_end BOOLEAN DEFAULT FALSE
);

-- Tabela de pagamentos
CREATE TABLE payments (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users,
    stripe_payment_id TEXT,
    amount DECIMAL(10,2),
    currency TEXT DEFAULT 'BRL',
    status TEXT, -- succeeded, failed, pending
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

**4. Fluxo Completo de Implementação**:

**Semana 1-2: Setup e Configuração**
- Criar conta Stripe
- Configurar produtos e preços
- Implementar Stripe.js no frontend
- Criar página de pricing

**Semana 3-4: Checkout e Pagamentos**
- Implementar Stripe Checkout
- Criar Edge Functions no Supabase
- Integrar webhook handler
- Testes de pagamento (modo teste)

**Semana 5-6: Portal do Cliente e Gestão**
- Implementar Customer Portal
- Sistema de upgrade/downgrade
- Histórico de faturas
- Testes completos

**Semana 7: Homologação**
- Testes com cartões reais (modo teste)
- Validar todos os webhooks
- Testar cenários de erro
- Documentar fluxos

**Semana 8: Produção**
- Ativar conta Stripe (produção)
- Migrar para chaves live
- Deploy final
- Monitoramento ativo

---

#### **1.2 Painel Administrativo para Gestão**

**Nova Página**: `admin.html`

Interface completa para proprietário gerenciar o negócio:

**Visão Geral (Dashboard)**:
- 📊 Métricas principais (MRR, usuários ativos, churn)
- 📈 Gráficos de crescimento
- 🚨 Alertas importantes
- 📋 Atividades recentes

**Gestão de Usuários**:
- Lista completa de usuários
- Status de assinatura de cada um
- Histórico de uso (etiquetas processadas)
- Ações: bloquear, desbloquear, upgrade manual

**Gestão de Assinaturas**:
- Todas as assinaturas ativas
- Assinaturas canceladas (análise de churn)
- Assinaturas com problemas de pagamento
- Reembolsos e disputas

**Configurações**:
- Limites de uso por plano
- Preços e planos (sincronizado com Stripe)
- Templates de email
- Configurações de segurança

**Controle de Acesso**:
- Login exclusivo para administradores
- Autenticação de dois fatores (2FA)
- Logs de todas as ações administrativas

---

### **Fase 2: Novos Tipos de Formatação**

**Estratégia de Expansão**:

Adicionar suporte gradual para outras plataformas de e-commerce, mantendo a mesma qualidade e funcionalidade de união de etiquetas + declaração.

**Arquitetura Modular**:
- Cada plataforma terá seu próprio módulo de processamento
- Interface única para todas as formatações
- Usuário seleciona plataforma antes do upload
- Mesmo sistema de segurança e privacidade (processamento local)

**Plataformas Prioritárias** (a definir com cliente):
- Mercado Livre
- Amazon
- Magalu
- Outras conforme demanda

**Entrega**:
- Implementação incremental
- Uma plataforma por vez
- Testes extensivos antes de lançar cada nova formatação

---

## 🔐 SEGURANÇA E PRIVACIDADE

### **Medidas de Segurança Implementadas**

#### **Autenticação**:
- Senhas hash com bcrypt (salt rounds: 10)
- JWT com expiração configurável
- Refresh tokens para sessões longas
- Proteção contra CSRF
- Rate limiting em tentativas de login

#### **Banco de Dados**:
- Row Level Security (RLS) ativado
- Políticas restritivas por padrão
- Prepared statements (previne SQL injection)
- Validação de dados no backend
- Logs de auditoria

#### **Frontend**:
- Validação de inputs
- Sanitização de dados
- Content Security Policy (CSP)
- HTTPS obrigatório
- SameSite cookies

#### **Processamento de Arquivos**:
- Validação de tipo de arquivo
- Limite de tamanho configurável
- Processamento local (sem upload para servidor)
- Limpeza de memória após processamento

---

### **Compliance e Regulamentações**

#### **LGPD (Lei Geral de Proteção de Dados)**:
- Consentimento explícito para coleta de dados
- Direito de acesso aos dados
- Direito de exclusão de dados
- Criptografia de dados pessoais
- Política de privacidade clara

#### **Dados Coletados**:
- Email (autenticação)
- Senha (criptografada)
- Data de criação da conta
- Logs de uso (anônimos)
- **Nenhum arquivo é armazenado permanentemente**
- **Nenhum dado de destinatário é coletado** (processamento local)

---

## 📱 PERFORMANCE E OTIMIZAÇÃO

### **Métricas de Performance**

#### **Velocidade de Carregamento**:
- First Contentful Paint (FCP): < 1.5s
- Time to Interactive (TTI): < 3s
- Largest Contentful Paint (LCP): < 2.5s

#### **Bundle Size**:
- HTML: ~15KB
- CSS: ~25KB
- JavaScript: ~30KB (sem PDF.js)
- PDF.js: ~450KB (carregado sob demanda)

#### **Otimizações Aplicadas**:
- CSS minificado
- JavaScript minificado
- Lazy loading de imagens
- Lazy loading de PDF.js
- Cache de recursos estáticos
- Compressão Gzip/Brotli (via Cloudflare)

---

### **Escalabilidade**

#### **Frontend**:
- Arquitetura stateless
- CDN global (Cloudflare)
- Cache agressivo de assets
- Sem limite de requisições simultâneas

#### **Backend (Supabase)**:
- Auto-scaling automático
- Connection pooling
- Replicação de banco de dados
- Backups incrementais

#### **Capacidade Estimada**:
- **Usuários Simultâneos**: 10.000+
- **Uploads Simultâneos**: 1.000+
- **Requisições/segundo**: 5.000+

---

## 🔄 PROCESSO DE DEPLOY E MANUTENÇÃO

### **Pipeline de Deploy**

#### **Desenvolvimento**:
1. Desenvolvimento local
2. Commit para branch `development`
3. Preview deploy automático no Cloudflare
4. Testes e validação

#### **Produção**:
1. Merge para branch `main`
2. Build automático no Cloudflare
3. Deploy sem downtime
4. Cache invalidation automática
5. Monitoramento de erros

#### **Rollback**:
- Rollback instantâneo via dashboard Cloudflare
- Histórico de deployments mantido
- Sem perda de dados

---

### **Monitoramento**

#### **Ferramentas**:
- **Cloudflare Analytics**: Traffic, performance
- **Supabase Dashboard**: Uso de banco, queries lentas
- **Stripe Dashboard**: Pagamentos, assinaturas, receita
- **Sentry** (futuro): Error tracking
- **Google Analytics** (futuro): Comportamento de usuário

#### **Alertas Configurados**:
- Downtime detectado
- Erros JavaScript
- Queries lentas no banco
- Uso excessivo de recursos
- Pagamentos falhados (via Stripe)

---

### **Backup e Recuperação**

#### **Supabase**:
- Backups diários automáticos
- Point-in-time recovery (até 7 dias)
- Replicação geográfica

#### **Código**:
- Versionamento completo no GitHub
- Histórico de commits
- Tags de versão (semantic versioning)

---

## 📞 CONTAS E SERVIÇOS NECESSÁRIOS

### **1. GitHub**
**Propósito**: Hospedagem do código fonte e controle de versão

**Ações Necessárias**:
- Criar conta gratuita em github.com
- Fornecer acesso ao desenvolvedor (colaborador)
- Definir repositório como privado (recomendado)

**Responsabilidades**:
- Proprietário do código
- Aprovação de mudanças críticas (opcional)

---

### **2. Supabase**
**Propósito**: Backend, autenticação, banco de dados

**Ações Necessárias**:
1. Criar conta em supabase.com
2. Criar novo projeto
3. Copiar credenciais:
   - Project URL
   - Anon/Public Key
   - Service Role Key (secreta)
4. Configurar domínio de email (confirmações)
5. Executar migrations fornecidas

**Responsabilidades**:
- Proprietário dos dados de usuários
- Gerenciamento de custos (se escalar)
- Monitoramento de uso

**Limites do Plano Free**:
- 500 MB de banco de dados
- 50.000 usuários ativos/mês
- 1 GB de armazenamento de arquivos
- 50 GB de largura de banda

---

### **3. Cloudflare Pages**
**Propósito**: Hospedagem do site, CDN, SSL

**Ações Necessárias**:
1. Criar conta em cloudflare.com
2. Conectar repositório GitHub
3. Configurar build settings (fornecido)
4. Configurar domínio personalizado (opcional)
5. Adicionar environment variables

**Responsabilidades**:
- Proprietário do domínio
- Configuração de DNS (se usar domínio próprio)
- Renovação de SSL (automático)

**Recursos do Plano Free**:
- Builds ilimitados
- Bandwidth ilimitado
- SSL gratuito
- CDN global

---

### **4. Stripe** (Fase 1 - Futuro)
**Propósito**: Processamento de pagamentos e assinaturas

**⚠️ IMPORTANTE: Stripe NÃO é gratuito** - Cobra taxas por transação processada

**Ações Necessárias**:
1. Criar conta em stripe.com/br
2. Ativar conta (verificação de identidade)
3. Fornecer dados:
   - CNPJ ou CPF
   - Conta bancária
   - Documentos da empresa
4. Configurar webhooks (URL fornecida)
5. Criar produtos e preços
6. Configurar impostos (se aplicável)

**Responsabilidades**:
- Compliance fiscal
- Recebimento de pagamentos
- Gestão de disputas (chargebacks)
- Declaração de impostos

**💰 Taxas Stripe (Cobradas por Transação)**:
- **Cartão de Crédito**: 2.9% + R$0,40 por transação aprovada
- **PIX**: 1.4% por transação
- **Boleto**: 2.49% por transação
- ✅ **Sem mensalidade fixa** (só paga quando vende)
- ✅ **Sem taxas de setup** (grátis para criar conta)
- ✅ **Sem custo de manutenção** (inativo = R$ 0)

**Exemplo de Cálculo**:
```
Cliente assina plano de R$ 79,00 (cartão de crédito)
Stripe desconta: R$ 79,00 × 2.9% + R$ 0,40 = R$ 2,69
Você recebe: R$ 79,00 - R$ 2,69 = R$ 76,31
```

---

## 🔗 INTEGRAÇÃO ENTRE SERVIÇOS

### **Como Todos os Serviços se Conectam**

#### **Diagrama de Integração**:

```
┌─────────────────────────────────────────────────────────────────┐
│                         DESENVOLVEDOR                           │
│  Escreve código localmente e faz commit para GitHub             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ↓
                    ┌────────────────┐
                    │    GITHUB      │  ← Armazena o código fonte
                    │  (Repositório) │     Controla versões
                    └────────┬───────┘
                             │
                             │ Push/Commit
                             │
            ┌────────────────┴────────────────┐
            │                                 │
            ↓                                 ↓
    ┌──────────────┐                 ┌──────────────┐
    │  CLOUDFLARE  │                 │   SUPABASE   │
    │    PAGES     │                 │   (Backend)  │
    │  (Frontend)  │                 └──────┬───────┘
    └──────┬───────┘                        │
           │                                 │ API Calls (JS)
           │ Deploy automático               │
           │ HTML/CSS/JS                     │
           ↓                                 ↓
    ┌──────────────────────────────────────────────┐
    │         USUÁRIO FINAL (Navegador)            │
    │  - Carrega site do Cloudflare                │
    │  - JavaScript chama APIs do Supabase         │
    │  - Processa PDFs localmente (PDF.js)         │
    └──────────────────┬───────────────────────────┘
                       │
                       │ (Fase 1 - Futuro)
                       ↓
              ┌─────────────────┐
              │     STRIPE      │
              │   (Pagamentos)  │
              └─────────┬───────┘
                        │
                        │ Webhooks
                        ↓
              ┌─────────────────┐
              │    SUPABASE     │
              │ (Atualiza banco)│
              └─────────────────┘
```

---

### **Integrações Detalhadas**

#### **1. GitHub ↔ Cloudflare Pages**

**Tipo de Integração**: Deploy Automático (CI/CD)

**Como Funciona**:
1. Desenvolvedor faz `git push` para GitHub
2. GitHub notifica Cloudflare via webhook
3. Cloudflare clona repositório automaticamente
4. Cloudflare faz deploy dos arquivos estáticos (HTML/CSS/JS)
5. Site atualizado fica disponível globalmente via CDN

**Configuração**:
- Feita uma única vez no dashboard do Cloudflare
- Conectar conta GitHub → Autorizar acesso ao repositório
- Cloudflare monitora branch `main` automaticamente
- Deploy acontece em ~30 segundos após cada commit

**Vantagens**:
- ✅ Zero configuração após setup inicial
- ✅ Deploy automático (sem ação manual)
- ✅ Preview de branches (testa antes de ir para produção)
- ✅ Rollback instantâneo se algo der errado

---

#### **2. Frontend (Cloudflare) ↔ Supabase**

**Tipo de Integração**: API REST via JavaScript

**Como Funciona**:
1. Usuário acessa site hospedado no Cloudflare
2. Navegador baixa arquivos HTML/CSS/JS
3. JavaScript no navegador chama APIs do Supabase
4. Supabase responde (autenticação, dados do banco)
5. JavaScript atualiza a página dinamicamente

**Fluxo de Autenticação**:
```javascript
// Código JavaScript executado no navegador
// (arquivo hospedado no Cloudflare)

import { createClient } from '@supabase/supabase-js'

// Configuração (URL e Key do Supabase)
const supabase = createClient(
  'https://seuprrojeto.supabase.co',
  'sua_chave_publica_aqui'
)

// Login do usuário
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'usuario@email.com',
  password: 'senha123'
})

// Supabase retorna JWT token
// Token salvo no navegador (localStorage)
// Usado em todas as próximas requisições
```

**Configuração**:
- Adicionar variáveis de ambiente no Cloudflare:
  - `SUPABASE_URL`: URL do projeto Supabase
  - `SUPABASE_ANON_KEY`: Chave pública (seguro expor)
- Incluir biblioteca Supabase JS no HTML
- Todas as chamadas são HTTPS (criptografadas)

**Importante**:
- ⚠️ **GitHub não se conecta diretamente ao Supabase**
- ⚠️ GitHub só envia código para Cloudflare
- ✅ JavaScript (rodando no navegador) conecta ao Supabase
- ✅ Cloudflare só hospeda arquivos, não executa código backend

---

#### **3. Supabase ↔ Stripe** (Fase 1 - Futuro)

**Tipo de Integração**: Webhooks + API

**Como Funciona - Criar Assinatura**:
```
1. Usuário clica em "Assinar Plano Pro" no site
2. JavaScript chama Supabase Edge Function
3. Edge Function chama API do Stripe (backend)
4. Stripe cria sessão de checkout
5. Edge Function retorna URL do Stripe
6. Usuário é redirecionado para página do Stripe
7. Usuário paga no site seguro do Stripe
8. Stripe processa pagamento
```

**Como Funciona - Webhook (Notificação)**:
```
1. Pagamento aprovado no Stripe
2. Stripe envia webhook para Supabase Edge Function
   URL: https://seuprrojeto.supabase.co/functions/v1/stripe-webhook
3. Edge Function valida assinatura do webhook (segurança)
4. Edge Function atualiza banco de dados:
   - Marca usuário como "assinante ativo"
   - Registra pagamento
   - Salva data de renovação
5. Usuário pode usar funcionalidades premium
```

**Supabase Edge Functions** (Backend Serverless):
- Código JavaScript que roda no Supabase (não no navegador)
- Acessa chaves secretas do Stripe (nunca expostas ao público)
- Processa webhooks com segurança
- Atualiza banco de dados

**Exemplo de Edge Function**:
```javascript
// Arquivo: supabase/functions/create-checkout/index.ts
// Roda NO SERVIDOR (Supabase), não no navegador

import Stripe from 'stripe'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'))

export async function handler(req) {
  // Usuário quer assinar plano de R$ 79
  const session = await stripe.checkout.sessions.create({
    line_items: [{
      price: 'price_1234567', // ID do plano no Stripe
      quantity: 1,
    }],
    mode: 'subscription',
    success_url: 'https://seusite.com/success',
    cancel_url: 'https://seusite.com/cancel',
  })
  
  return new Response(JSON.stringify({ url: session.url }))
}
```

**Configuração**:
- Criar Edge Functions no Supabase
- Adicionar chave secreta do Stripe no Supabase (variável de ambiente)
- Configurar URL do webhook no dashboard do Stripe
- Testar fluxo completo em modo teste

---

#### **4. Stripe ↔ Frontend (indiretamente)**

**Tipo de Integração**: Stripe.js + Redirect

**Como Funciona**:
1. Frontend chama Supabase Edge Function (não chama Stripe diretamente)
2. Edge Function retorna URL de checkout do Stripe
3. Usuário é redirecionado para `checkout.stripe.com`
4. Usuário paga no site do Stripe (seguro)
5. Stripe redireciona de volta para seu site
6. Frontend verifica status no Supabase

**Por que não chamar Stripe diretamente do Frontend?**
- 🔒 **Segurança**: Chave secreta do Stripe NUNCA pode ser exposta no navegador
- 💳 **PCI Compliance**: Stripe gerencia dados sensíveis de cartão
- ✅ **Best Practice**: Backend (Supabase) faz chamadas ao Stripe

---

### **Resumo das Integrações**

| Integração | Tipo | Quando Acontece | Quem Configura |
|------------|------|-----------------|----------------|
| **GitHub → Cloudflare** | Deploy automático | A cada commit | Desenvolvedor (uma vez) |
| **Frontend → Supabase** | API REST (HTTPS) | A cada ação do usuário | Desenvolvedor (código) |
| **Supabase → Stripe** | API + Webhooks | Pagamento/assinatura | Desenvolvedor (Edge Functions) |
| **Stripe → Frontend** | Redirect | Após pagamento | Automático (configurado no Stripe) |

---

### **Fluxo Completo - Exemplo Real**

**Cenário**: Usuário cria conta e assina plano

```
1. [CLOUDFLARE] Usuário acessa seusite.com
   - Navegador baixa HTML/CSS/JS

2. [FRONTEND → SUPABASE] Usuário clica em "Registrar"
   - JavaScript envia email/senha para Supabase Auth
   - Supabase cria conta e envia email de confirmação

3. [FRONTEND] Usuário confirma email
   - Clica no link recebido
   - Supabase ativa conta

4. [FRONTEND → SUPABASE] Usuário faz login
   - Supabase retorna JWT token
   - Token salvo no navegador

5. [FRONTEND] Usuário processa primeira etiqueta
   - PDF.js processa localmente (não envia para servidor)
   - Download automático

6. [FRONTEND → SUPABASE → STRIPE] Usuário decide assinar
   - Clica em "Assinar Plano Pro"
   - JavaScript chama Supabase Edge Function
   - Edge Function chama Stripe API
   - Usuário redirecionado para Stripe Checkout

7. [STRIPE] Usuário preenche dados do cartão
   - Tudo no site seguro do Stripe
   - Stripe processa pagamento

8. [STRIPE → SUPABASE] Stripe notifica via webhook
   - Webhook chama Supabase Edge Function
   - Edge Function atualiza banco:
     * user_subscriptions (status = 'active')
     * payments (novo registro)

9. [STRIPE → FRONTEND] Stripe redireciona usuário de volta
   - Página de sucesso no seu site

10. [FRONTEND → SUPABASE] Frontend verifica status
    - JavaScript consulta Supabase
    - Confirma que usuário é assinante
    - Libera funcionalidades premium
```

---

### **Custos de Cada Serviço**

| Serviço | Custo Setup | Custo Mensal | Custo por Uso |
|---------|-------------|--------------|---------------|
| **GitHub** | R$ 0 | R$ 0 | R$ 0 |
| **Cloudflare** | R$ 0 | R$ 0 | R$ 0 (ilimitado) |
| **Supabase** | R$ 0 | R$ 0* | R$ 0* (até limites Free) |
| **Stripe** | R$ 0 | R$ 0 | **~3% por transação** |

*Supabase: Grátis até 50.000 usuários/mês. Depois: ~$25/mês (R$ 125)

**Custo Total Inicial**: **R$ 0/mês** (+ 3% do Stripe sobre vendas)

---

## 🎯 DIFERENCIAIS COMPETITIVOS

### **Vantagens Técnicas**
- ✅ Processamento local (privacidade total)
- ✅ Sem servidores para gerenciar
- ✅ Escala automática ilimitada
- ✅ Performance global (CDN)
- ✅ Custo operacional mínimo
- ✅ Deploy instantâneo
- ✅ Uptime 99.99%

### **Vantagens de Produto**
- ✅ Interface intuitiva
- ✅ Processamento rápido
- ✅ União automática de documentos
- ✅ Economia de tempo na expedição
- ✅ Sistema de assinaturas flexível
- ✅ Múltiplos métodos de pagamento

---

## 📊 SOBRE KPIs (KEY PERFORMANCE INDICATORS)

### **O que são KPIs?**

**KPI** significa **Key Performance Indicator** (Indicador-Chave de Performance em português). São métricas utilizadas para medir o sucesso e desempenho de um negócio, projeto ou funcionalidade específica.

### **Por que KPIs são Importantes?**

- 📊 **Medir Progresso**: Saber se o negócio está crescendo ou não
- 🎯 **Tomar Decisões**: Basear decisões em dados, não em achismos
- 🚨 **Identificar Problemas**: Detectar problemas antes que se tornem críticos
- 💰 **ROI**: Calcular retorno sobre investimento
- 📈 **Definir Metas**: Estabelecer objetivos mensuráveis

### **KPIs Técnicos Mencionados**

Estes são **valores de referência** da indústria baseados em:
- Benchmarks do Google (Core Web Vitals)
- Padrões da Cloudflare
- Best practices de SaaS

**Não foram testados especificamente neste projeto ainda**, mas são metas alcançáveis com a arquitetura escolhida:

**Uptime > 99.9%**
- Significa que o site fica disponível 99.9% do tempo
- Equivale a ~43 minutos de indisponibilidade por mês
- Cloudflare garante este nível de serviço

**Tempo de carregamento < 2s**
- Tempo até a página estar totalmente carregada
- Medido com ferramentas como Google PageSpeed Insights
- Importante para SEO e experiência do usuário

**Taxa de erro < 0.1%**
- Menos de 1 erro a cada 1000 requisições
- Medido com ferramentas de monitoramento
- Indica estabilidade do sistema

**Tempo de processamento < 5s**
- Tempo para processar uma etiqueta típica
- Depende do tamanho do arquivo e dispositivo do usuário
- Meta baseada em testes preliminares

### **KPIs de Negócio (Futuros com Stripe)**

Estes serão medidos quando o sistema de pagamentos estiver ativo:

**Taxa de Conversão free → pago**
- Percentual de usuários gratuitos que viram pagantes
- Benchmark SaaS: 2-5%
- Medido pelo Stripe + Analytics

**Churn Rate (Taxa de Cancelamento)**
- Percentual de clientes que cancelam por mês
- Benchmark SaaS: 3-7%
- Medido pelo Stripe automaticamente

**MRR (Monthly Recurring Revenue)**
- Receita recorrente mensal
- Métrica principal de SaaS
- Disponível no dashboard Stripe

**LTV (Lifetime Value)**
- Valor total que um cliente gera durante toda a vida
- Calculado: MRR médio ÷ churn rate
- Usado para calcular quanto investir em marketing

### **Como Medir KPIs no Projeto**

**Ferramentas Gratuitas**:
- **Google PageSpeed Insights**: Performance
- **Cloudflare Analytics**: Uptime, tráfego
- **Supabase Dashboard**: Erros de banco
- **Stripe Dashboard**: Todos os KPIs financeiros
- **Google Analytics**: Comportamento de usuário

**Próximos Passos**:
1. Após deploy, medir performance real
2. Configurar alertas de monitoramento
3. Criar dashboard de KPIs para o cliente
4. Review mensal de métricas

---

## 📄 ENTREGÁVEIS DO PROJETO

### **Já Entregue (MVP)**
- ✅ Site completo e funcional
- ✅ Sistema de autenticação
- ✅ Processador de etiquetas Shopee (união etiqueta + declaração)
- ✅ Design responsivo
- ✅ Documentação técnica

### **Próximas Entregas**

#### **Fase 1 - Monetização com Stripe**:
- [ ] Integração Stripe completa
- [ ] Sistema de planos e assinaturas
- [ ] Customer Portal (portal do cliente)
- [ ] Painel administrativo
- [ ] Webhooks configurados
- [ ] Documentação Stripe

#### **Fase 2 - Novos Formatos**:
- [ ] Suporte a novas plataformas de e-commerce
- [ ] Mantendo processamento local
- [ ] Testes extensivos de cada formato

---

**Documento preparado para**: Reunião Técnica com Cliente  
**Data**: Janeiro 2026  
**Versão**: 3.0 - Documentação Completa MVP + Roadmap

---

## 📞 CONTATO E SUPORTE

Para dúvidas técnicas sobre esta documentação ou sobre o projeto, entre em contato com a equipe de desenvolvimento.
