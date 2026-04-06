// Configuração centralizada do site - Light Marketing
// Os valores padrão são usados como fallback.
// Quando a tabela site_settings estiver preenchida, esses valores são sobrescritos.
// Versão: 2.0

const SITE_CONFIG = {
    // Dados da empresa
    empresa: {
        razaoSocial: 'Light Marketing Gestão de Marketplace LTDA',
        nomeFantasia: 'Light Marketing',
        cnpj: '54.910.242/0001-41',
        inscricaoEstadual: '004879910.00-45',
        porte: 'Micro Empresa',
        naturezaJuridica: 'Sociedade Empresária Limitada',
        dataAbertura: '26/04/2024',
        capitalSocial: 'R$ 30.000,00',
        optanteSimples: true,
        cnaePrincipal: '73.19-0-99 - Outras atividades de publicidade não especificadas anteriormente',
        cnaeSecundario: '47.82-2-01 - Comércio varejista de calçados'
    },

    // Endereço
    endereco: {
        logradouro: 'Praça Ana Rosa de São José',
        numero: '46',
        complemento: 'Sala 201',
        bairro: 'Centro',
        cidade: 'Nova Serrana',
        estado: 'Minas Gerais',
        uf: 'MG',
        cep: '35520-063',
        get completo() {
            const parts = [this.logradouro, this.numero, this.complemento].filter(Boolean);
            return `${parts.join(', ')}, ${this.cidade} - ${this.uf}, CEP ${this.cep}`;
        }
    },

    // Contato
    contato: {
        email: 'llightmarketingoficial@gmail.com',
        telefone: '(37) 99155-7510',
        whatsappLink: 'https://wa.link/m1vm4f'
    },

    // Site
    site: {
        nome: 'Light Marketing',
        descricao: 'Soluções inteligentes para e-commerce',
        url: window.location.origin,
        copyright: function(ano) {
            return `© ${ano || new Date().getFullYear()} ${SITE_CONFIG.empresa.nomeFantasia}. Todos os direitos reservados.`;
        }
    },

    // Dados legais
    legal: {
        foro: 'Comarca de Nova Serrana/MG',
        legislacao: 'legislação brasileira',
        dpo: {
            nome: 'Light Marketing - Encarregado de Dados',
            email: 'llightmarketingoficial@gmail.com'
        },
        dataTermos: '27/03/2026',
        dataPolitica: '27/03/2026'
    }
};

// Mapeamento: chave do DB → função que atualiza SITE_CONFIG
const _dbKeyMap = {
    company_name: (v) => { if (v) SITE_CONFIG.empresa.nomeFantasia = v; },
    cnpj:         (v) => { if (v) SITE_CONFIG.empresa.cnpj = v; },
    phone:        (v) => { if (v) SITE_CONFIG.contato.telefone = v; },
    email:        (v) => { if (v) { SITE_CONFIG.contato.email = v; SITE_CONFIG.legal.dpo.email = v; } },
    street:       (v) => { if (v) SITE_CONFIG.endereco.logradouro = v; },
    number:       (v) => { if (v) SITE_CONFIG.endereco.numero = v; },
    complement:   (v) => { SITE_CONFIG.endereco.complemento = v || ''; },
    city:         (v) => { if (v) SITE_CONFIG.endereco.cidade = v; },
    state:        (v) => { if (v) SITE_CONFIG.endereco.uf = v; },
    zip:          (v) => { if (v) SITE_CONFIG.endereco.cep = v; },
};

// Função utilitária para injetar dados da empresa em elementos HTML
function injectSiteConfig() {
    // Injeta em elementos com data-config="caminho.do.valor"
    document.querySelectorAll('[data-config]').forEach(el => {
        const path = el.getAttribute('data-config');
        const value = path.split('.').reduce((obj, key) => obj?.[key], SITE_CONFIG);
        if (value !== undefined && value !== null) {
            el.textContent = typeof value === 'function' ? value() : value;
        }
    });

    // Injeta copyright no footer
    document.querySelectorAll('[data-copyright]').forEach(el => {
        el.textContent = SITE_CONFIG.site.copyright();
    });

    // Injeta links com data-config-href
    document.querySelectorAll('[data-config-href]').forEach(el => {
        const path = el.getAttribute('data-config-href');
        const value = path.split('.').reduce((obj, key) => obj?.[key], SITE_CONFIG);
        if (value) {
            el.href = value;
        }
    });

    // Injeta emails com mailto:
    document.querySelectorAll('[data-config-email]').forEach(el => {
        const path = el.getAttribute('data-config-email');
        const value = path.split('.').reduce((obj, key) => obj?.[key], SITE_CONFIG);
        if (value) {
            el.href = `mailto:${value}`;
            if (!el.textContent.trim()) el.textContent = value;
        }
    });
}

// Carrega valores da tabela site_settings e re-injeta
async function loadSiteConfigFromDB() {
    try {
        const SUPABASE_URL  = 'https://tyymvawnrapoirshxskj.supabase.co';
        const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5eW12YXducmFwb2lyc2h4c2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NTc3NzQsImV4cCI6MjA4MTAzMzc3NH0.K43mjTGurBle5cwDjjehX8GRxBFYXKW3V4se4gtHaWc';

        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/site_settings?select=key,value`,
            { headers: { 'apikey': SUPABASE_ANON, 'Accept': 'application/json' } }
        );
        if (!res.ok) return;

        const rows = await res.json();
        rows.forEach(({ key, value }) => {
            if (_dbKeyMap[key]) _dbKeyMap[key](value);
        });

        // Re-injeta com os valores atualizados do banco
        injectSiteConfig();
    } catch {
        // Em caso de falha, os valores padrão já foram injetados
    }
}

// Auto-executa quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        injectSiteConfig();
        loadSiteConfigFromDB();
    });
} else {
    injectSiteConfig();
    loadSiteConfigFromDB();
}
