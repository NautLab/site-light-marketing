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
        const couponCode = session.metadata?.coupon_code;
        const billingInterval = session.metadata?.billing_interval || 'month';
        const subId     = session.subscription as string;
        const custId    = session.customer as string;

        if (!userId || !subId) break;

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
          billing_interval: billingInterval,
          plan_name_snapshot: planNameSnapshot,
          last_invoice_amount_cents: session.amount_total ?? null,
        }, { onConflict: 'stripe_subscription_id' });

        // Update profile – mark as paid subscriber
        await adminClient.from('profiles').update({
          subscription_tier: 'paid',
          stripe_customer_id: custId,
        }).eq('id', userId);

        // ── Increment coupon usage ───────────────────────
        if (couponCode) {
          const { data: couponRow } = await adminClient
            .from('coupons')
            .select('id, times_redeemed')
            .eq('code', couponCode.toUpperCase())
            .single();

          if (couponRow) {
            await adminClient
              .from('coupons')
              .update({ times_redeemed: (couponRow.times_redeemed || 0) + 1 })
              .eq('id', couponRow.id);

            await adminClient
              .from('coupon_redemptions')
              .insert({
                coupon_id: couponRow.id,
                user_id: userId,
                stripe_checkout_session_id: session.id,
              });
          }
        }

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

        // Check if user has another active/trialing subscription
        const { count: otherActiveSubs } = await adminClient
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', dbSub.user_id)
          .in('status', ['active', 'trialing'])
          .neq('stripe_subscription_id', sub.id);

        // Downgrade profile only if no other active subs and not free_access
        if ((otherActiveSubs || 0) === 0) {
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
        }

        break;
      }

      // ── Payment succeeded (recurring renewals) ─────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (subId && invoice.amount_paid > 0) {
          await adminClient.from('subscriptions').update({
            last_invoice_amount_cents: invoice.amount_paid,
          }).eq('stripe_subscription_id', subId);
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

      // ── Charge refunded (catches manual refunds from Stripe Dashboard) ──
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = charge.payment_intent as string;
        if (!paymentIntentId) break;

        // Retrieve payment intent to get the invoice
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        const invoiceId = pi.invoice as string;
        if (!invoiceId) break;

        const invoice = await stripe.invoices.retrieve(invoiceId);
        const subId = invoice.subscription as string;
        if (!subId) break;

        // Find user in DB via subscription
        const { data: dbSub } = await adminClient
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subId)
          .maybeSingle();
        if (!dbSub) break;

        // If user is currently blocked, set the flag so access won't be restored on unblock
        const { data: profile } = await adminClient
          .from('profiles')
          .select('is_blocked')
          .eq('id', dbSub.user_id)
          .single();

        if (profile?.is_blocked) {
          await adminClient
            .from('profiles')
            .update({ blocked_refund_issued: true })
            .eq('id', dbSub.user_id);
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
