// =============================================
// CLOUDFLARE PAGES FUNCTION
// Create Stripe Customer Portal Session
// =============================================

export async function onRequestPost(context) {
    try {
        // Parse request body
        const { customerId, returnUrl } = await context.request.json();
        
        // Validação
        if (!customerId) {
            return new Response(JSON.stringify({ error: 'Customer ID é obrigatório' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Importar Stripe
        const stripe = require('stripe')(context.env.STRIPE_SECRET_KEY);
        
        // Criar sessão do portal
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl || `${context.request.headers.get('origin')}/dashboard.html`,
        });
        
        return new Response(JSON.stringify({ 
            url: session.url
        }), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
        
    } catch (error) {
        console.error('Error creating portal session:', error);
        
        return new Response(JSON.stringify({ 
            error: error.message || 'Erro ao criar sessão do portal'
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
