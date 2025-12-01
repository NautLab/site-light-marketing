// =============================================
// CLOUDFLARE PAGES FUNCTION
// Stripe Webhook Handler
// =============================================

// Importar Supabase (adicione @supabase/supabase-js nas dependências)
import { createClient } from '@supabase/supabase-js';

export async function onRequestPost(context) {
    try {
        const stripe = require('stripe')(context.env.STRIPE_SECRET_KEY);
        
        // Obter signature do header
        const signature = context.request.headers.get('stripe-signature');
        
        if (!signature) {
            return new Response(JSON.stringify({ error: 'No signature' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Obter body raw
        const body = await context.request.text();
        
        // Verificar e construir evento
        let event;
        try {
            event = stripe.webhooks.constructEvent(
                body,
                signature,
                context.env.STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return new Response(JSON.stringify({ error: 'Invalid signature' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Inicializar Supabase com service role key
        const supabase = createClient(
            context.env.VITE_SUPABASE_URL,
            context.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        // Registrar webhook no banco
        await supabase.from('stripe_webhooks').insert({
            event_id: event.id,
            event_type: event.type,
            customer_id: event.data.object.customer,
            subscription_id: event.data.object.id,
            payload: event.data.object
        });
        
        // Processar diferentes tipos de eventos
        switch (event.type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                await handleSubscriptionUpdate(supabase, event.data.object);
                break;
                
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(supabase, event.data.object);
                break;
                
            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(supabase, event.data.object);
                break;
                
            case 'invoice.payment_failed':
                await handlePaymentFailed(supabase, event.data.object);
                break;
                
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
        
        // Marcar webhook como processado
        await supabase
            .from('stripe_webhooks')
            .update({ processed: true, processed_at: new Date().toISOString() })
            .eq('event_id', event.id);
        
        return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (error) {
        console.error('Webhook error:', error);
        
        return new Response(JSON.stringify({ 
            error: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// =============================================
// HELPER FUNCTIONS
// =============================================

async function handleSubscriptionUpdate(supabase, subscription) {
    const customerId = subscription.customer;
    const subscriptionId = subscription.id;
    const status = subscription.status;
    
    // Mapear plano do Stripe para tier
    let tier = 'free';
    const priceId = subscription.items.data[0]?.price.id;
    
    // Você precisa mapear os Price IDs para os tiers
    // Adicione os IDs reais do Stripe aqui
    if (priceId === 'price_BASIC_ID') {
        tier = 'basic';
    } else if (priceId === 'price_PREMIUM_ID') {
        tier = 'premium';
    }
    
    // Atualizar perfil do usuário
    const { error } = await supabase
        .from('profiles')
        .update({
            subscription_tier: tier,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_status: status,
            subscription_start_date: new Date(subscription.current_period_start * 1000).toISOString(),
            subscription_end_date: new Date(subscription.current_period_end * 1000).toISOString()
        })
        .eq('stripe_customer_id', customerId);
    
    if (error) {
        console.error('Error updating subscription:', error);
        throw error;
    }
}

async function handleSubscriptionDeleted(supabase, subscription) {
    const customerId = subscription.customer;
    
    // Reverter para plano free
    const { error } = await supabase
        .from('profiles')
        .update({
            subscription_tier: 'free',
            subscription_status: 'canceled',
            subscription_end_date: new Date().toISOString()
        })
        .eq('stripe_customer_id', customerId);
    
    if (error) {
        console.error('Error canceling subscription:', error);
        throw error;
    }
}

async function handlePaymentSucceeded(supabase, invoice) {
    const customerId = invoice.customer;
    
    // Atualizar status para ativo
    const { error } = await supabase
        .from('profiles')
        .update({
            subscription_status: 'active'
        })
        .eq('stripe_customer_id', customerId);
    
    if (error) {
        console.error('Error updating payment status:', error);
        throw error;
    }
}

async function handlePaymentFailed(supabase, invoice) {
    const customerId = invoice.customer;
    
    // Atualizar status para past_due
    const { error } = await supabase
        .from('profiles')
        .update({
            subscription_status: 'past_due'
        })
        .eq('stripe_customer_id', customerId);
    
    if (error) {
        console.error('Error updating payment failure:', error);
        throw error;
    }
}
