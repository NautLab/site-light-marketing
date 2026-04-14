// Edge Function: switch-subscription
// Switches a user's subscription interval (e.g. annual→monthly) without going through
// Stripe Checkout, using the customer's saved payment method.
// This avoids the "X days free" text in the Checkout UI for long trial periods.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const stripe      = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });

    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) return json({ error: 'Não autorizado.' }, 401);

    const { current_subscription_id, new_plan_id, new_billing_interval } = await req.json();
    if (!current_subscription_id || !new_plan_id || !new_billing_interval) {
      return json({ error: 'Parâmetros obrigatórios em falta.' }, 400);
    }

    // Verify user owns the subscription
    const { data: currentSub } = await adminClient
      .from('subscriptions')
      .select('id, stripe_subscription_id, current_period_end, user_id, billing_interval')
      .eq('id', current_subscription_id)
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .single();

    if (!currentSub?.stripe_subscription_id) {
      return json({ error: 'Assinatura não encontrada.' }, 404);
    }

    // Load target plan
    const { data: plan } = await adminClient
      .from('plans')
      .select('*')
      .eq('id', new_plan_id)
      .eq('is_active', true)
      .single();

    if (!plan) return json({ error: 'Plano não encontrado ou inativo.' }, 404);

    const useAnnual   = new_billing_interval === 'year' && plan.annual_stripe_price_id;
    const stripePriceId = useAnnual ? plan.annual_stripe_price_id : plan.stripe_price_id;
    if (!stripePriceId) return json({ error: 'Plano sem preço Stripe configurado.' }, 400);

    // Get Stripe customer and their default payment method
    const { data: profile } = await adminClient
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_customer_id) return json({ error: 'Cliente Stripe não encontrado.' }, 400);

    const customer = await stripe.customers.retrieve(profile.stripe_customer_id) as Stripe.Customer;
    const paymentMethodId = customer.invoice_settings?.default_payment_method as string
      || (customer.default_source as string)
      || null;

    if (!paymentMethodId) {
      return json({ error: 'Nenhum método de pagamento salvo. Por favor, use o checkout.' }, 400);
    }

    // 1. Cancel current subscription at period end
    await stripe.subscriptions.update(currentSub.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    await adminClient
      .from('subscriptions')
      .update({ cancel_at_period_end: true })
      .eq('id', current_subscription_id);

    // 2. Create new subscription with trial_end = current period end
    const trialEndTs = Math.floor(new Date(currentSub.current_period_end).getTime() / 1000);

    const planNameSnapshot = plan.name || '';

    const newStripeSub = await stripe.subscriptions.create({
      customer: profile.stripe_customer_id,
      items: [{ price: stripePriceId }],
      default_payment_method: paymentMethodId,
      trial_end: trialEndTs,
      metadata: {
        user_id: user.id,
        plan_id: new_plan_id,
        billing_interval: new_billing_interval,
        coupon_code: '',
      },
    });

    // 3. Insert new subscription record in DB
    await adminClient.from('subscriptions').insert({
      user_id: user.id,
      plan_id: new_plan_id,
      stripe_subscription_id: newStripeSub.id,
      stripe_customer_id: profile.stripe_customer_id,
      status: newStripeSub.status,
      current_period_start: new Date(newStripeSub.current_period_start * 1000).toISOString(),
      current_period_end:   new Date(newStripeSub.current_period_end   * 1000).toISOString(),
      cancel_at_period_end: newStripeSub.cancel_at_period_end,
      billing_interval: new_billing_interval,
      plan_name_snapshot: planNameSnapshot,
    });

    return json({
      success: true,
      new_subscription_id: newStripeSub.id,
      trial_end: currentSub.current_period_end,
    });

  } catch (err) {
    console.error('switch-subscription error:', err);
    return json({ error: translateStripeError(err.message) || 'Erro interno.' }, 500);
  }
});

function translateStripeError(msg: string): string {
  if (!msg) return '';
  if (/no such customer/i.test(msg)) return 'Cliente não encontrado no Stripe.';
  if (/no such payment_method/i.test(msg)) return 'Método de pagamento não encontrado.';
  if (/no such price/i.test(msg)) return 'Preço não encontrado no Stripe.';
  if (/card.*declined/i.test(msg)) return 'Cartão recusado.';
  return msg;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
