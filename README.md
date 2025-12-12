# Light Marketing - Formatador de Etiquetas Shopee

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

## 📋 Sobre o Projeto

Site desenvolvido para automatizar o processamento de etiquetas de envio da Shopee. A ferramenta combina PDFs de etiquetas com planilhas XLSX para gerar etiquetas formatadas e prontas para impressão, suportando tanto Correios quanto Xpress.

## ✨ Funcionalidades

- ✅ Upload de arquivos PDF e XLSX
- ✅ Processamento automático de etiquetas
- ✅ Suporte para Correios e Xpress
- ✅ Sistema de autenticação de usuários
- ✅ Confirmação de e-mail obrigatória
- ✅ Recuperação de senha
- ✅ Interface moderna e responsiva
- ✅ Formatação otimizada para impressão
- ✅ 100% gratuito e seguro

## 🚀 Tecnologias Utilizadas

- HTML5
- CSS3
- JavaScript (Vanilla)
- PDF.js
- SheetJS (xlsx)
- Supabase (Auth & Database)

## 💻 Como Usar

1. Acesse o site
2. Faça upload do arquivo PDF de etiquetas da Shopee
3. Faça upload da planilha XLSX correspondente
4. Clique em "Processar Arquivos"
5. Aguarde o processamento
6. Baixe as etiquetas formatadas

## 📦 Estrutura do Projeto

```
site-light-marketing/
├── index.html              # Página principal
├── login.html              # Página de login
├── register.html           # Página de registro
├── forgot-password.html    # Recuperação de senha
├── reset-password.html     # Redefinição de senha
├── style.css               # Estilos principais
├── css/
│   └── auth.css           # Estilos de autenticação
├── js/
│   ├── supabase-config.js # Configuração Supabase
│   └── auth.js            # Funções de autenticação
├── script.js              # Lógica da aplicação
├── supabase/
│   ├── config.toml        # Configuração local Supabase
│   └── migrations/        # Migrações do banco de dados
├── image.png              # Logo
├── favicon.ico            # Ícone do site
└── README.md              # Documentação
```

## 🔐 Autenticação e Segurança

Este projeto utiliza **Supabase Auth** para gerenciamento seguro de usuários:

- **Confirmação de e-mail obrigatória** após registro
- **Row Level Security (RLS)** no banco de dados
- **Sessões seguras** com tokens JWT
- **Recuperação de senha** via e-mail
- **Checkbox "Lembrar de mim"** para persistência de sessão

### ⚙️ Configuração Necessária

Para o funcionamento completo do sistema de autenticação:

1. **Supabase Dashboard**: Configure as URLs de redirect em:
   - Site URL: `https://site-light-marketing.pages.dev`
   - Redirect URLs: `https://site-light-marketing.pages.dev/**`

2. **E-mails de Autenticação**:
   - Por padrão, o Supabase envia e-mails de confirmação e recuperação usando seu servidor SMTP
   - Para usar um e-mail personalizado (ex: `noreply@site-light-marketing.com.br`):
     - Acesse: Supabase Dashboard → Authentication → Email Templates
     - Configure SMTP customizado em: Settings → Auth → SMTP Settings
     - **Requisitos**: Servidor SMTP configurado ou serviço como SendGrid/Postmark
     - **Disponibilidade**: Planos Pro ou superior, ou configuração manual via SMTP externo

### 📧 Comportamento de E-mails

**Plano Gratuito do Supabase:**
- E-mails são enviados pelo servidor padrão do Supabase
- Podem levar alguns minutos para chegar
- Podem cair na caixa de spam
- Limite de 4 e-mails/hora por usuário

**Com SMTP Personalizado (Futuro):**
- E-mails enviados do seu domínio
- Maior confiabilidade de entrega
- Templates totalmente customizáveis
- Sem limitações de taxa

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 👥 Contato

Light Marketing - [WhatsApp](https://wa.link/m1vm4f)

---

Desenvolvido com ❤️ por Light Marketing
