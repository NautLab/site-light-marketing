// Edge Function: sync-checkout-session
// Called immediately after a successful Stripe Checkout to sync the subscription
// to the DB without relying on the webhook. Works as a fallback / primary sync.

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

    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { session_id } = await req.json();
    if (!session_id || typeof session_id !== 'string') {
      return json({ error: 'Missing or invalid session_id' }, 400);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
    });

    // Retrieve checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Security check: session must belong to the requesting user
    if (session.metadata?.user_id !== user.id) {
      return json({ error: 'Forbidden: session does not belong to this user' }, 403);
    }

    if (session.mode !== 'subscription' || !session.subscription) {
      return json({ error: 'Not a subscription checkout session' }, 400);
    }

    if (session.payment_status !== 'paid') {
      return json({ error: 'Payment not completed', payment_status: session.payment_status }, 402);
    }

    const subId   = session.subscription as string;
    const custId  = session.customer as string;
    const planId  = session.metadata?.plan_id || null;
    const couponCode       = session.metadata?.coupon_code || '';
    const billingInterval  = session.metadata?.billing_interval || 'month';

    // Retrieve full subscription details from Stripe
    const stripeSub = await stripe.subscriptions.retrieve(subId);

    // Fetch plan name for snapshot
    let planNameSnapshot = '';
    if (planId) {
      const { data: planRow } = await adminClient
        .from('plans')
        .select('name')
        .eq('id', planId)
        .single();
      planNameSnapshot = planRow?.name || '';
    }

    // Upsert subscription row (idempotent — safe to call multiple times)
    const { error: upsertErr } = await adminClient.from('subscriptions').upsert({
      user_id:               user.id,
      plan_id:               planId,
      stripe_subscription_id: subId,
      stripe_customer_id:    custId,
      status:                stripeSub.status,
      current_period_start:  new Date(stripeSub.current_period_start * 1000).toISOString(),
      current_period_end:    new Date(stripeSub.current_period_end   * 1000).toISOString(),
      cancel_at_period_end:  stripeSub.cancel_at_period_end,
      billing_interval:      billingInterval,
      plan_name_snapshot:    planNameSnapshot,
      last_invoice_amount_cents: session.amount_total ?? null,
    }, { onConflict: 'stripe_subscription_id' });

    if (upsertErr) throw upsertErr;

    // Update profile — mark as paid subscriber and revoke any free_access
    const { error: profileErr } = await adminClient.from('profiles').update({
      subscription_tier:      'paid',
      stripe_customer_id:     custId,
      free_access:            false,
      free_access_plan_id:    null,
      free_access_granted_by: null,
      free_access_expires_at: null,
    }).eq('id', user.id);

    if (profileErr) throw profileErr;

    // Handle coupon increment (idempotent via unique constraint on coupon_redemptions)
    if (couponCode) {
      const { data: couponRow } = await adminClient
        .from('coupons')
        .select('id, times_redeemed')
        .eq('code', couponCode.toUpperCase())
        .maybeSingle();

      if (couponRow) {
        // Only insert redemption if not already recorded for this checkout session
        const { count } = await adminClient
          .from('coupon_redemptions')
          .select('id', { count: 'exact', head: true })
          .eq('coupon_id', couponRow.id)
          .eq('user_id', user.id)
          .eq('stripe_checkout_session_id', session.id);

        if ((count || 0) === 0) {
          await adminClient.from('coupon_redemptions').insert({
            coupon_id: couponRow.id,
            user_id: user.id,
            stripe_checkout_session_id: session.id,
          });
          await adminClient.from('coupons').update({
            times_redeemed: (couponRow.times_redeemed || 0) + 1,
          }).eq('id', couponRow.id);
        }
      }
    }

    return json({ success: true, status: stripeSub.status, plan_id: planId });

  } catch (err) {
    console.error('sync-checkout-session error:', err);
    return json({ error: err.message || 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
