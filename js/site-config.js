// Configuração centralizada do site - Light Marketing
// Altere os dados aqui e serão refletidos em todo o site e documentos legais.
// Versão: 1.0

const SITE_CONFIG = Object.freeze({
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
            return `${this.logradouro}, ${this.numero}, ${this.complemento}, ${this.bairro}, ${this.cidade} - ${this.uf}, CEP ${this.cep}`;
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
});

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

// Auto-executa quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSiteConfig);
} else {
    injectSiteConfig();
}
