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

    const { name, description, tier, interval, price_brl } = await req.json();

    if (!name || !tier || !interval || !price_brl || price_brl <= 0) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
    });

    // Create Stripe product
    const product = await stripe.products.create({
      name,
      description: description || undefined,
      metadata: { tier, interval },
    });

    // Create Stripe price (BRL, in centavos)
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(price_brl * 100),
      currency: 'brl',
      recurring: { interval: interval as 'month' | 'year' },
    });

    // Save to DB
    const { data: plan, error } = await adminClient
      .from('plans')
      .insert({
        name,
        description: description || null,
        tier,
        interval,
        price_brl,
        stripe_product_id: product.id,
        stripe_price_id: price.id,
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
