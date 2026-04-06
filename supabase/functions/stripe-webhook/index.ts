// Edge Function: stripe-webhook
// Handles Stripe events to keep subscriptions + profiles in sync
// NOTE: Set STRIPE_WEBHOOK_SECRET via: supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2024-06-20',
  });

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const sig = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  let event: Stripe.Event;

  try {
    const rawBody = await req.arrayBuffer();
    const payload = new TextDecoder().decode(rawBody);

    if (webhookSecret && sig) {
      event = await stripe.webhooks.constructEventAsync(payload, sig, webhookSecret);
    } else {
      // No signature verification (dev mode — do NOT use in production without secret)
      event = JSON.parse(payload) as Stripe.Event;
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(JSON.stringify({ error: 'Webhook error: ' + err.message }), { status: 400 });
  }

  try {
    switch (event.type) {

      // ── Checkout completed ─────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const userId    = session.metadata?.user_id;
        const planId    = session.metadata?.plan_id;
        const subId     = session.subscription as string;
        const custId    = session.customer as string;

        if (!userId || !subId) break;

        const stripeSub = await stripe.subscriptions.retrieve(subId);

        // Upsert subscription
        await adminClient.from('subscriptions').upsert({
          user_id: userId,
          plan_id: planId || null,
          stripe_subscription_id: subId,
          stripe_customer_id: custId,
          status: stripeSub.status,
          current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
          current_period_end:   new Date(stripeSub.current_period_end   * 1000).toISOString(),
          cancel_at_period_end: stripeSub.cancel_at_period_end,
        }, { onConflict: 'stripe_subscription_id' });

        // Update profile – mark as paid subscriber
        await adminClient.from('profiles').update({
          subscription_tier: 'paid',
          stripe_customer_id: custId,
        }).eq('id', userId);

        break;
      }

      // ── Subscription updated ───────────────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;

        const { data: dbSub } = await adminClient
          .from('subscriptions')
          .select('user_id, plan_id')
          .eq('stripe_subscription_id', sub.id)
          .single();

        if (!dbSub) break;

        await adminClient.from('subscriptions').update({
          status: sub.status,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end:   new Date(sub.current_period_end   * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
          canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
        }).eq('stripe_subscription_id', sub.id);

        break;
      }

      // ── Subscription deleted / canceled ───────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;

        const { data: dbSub } = await adminClient
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .single();

        if (!dbSub) break;

        await adminClient.from('subscriptions').update({
          status: 'canceled',
          canceled_at: new Date().toISOString(),
        }).eq('stripe_subscription_id', sub.id);

        // Downgrade profile (only if not free_access)
        const { data: profile } = await adminClient
          .from('profiles')
          .select('free_access')
          .eq('id', dbSub.user_id)
          .single();

        if (!profile?.free_access) {
          await adminClient.from('profiles').update({
            subscription_tier: 'free',
          }).eq('id', dbSub.user_id);
        }

        break;
      }

      // ── Payment failed ─────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;

        if (subId) {
          await adminClient.from('subscriptions').update({
            status: 'past_due',
          }).eq('stripe_subscription_id', subId);
        }
        break;
      }

      default:
        // Unhandled event – ignore silently
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
