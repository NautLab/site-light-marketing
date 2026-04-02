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

    const { plan_id, coupon_code } = await req.json();
    if (!plan_id) return json({ error: 'Missing plan_id' }, 400);

    // Load plan from DB
    const { data: plan, error: planErr } = await adminClient
      .from('plans')
      .select('*')
      .eq('id', plan_id)
      .eq('is_active', true)
      .single();

    if (planErr || !plan) return json({ error: 'Plan not found or inactive' }, 404);
    if (!plan.stripe_price_id) return json({ error: 'Plan has no Stripe price configured' }, 400);

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
    });

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
      const codes = await stripe.promotionCodes.list({ code: coupon_code, active: true, limit: 1 });
      if (codes.data.length > 0) {
        discounts = [{ promotion_code: codes.data[0].id }];
      }
    }

    // Build session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      discounts,
      success_url: `${SITE_URL}/index.html?checkout=success`,
      cancel_url:  `${SITE_URL}/index.html?checkout=canceled`,
      metadata: {
        user_id: user.id,
        plan_id,
      },
      subscription_data: {
        metadata: { user_id: user.id, plan_id },
      },
      locale: 'pt-BR',
    });

    return json({ url: session.url });

  } catch (err) {
    console.error('create-checkout-session error:', err);
    return json({ error: err.message || 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
