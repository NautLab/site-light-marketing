// Edge Function: admin-create-plan
// Creates a Stripe product + price, then saves the plan to DB
// Requires: caller must be admin or super_admin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: 'Unauthorized' }, 401);

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || !['admin', 'super_admin'].includes(callerProfile.role)) {
      return json({ error: 'Forbidden' }, 403);
    }

    const {
      name,
      description,
      price_brl,
      observation,
      monthly_limit = null,
      unlocked_screens = [],
      annual_price_brl = null,
      annual_observation = null,
    } = await req.json();

    if (!name || !price_brl || price_brl <= 0) {
      return json({ error: 'Missing required fields' }, 400);
    }
    if (annual_price_brl != null && annual_price_brl <= 0) {
      return json({ error: 'Invalid annual price' }, 400);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
    });

    // Create Stripe product (one product for both intervals)
    const product = await stripe.products.create({
      name,
      description: description || undefined,
      metadata: {},
    });

    // Create monthly Stripe price (BRL, in centavos)
    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(price_brl * 100),
      currency: 'brl',
      recurring: { interval: 'month' },
    });

    // Optionally create annual Stripe price
    let annualStripeId: string | null = null;
    if (annual_price_brl) {
      const annualPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(annual_price_brl * 100),
        currency: 'brl',
        recurring: { interval: 'year' },
      });
      annualStripeId = annualPrice.id;
    }

    // Save to DB (single row with both intervals)
    const { data: plan, error } = await adminClient
      .from('plans')
      .insert({
        name,
        description: description || null,
        interval: 'month',
        price_brl,
        observation: observation || null,
        monthly_limit: monthly_limit || null,
        unlocked_screens: unlocked_screens || [],
        stripe_product_id: product.id,
        stripe_price_id: monthlyPrice.id,
        annual_price_brl: annual_price_brl || null,
        annual_stripe_price_id: annualStripeId,
        annual_observation: annual_observation || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return json({ success: true, plan });

  } catch (err) {
    console.error('admin-create-plan error:', err);
    return json({ error: err.message || 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
