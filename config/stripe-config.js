// =============================================
// STRIPE CONFIGURATION
// =============================================
// IMPORTANTE: Configure estas variáveis no Cloudflare Pages como Environment Variables

const STRIPE_CONFIG = {
    // Substitua com sua Publishable Key do Stripe
    // Encontre em: https://dashboard.stripe.com/apikeys
    publishableKey: import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_YOUR_KEY',
    
    // IDs dos produtos no Stripe (criar no dashboard)
    products: {
        basic: {
            priceId: 'price_BASIC_MONTHLY', // Substituir com ID real
            name: 'Plano Basic',
            price: 19.99,
            interval: 'month'
        },
        premium: {
            priceId: 'price_PREMIUM_MONTHLY', // Substituir com ID real
            name: 'Plano Premium',
            price: 49.99,
            interval: 'month'
        }
    }
};

// Inicializar Stripe
let stripe;

async function initStripe() {
    if (!window.Stripe) {
        console.error('Stripe.js não carregado');
        return null;
    }
    
    stripe = window.Stripe(STRIPE_CONFIG.publishableKey);
    console.log('✅ Stripe inicializado com sucesso!');
    return stripe;
}

// Criar sessão de checkout
async function createCheckoutSession(priceId, customerId, successUrl, cancelUrl) {
    try {
        // Chamar edge function do Cloudflare ou API própria
        const response = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                priceId,
                customerId,
                successUrl: successUrl || window.location.origin + '/dashboard.html?checkout=success',
                cancelUrl: cancelUrl || window.location.origin + '/dashboard.html?checkout=canceled'
            })
        });
        
        const session = await response.json();
        
        if (session.error) {
            throw new Error(session.error);
        }
        
        // Redirecionar para Stripe Checkout
        const result = await stripe.redirectToCheckout({
            sessionId: session.sessionId
        });
        
        if (result.error) {
            throw new Error(result.error.message);
        }
        
        return true;
    } catch (error) {
        console.error('Erro ao criar sessão de checkout:', error);
        return false;
    }
}

// Criar portal de gerenciamento de assinatura
async function createCustomerPortal(customerId) {
    try {
        const response = await fetch('/api/create-portal-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                customerId,
                returnUrl: window.location.origin + '/dashboard.html'
            })
        });
        
        const session = await response.json();
        
        if (session.error) {
            throw new Error(session.error);
        }
        
        // Redirecionar para portal do cliente
        window.location.href = session.url;
        return true;
    } catch (error) {
        console.error('Erro ao criar portal do cliente:', error);
        return false;
    }
}

// Formatar preço
function formatPrice(cents, currency = 'BRL') {
    const amount = cents / 100;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

// Exportar para uso global
window.StripeClient = {
    config: STRIPE_CONFIG,
    initStripe,
    createCheckoutSession,
    createCustomerPortal,
    formatPrice
};

// Inicializar automaticamente quando o Stripe.js estiver disponível
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.Stripe) {
            initStripe();
        }
    });
} else if (window.Stripe) {
    initStripe();
}
