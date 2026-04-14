// Edge Function: create-checkout-session
// Creates a Stripe Checkout session for a plan subscription
// Called by the user-facing checkout flow (not yet built – placeholder ready)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Production URL – must match the deployed domain
const SITE_URL = Deno.env.get('SITE_URL') || 'https://site-light-marketing.pages.dev';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { plan_id, coupon_code, billing_interval, ui_mode, trial_end } = await req.json();
    if (!plan_id) return json({ error: 'Missing plan_id' }, 400);

    // Load plan from DB
    const { data: plan, error: planErr } = await adminClient
      .from('plans')
      .select('*')
      .eq('id', plan_id)
      .eq('is_active', true)
      .single();

    if (planErr || !plan) return json({ error: 'Plano não encontrado ou inativo.' }, 404);

    // Determine which Stripe price to use based on billing interval
    const useAnnual = billing_interval === 'year' && plan.annual_stripe_price_id;
    const stripePriceId = useAnnual ? plan.annual_stripe_price_id : plan.stripe_price_id;
    if (!stripePriceId) return json({ error: 'Plano sem preço Stripe configurado.' }, 400);

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
    });

    // ── Guard: one active subscription at a time ──
    // Check if user already has an active subscription that is NOT scheduled for cancellation.
    // - cancel_at_period_end = false → user has not committed to canceling → block.
    // - cancel_at_period_end = true  → sub is being canceled at period end →
    //   cancel it immediately now and proceed to create the new one.
    const { data: existingSubs } = await adminClient
      .from('subscriptions')
      .select('id, stripe_subscription_id, cancel_at_period_end')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing']);

    if (existingSubs && existingSubs.length > 0) {
      const blocking = existingSubs.filter(s => !s.cancel_at_period_end);

      if (trial_end) {
        // Switch-interval flow: schedule all active subs to cancel at period end, keep access
        for (const sub of blocking) {
          if (sub.stripe_subscription_id) {
            try { await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true }); } catch (_) {}
          }
          await adminClient.from('subscriptions').update({ cancel_at_period_end: true }).eq('id', sub.id);
        }
        // Already-scheduled subs: leave them running until period end
      } else {
        if (blocking.length > 0) {
          return json({
            error: 'Você já possui uma assinatura ativa. Cancele o plano atual antes de assinar um novo.',
          }, 409);
        }

        // Only subs already scheduled to cancel — cancel them immediately and proceed
        for (const sub of existingSubs) {
          if (sub.stripe_subscription_id) {
            try { await stripe.subscriptions.cancel(sub.stripe_subscription_id); } catch (_) {}
          }
          await adminClient.from('subscriptions').update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
          }).eq('id', sub.id);
        }
      }
    }

    // Get or create Stripe customer
    const { data: profile } = await adminClient
      .from('profiles')
      .select('email, full_name, stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email || user.email,
        name:  profile?.full_name || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await adminClient
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Resolve optional promotion code
    let discounts: { promotion_code: string }[] | undefined;
    if (coupon_code) {
      // Validate per-user limit before creating session
      const { data: couponRow } = await adminClient
        .from('coupons')
        .select('id, max_redemptions_per_user')
        .eq('code', coupon_code.toUpperCase())
        .eq('is_active', true)
        .single();

      if (couponRow?.max_redemptions_per_user) {
        const { count } = await adminClient
          .from('coupon_redemptions')
          .select('id', { count: 'exact', head: true })
          .eq('coupon_id', couponRow.id)
          .eq('user_id', user.id);

        if ((count || 0) >= couponRow.max_redemptions_per_user) {
          return json({ error: 'Você já atingiu o limite individual de usos deste cupom.' }, 400);
        }
      }

      const codes = await stripe.promotionCodes.list({ code: coupon_code, active: true, limit: 1 });
      if (codes.data.length > 0) {
        discounts = [{ promotion_code: codes.data[0].id }];
      }
    }

    // Build session
    const sessionParams: Record<string, unknown> = {
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      discounts,
      metadata: {
        user_id: user.id,
        plan_id,
        coupon_code: coupon_code || '',
        billing_interval: billing_interval || 'month',
      },
      subscription_data: {
        metadata: { user_id: user.id, plan_id, coupon_code: coupon_code || '', billing_interval: billing_interval || 'month' },
        ...(trial_end ? { billing_cycle_anchor: Math.floor(new Date(trial_end).getTime() / 1000), proration_behavior: 'none' } : {}),
      },
      locale: 'pt-BR',
    };

    if (ui_mode === 'embedded') {
      sessionParams.ui_mode = 'embedded';
      sessionParams.return_url = `${SITE_URL}/planos.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    } else {
      sessionParams.success_url = `${SITE_URL}/planos.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
      sessionParams.cancel_url  = `${SITE_URL}/planos.html?checkout=canceled`;
    }

    const session = await stripe.checkout.sessions.create(sessionParams as Stripe.Checkout.SessionCreateParams);

    if (ui_mode === 'embedded') {
      return json({ clientSecret: session.client_secret });
    }
    return json({ url: session.url });

  } catch (err) {
    console.error('create-checkout-session error:', err);
    return json({ error: translateStripeError(err.message) || 'Erro interno' }, 500);
  }
});

function translateStripeError(msg: string): string {
  if (!msg) return '';
  if (/already been refunded/i.test(msg)) return 'Este pagamento já foi reembolsado integralmente.';
  if (/greater than unrefunded amount/i.test(msg)) return 'Valor de reembolso maior que o disponível na cobrança.';
  if (/no such subscription/i.test(msg)) return 'Assinatura não encontrada no Stripe.';
  if (/no such price/i.test(msg)) return 'Preço não encontrado no Stripe.';
  if (/no such customer/i.test(msg)) return 'Cliente não encontrado no Stripe.';
  if (/card.*declined/i.test(msg)) return 'Cartão recusado.';
  if (/authentication_required/i.test(msg)) return 'Autenticação adicional exigida pelo banco.';
  return msg;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
