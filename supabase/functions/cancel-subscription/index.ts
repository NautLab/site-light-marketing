// Edge Function: cancel-subscription
// Cancels a Stripe subscription immediately or at period end
// Requires: admin or super_admin

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

    const isAdmin = ['admin', 'super_admin'].includes(callerProfile?.role ?? '');

    const { subscription_id, cancel_at_period_end = true, resume = false } = await req.json();
    if (!subscription_id) return json({ error: 'Missing subscription_id' }, 400);

    // Get Stripe subscription ID from DB
    const { data: sub } = await adminClient
      .from('subscriptions')
      .select('stripe_subscription_id, user_id')
      .eq('id', subscription_id)
      .single();

    if (!sub?.stripe_subscription_id) {
      return json({ error: 'Subscription not found or has no Stripe ID' }, 404);
    }

    // Allow if caller is admin OR is the subscription owner
    if (!isAdmin && sub.user_id !== caller.id) {
      return json({ error: 'Forbidden' }, 403);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
    });

    if (resume) {
      // Reactivate: remove scheduled cancellation
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: false,
      });

      await adminClient
        .from('subscriptions')
        .update({ cancel_at_period_end: false })
        .eq('id', subscription_id);

      return json({ success: true, resumed: true });
    }

    if (cancel_at_period_end) {
      // Cancel at period end
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      await adminClient
        .from('subscriptions')
        .update({ cancel_at_period_end: true })
        .eq('id', subscription_id);

    } else {
      // Cancel immediately
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);

      await adminClient
        .from('subscriptions')
        .update({ status: 'canceled', canceled_at: new Date().toISOString() })
        .eq('id', subscription_id);

      // Downgrade profile if no other active/trialing subscriptions and not free_access
      const { count: otherActive } = await adminClient
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', sub.user_id)
        .in('status', ['active', 'trialing'])
        .neq('id', subscription_id);

      if ((otherActive || 0) === 0) {
        const { data: profile } = await adminClient
          .from('profiles')
          .select('free_access')
          .eq('id', sub.user_id)
          .single();
        if (!profile?.free_access) {
          await adminClient
            .from('profiles')
            .update({ subscription_tier: 'free' })
            .eq('id', sub.user_id);
        }
      }
    }

    return json({ success: true, cancel_at_period_end });

  } catch (err) {
    console.error('cancel-subscription error:', err);
    return json({ error: err.message || 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
