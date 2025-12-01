# =============================================
# SCRIPT DE SETUP AUTOMATIZADO
# Light Marketing - Sistema de Autenticacao
# =============================================

Write-Host "Iniciando setup do projeto Light Marketing..." -ForegroundColor Cyan
Write-Host ""

# =============================================
# 1. VERIFICAR DEPENDENCIAS
# =============================================

Write-Host "Verificando dependencias..." -ForegroundColor Yellow

# Verificar Node.js
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-Host "✅ Node.js instalado: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "❌ Node.js não encontrado. Instale em: https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Verificar npm
if (Get-Command npm -ErrorAction SilentlyContinue) {
    $npmVersion = npm --version
    Write-Host "✅ npm instalado: v$npmVersion" -ForegroundColor Green
} else {
    Write-Host "❌ npm não encontrado." -ForegroundColor Red
    exit 1
}

# Verificar Git
if (Get-Command git -ErrorAction SilentlyContinue) {
    $gitVersion = git --version
    Write-Host "✅ Git instalado: $gitVersion" -ForegroundColor Green
} else {
    Write-Host "❌ Git não encontrado. Instale em: https://git-scm.com" -ForegroundColor Red
    exit 1
}

Write-Host ""

# =============================================
# 2. INSTALAR DEPENDENCIAS DAS FUNCTIONS
# =============================================

Write-Host "Instalando dependencias do Cloudflare Functions..." -ForegroundColor Yellow

if (Test-Path "functions") {
    Set-Location functions
    
    if (Test-Path "package.json") {
        npm install
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Dependências instaladas com sucesso!" -ForegroundColor Green
        } else {
            Write-Host "❌ Erro ao instalar dependências" -ForegroundColor Red
            Set-Location ..
            exit 1
        }
    } else {
        Write-Host "⚠️ package.json não encontrado em functions/" -ForegroundColor Yellow
    }
    
    Set-Location ..
} else {
    Write-Host "⚠️ Diretório functions/ não encontrado" -ForegroundColor Yellow
}

Write-Host ""

# =============================================
# 3. VERIFICAR ARQUIVO .env
# =============================================

Write-Host "Verificando configuracao de ambiente..." -ForegroundColor Yellow

if (Test-Path ".env") {
    Write-Host "✅ Arquivo .env encontrado" -ForegroundColor Green
    
    # Verificar se as variáveis estão configuradas
    $envContent = Get-Content .env -Raw
    
    if ($envContent -match "YOUR_PROJECT" -or $envContent -match "YOUR_KEY") {
        Write-Host "ATENCAO: Variaveis de ambiente ainda nao configuradas!" -ForegroundColor Yellow
        Write-Host "   Edite o arquivo .env com suas credenciais reais." -ForegroundColor Yellow
    } else {
        Write-Host "Variaveis de ambiente configuradas" -ForegroundColor Green
    }
} else {
    Write-Host "Arquivo .env nao encontrado. Criando a partir de .env.example..." -ForegroundColor Yellow
    
    if (Test-Path ".env.example") {
        Copy-Item .env.example .env
        Write-Host "✅ Arquivo .env criado! Configure suas credenciais." -ForegroundColor Green
        Write-Host "   Edite: .env" -ForegroundColor Cyan
    } else {
        Write-Host "❌ .env.example não encontrado" -ForegroundColor Red
    }
}

Write-Host ""

# =============================================
# 4. VERIFICAR SUPABASE
# =============================================

Write-Host "Verificando configuracao do Supabase..." -ForegroundColor Yellow

if (Test-Path ".env") {
    $envContent = Get-Content .env -Raw
    
    if ($envContent -match "VITE_SUPABASE_URL=https://[a-z0-9]+\.supabase\.co") {
        Write-Host "✅ URL do Supabase configurada" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Configure VITE_SUPABASE_URL no arquivo .env" -ForegroundColor Yellow
        Write-Host "   1. Acesse: https://supabase.com/dashboard" -ForegroundColor Cyan
        Write-Host "   2. Crie um novo projeto ou selecione existente" -ForegroundColor Cyan
        Write-Host "   3. Vá em Settings > API" -ForegroundColor Cyan
        Write-Host "   4. Copie 'Project URL' e 'anon/public key'" -ForegroundColor Cyan
    }
    
    if ($envContent -match "VITE_SUPABASE_ANON_KEY=eyJ") {
        Write-Host "✅ Supabase Anon Key configurada" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Configure VITE_SUPABASE_ANON_KEY no arquivo .env" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️ Arquivo .env não encontrado" -ForegroundColor Yellow
}

Write-Host ""

# =============================================
# 5. VERIFICAR SQL SCRIPT
# =============================================

Write-Host "Verificando script SQL do banco de dados..." -ForegroundColor Yellow

if (Test-Path "supabase-setup.sql") {
    Write-Host "✅ Script SQL encontrado: supabase-setup.sql" -ForegroundColor Green
    Write-Host "   Execute este script no Supabase SQL Editor:" -ForegroundColor Cyan
    Write-Host "   1. Acesse: https://supabase.com/dashboard/project/_/sql" -ForegroundColor Cyan
    Write-Host "   2. Cole o conteúdo de supabase-setup.sql" -ForegroundColor Cyan
    Write-Host "   3. Clique em 'Run' para criar as tabelas" -ForegroundColor Cyan
} else {
    Write-Host "❌ Script SQL não encontrado" -ForegroundColor Red
}

Write-Host ""

# =============================================
# 6. VERIFICAR STRIPE
# =============================================

Write-Host "Verificando configuracao do Stripe..." -ForegroundColor Yellow

if (Test-Path ".env") {
    $envContent = Get-Content .env -Raw
    
    if ($envContent -match "VITE_STRIPE_PUBLISHABLE_KEY=pk_") {
        Write-Host "✅ Stripe Publishable Key configurada" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Configure VITE_STRIPE_PUBLISHABLE_KEY no arquivo .env" -ForegroundColor Yellow
        Write-Host "   1. Acesse: https://dashboard.stripe.com/apikeys" -ForegroundColor Cyan
        Write-Host "   2. Copie 'Publishable key' (começa com pk_test_)" -ForegroundColor Cyan
    }
    
    if ($envContent -match "STRIPE_SECRET_KEY=sk_") {
        Write-Host "✅ Stripe Secret Key configurada" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Configure STRIPE_SECRET_KEY no arquivo .env" -ForegroundColor Yellow
    }
    
    if ($envContent -match "STRIPE_BASIC_PRICE_ID=price_") {
        Write-Host "✅ Stripe Price IDs configurados" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Configure os Price IDs dos produtos Stripe" -ForegroundColor Yellow
        Write-Host "   1. Acesse: https://dashboard.stripe.com/products" -ForegroundColor Cyan
        Write-Host "   2. Crie 2 produtos: Basic (R$19,99) e Premium (R$49,99)" -ForegroundColor Cyan
        Write-Host "   3. Copie os Price IDs e adicione no .env" -ForegroundColor Cyan
    }
} else {
    Write-Host "⚠️ Arquivo .env não encontrado" -ForegroundColor Yellow
}

Write-Host ""

# =============================================
# 7. VERIFICAR ESTRUTURA DO PROJETO
# =============================================

Write-Host "Verificando estrutura do projeto..." -ForegroundColor Yellow

$requiredFiles = @(
    "index.html",
    "login.html",
    "register.html",
    "forgot-password.html",
    "reset-password.html",
    "dashboard.html",
    "config/supabase-config.js",
    "config/stripe-config.js",
    "js/auth.js",
    "js/dashboard.js",
    "css/auth.css",
    "css/dashboard.css"
)

$allFilesExist = $true

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file não encontrado" -ForegroundColor Red
        $allFilesExist = $false
    }
}

if ($allFilesExist) {
    Write-Host "✅ Todos os arquivos necessários estão presentes" -ForegroundColor Green
} else {
    Write-Host "⚠️ Alguns arquivos estão faltando" -ForegroundColor Yellow
}

Write-Host ""

# =============================================
# 8. TESTE DE SERVIDOR LOCAL
# =============================================

Write-Host "Informacoes de desenvolvimento..." -ForegroundColor Yellow

Write-Host "Para testar localmente, voce pode usar:" -ForegroundColor Cyan
Write-Host "  - Python: python -m http.server 8000" -ForegroundColor White
Write-Host "  - Node.js: npx serve" -ForegroundColor White
Write-Host "  - Wrangler (Cloudflare): npx wrangler pages dev ." -ForegroundColor White
Write-Host ""
Write-Host "Acesse: http://localhost:8000 (ou porta indicada)" -ForegroundColor Cyan

Write-Host ""

# =============================================
# 9. PROXIMOS PASSOS
# =============================================

Write-Host "PROXIMOS PASSOS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Configure o arquivo .env com suas credenciais" -ForegroundColor White
Write-Host "   Edite: .env" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Execute o script SQL no Supabase" -ForegroundColor White
Write-Host "   Arquivo: supabase-setup.sql" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Crie os produtos no Stripe (Basic e Premium)" -ForegroundColor White
Write-Host "   Dashboard: https://dashboard.stripe.com/products" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Configure environment variables no Cloudflare Pages" -ForegroundColor White
Write-Host "   Settings > Environment variables" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Faca deploy no Cloudflare Pages" -ForegroundColor White
Write-Host "   git push origin main" -ForegroundColor Gray
Write-Host ""
Write-Host "6. Configure o webhook do Stripe" -ForegroundColor White
Write-Host "   URL: https://seu-site.pages.dev/api/stripe-webhook" -ForegroundColor Gray
Write-Host ""

Write-Host "Documentacao completa:" -ForegroundColor Cyan
Write-Host "   - QUICK-START.md - Guia rapido (5 min)" -ForegroundColor White
Write-Host "   - README-AUTH.md - Documentacao detalhada" -ForegroundColor White
Write-Host "   - TODO.md - Checklist completo" -ForegroundColor White
Write-Host ""

Write-Host "Setup concluido! Boa sorte com o projeto!" -ForegroundColor Green
Write-Host ""
