// =============================================
// CLOUDFLARE PAGES FUNCTION
// Create Stripe Checkout Session
// =============================================

export async function onRequestPost(context) {
    try {
        // Parse request body
        const { priceId, customerId, successUrl, cancelUrl } = await context.request.json();
        
        // Validação
        if (!priceId) {
            return new Response(JSON.stringify({ error: 'Price ID é obrigatório' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Importar Stripe (precisa instalar como dependência do Cloudflare)
        // Para Cloudflare Pages, você precisará usar um bundler ou carregar via NPM
        const stripe = require('stripe')(context.env.STRIPE_SECRET_KEY);
        
        // Configuração da sessão
        const sessionConfig = {
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                }
            ],
            mode: 'subscription',
            success_url: successUrl || `${context.request.headers.get('origin')}/dashboard.html?checkout=success`,
            cancel_url: cancelUrl || `${context.request.headers.get('origin')}/dashboard.html?checkout=canceled`,
            metadata: {
                source: 'light-marketing-tool'
            },
            subscription_data: {
                metadata: {
                    source: 'light-marketing-tool'
                }
            }
        };
        
        // Se já tem customer ID, adicionar
        if (customerId) {
            sessionConfig.customer = customerId;
        } else {
            // Permitir que Stripe crie novo customer
            sessionConfig.customer_creation = 'always';
        }
        
        // Criar sessão de checkout
        const session = await stripe.checkout.sessions.create(sessionConfig);
        
        return new Response(JSON.stringify({ 
            sessionId: session.id,
            url: session.url
        }), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
        
    } catch (error) {
        console.error('Error creating checkout session:', error);
        
        return new Response(JSON.stringify({ 
            error: error.message || 'Erro ao criar sessão de checkout'
        }), {
            status: 500,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}

// Handle OPTIONS for CORS
export async function onRequestOptions(context) {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}
