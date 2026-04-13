// Edge Function: admin-update-user
// Handles: update_role, grant_free_access, revoke_free_access,
//          block_account, unblock_account, revoke_paid_subscription, refund, get_charge_info
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
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    // Client with caller's JWT (respects RLS – used ONLY to verify role)
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Service role client – bypasses RLS for privileged writes
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Identify caller
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) return json({ error: 'Unauthorized' }, 401);

    // Get caller's role
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || !['admin', 'super_admin'].includes(callerProfile.role)) {
      return json({ error: 'Forbidden: admin role required' }, 403);
    }

    const body = await req.json();
    const { action, target_user_id } = body;

    if (!action || !target_user_id) {
      return json({ error: 'Missing action or target_user_id' }, 400);
    }

    // Fetch target profile
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('role, email')
      .eq('id', target_user_id)
      .single();

    if (!targetProfile) return json({ error: 'Target user not found' }, 404);

    // Protect super_admins from non-super_admin callers
    if (callerProfile.role !== 'super_admin' && targetProfile.role === 'super_admin') {
      return json({ error: 'Forbidden: cannot modify a super_admin' }, 403);
    }

    // ── ACTION: update_role ──────────────────────────────
    if (action === 'update_role') {
      const newRole = body.role;
      const validRoles = ['user', 'admin', 'super_admin'];

      if (!validRoles.includes(newRole)) {
        return json({ error: 'Invalid role' }, 400);
      }

      // Only super_admin can assign super_admin
      if (newRole === 'super_admin' && callerProfile.role !== 'super_admin') {
        return json({ error: 'Forbidden: only super_admin can assign super_admin role' }, 403);
      }

      const { error } = await adminClient
        .from('profiles')
        .update({ role: newRole })
        .eq('id', target_user_id);

      if (error) throw error;
      return json({ success: true, role: newRole });
    }

    // ── ACTION: grant_free_access ────────────────────────
    if (action === 'grant_free_access') {
      const planId = body.free_access_plan_id;
      if (!planId) {
        return json({ error: 'Missing free_access_plan_id' }, 400);
      }

      // Validate optional expiry date
      const expiresAt = body.free_access_expires_at || null;
      if (expiresAt && isNaN(Date.parse(expiresAt))) {
        return json({ error: 'Invalid free_access_expires_at' }, 400);
      }

      // Verify the plan exists and is active
      const { data: plan } = await adminClient
        .from('plans')
        .select('id, name')
        .eq('id', planId)
        .single();

      if (!plan) {
        return json({ error: 'Plan not found' }, 404);
      }

      // Set free_access BEFORE canceling Stripe subs so the webhook
      // (customer.subscription.deleted) sees free_access=true and won't downgrade tier.
      const { error } = await adminClient
        .from('profiles')
        .update({
          free_access: true,
          free_access_plan_id: planId,
          free_access_granted_by: caller.id,
          free_access_expires_at: expiresAt,
          subscription_tier: 'paid',
          // Clear any leftover prev fields from a prior grant cycle
          free_access_prev_period_end: null,
          free_access_prev_plan_id: null,
        })
        .eq('id', target_user_id);

      if (error) throw error;

      // Cancel any active Stripe subscriptions immediately.
      // A user cannot have both a paid sub and free_access simultaneously.
      // Store the most recent period_end so we can give those days back on revoke.
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });

      const { data: activeSubs } = await adminClient
        .from('subscriptions')
        .select('id, stripe_subscription_id, current_period_end, plan_id')
        .eq('user_id', target_user_id)
        .in('status', ['active', 'trialing'])
        .order('current_period_end', { ascending: false });

      if (activeSubs && activeSubs.length > 0) {
        const mostRecent = activeSubs[0];
        // Store remaining period for restoration on revoke
        await adminClient.from('profiles').update({
          free_access_prev_period_end: mostRecent.current_period_end,
          free_access_prev_plan_id:    mostRecent.plan_id,
        }).eq('id', target_user_id);

        for (const sub of activeSubs) {
          if (sub.stripe_subscription_id) {
            try { await stripe.subscriptions.cancel(sub.stripe_subscription_id); } catch (_) {}
          }
          await adminClient.from('subscriptions').update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
          }).eq('id', sub.id);
        }
      }

      return json({ success: true, free_access: true, plan_id: planId, plan_name: plan.name, free_access_expires_at: expiresAt });
    }

    // ── ACTION: revoke_free_access ───────────────────────
    if (action === 'revoke_free_access') {
      // Check if there's a stored subscription period to give back as remaining days.
      // This happens when free_access was granted while the user had an active Stripe sub
      // that was cancelled at that time — on revoke, we restore those remaining days.
      const { data: currentProf } = await adminClient
        .from('profiles')
        .select('free_access_prev_period_end, free_access_prev_plan_id, free_access_plan_id')
        .eq('id', target_user_id)
        .single();

      const prevPeriodEnd = currentProf?.free_access_prev_period_end ?? null;
      const prevPlanId    = currentProf?.free_access_prev_plan_id ?? currentProf?.free_access_plan_id ?? null;
      const hasRemaining  = prevPeriodEnd && new Date(prevPeriodEnd) > new Date();

      if (hasRemaining && prevPlanId) {
        // Instead of fully revoking, give the remaining days from the original subscription.
        // Keep free_access=true but with expiry = original period_end.
        const { error } = await adminClient
          .from('profiles')
          .update({
            free_access: true,
            free_access_plan_id:    prevPlanId,
            free_access_granted_by: null,
            free_access_expires_at: prevPeriodEnd,
            free_access_prev_period_end: null,
            free_access_prev_plan_id:    null,
            subscription_tier: 'paid',
          })
          .eq('id', target_user_id);

        if (error) throw error;
        return json({ success: true, free_access: true, has_remaining_days: true, expires_at: prevPeriodEnd, plan_id: prevPlanId });
      }

      // No remaining days — full revoke
      const { error } = await adminClient
        .from('profiles')
        .update({
          free_access: false,
          free_access_plan_id:         null,
          free_access_granted_by:      null,
          free_access_expires_at:      null,
          free_access_prev_period_end: null,
          free_access_prev_plan_id:    null,
          subscription_tier: 'free',
        })
        .eq('id', target_user_id);

      if (error) throw error;
      return json({ success: true, free_access: false, has_remaining_days: false });
    }

    // ── ACTION: block_account ─────────────────────────
    if (action === 'block_account') {
      const blockedAt = new Date().toISOString();
      // Block and revoke all access atomically in a single DB write.
      // This prevents race conditions where separate revoke calls could fail
      // silently and leave free_access=true + subscription_tier='free' (inconsistent state).
      const updateData: Record<string, unknown> = {
        is_blocked: true,
        blocked_at: blockedAt,
        // Revoke access immediately — atomic with the block
        subscription_tier: 'free',
        free_access: false,
        free_access_plan_id: null,
        free_access_granted_by: null,
        free_access_expires_at: null,
      };
      // Store the subscription period so it can be restored on unblock
      if (body.blocked_sub_period_end) updateData.blocked_sub_period_end = body.blocked_sub_period_end;
      if (body.blocked_sub_plan_id)    updateData.blocked_sub_plan_id    = body.blocked_sub_plan_id;

      // If user has free_access, store that period too so it can be restored on unblock
      // The caller passes this when the user has free_access but no active Stripe sub
      if (body.blocked_free_access_period_end) updateData.blocked_sub_period_end = body.blocked_free_access_period_end;
      if (body.blocked_free_access_plan_id)    updateData.blocked_sub_plan_id    = body.blocked_free_access_plan_id;

      const { error } = await adminClient
        .from('profiles')
        .update(updateData)
        .eq('id', target_user_id);

      if (error) throw error;
      // Do NOT sign out the user — Realtime will push the block in real time
      return json({ success: true, is_blocked: true, blocked_at: blockedAt });
    }

    // ── ACTION: unblock_account ───────────────────────
    if (action === 'unblock_account') {
      // Fetch stored subscription data saved at block time
      const { data: blockedProfile } = await adminClient
        .from('profiles')
        .select('blocked_at, blocked_sub_period_end, blocked_sub_plan_id')
        .eq('id', target_user_id)
        .single();

      const updateData: Record<string, unknown> = {
        is_blocked: false,
        blocked_at: null,
        blocked_sub_period_end: null,
        blocked_sub_plan_id: null,
        blocked_refund_issued: false,
      };

      let freeAccessRestored = false;
      let freeAccessPlanId: string | null = null;
      let freeAccessExpiresAt: string | null = null;

      // Restore access using the number of days that were remaining at block time,
      // added to now — so even if blocked for years the user still gets those days.
      // If blocked_sub_period_end is null, user had unlimited access — restore without expiry.
      if (blockedProfile?.blocked_sub_plan_id) {
        if (!blockedProfile.blocked_sub_period_end) {
          // Unlimited access — restore without expiry date
          updateData.free_access            = true;
          updateData.free_access_plan_id    = blockedProfile.blocked_sub_plan_id;
          updateData.free_access_expires_at = null;
          updateData.free_access_granted_by = null;
          updateData.subscription_tier      = 'paid';
          freeAccessRestored  = true;
          freeAccessPlanId    = blockedProfile.blocked_sub_plan_id;
          freeAccessExpiresAt = null;
        } else if (blockedProfile.blocked_at) {
          const blockedAt   = new Date(blockedProfile.blocked_at).getTime();
          const periodEnd   = new Date(blockedProfile.blocked_sub_period_end).getTime();
          const remainingMs = periodEnd - blockedAt;   // milliseconds remaining at block time

          if (remainingMs > 0) {
            const restoredEnd = new Date(Date.now() + remainingMs).toISOString();
            updateData.free_access            = true;
            updateData.free_access_plan_id    = blockedProfile.blocked_sub_plan_id;
            updateData.free_access_expires_at = restoredEnd;
            updateData.free_access_granted_by = null;
            updateData.subscription_tier      = 'paid';
            freeAccessRestored  = true;
            freeAccessPlanId    = blockedProfile.blocked_sub_plan_id;
            freeAccessExpiresAt = restoredEnd;
          }
        }
      }

      const { error } = await adminClient
        .from('profiles')
        .update(updateData)
        .eq('id', target_user_id);

      if (error) throw error;
      return json({
        success: true,
        is_blocked: false,
        free_access_restored: freeAccessRestored,
        free_access_plan_id: freeAccessPlanId,
        free_access_expires_at: freeAccessExpiresAt,
      });
    }

    // ── ACTION: revoke_paid_subscription ─────────────
    if (action === 'revoke_paid_subscription') {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });

      // Cancel ALL active/trialing subscriptions (never just one — prevents orphaned subs)
      const { data: activeSubs } = await adminClient
        .from('subscriptions')
        .select('id, stripe_subscription_id')
        .eq('user_id', target_user_id)
        .in('status', ['active', 'trialing']);

      if (activeSubs && activeSubs.length > 0) {
        for (const sub of activeSubs) {
          if (sub.stripe_subscription_id) {
            try { await stripe.subscriptions.cancel(sub.stripe_subscription_id); } catch (_) {}
          }
          await adminClient.from('subscriptions').update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
          }).eq('id', sub.id);
        }
      } else {
        // No DB rows — try to cancel via Stripe customer_id from profile
        const { data: prof } = await adminClient
          .from('profiles')
          .select('stripe_customer_id')
          .eq('id', target_user_id)
          .single();

        if (prof?.stripe_customer_id) {
          try {
            const stripeSubs = await stripe.subscriptions.list({
              customer: prof.stripe_customer_id,
              status: 'active',
              limit: 5,
            });
            for (const s of stripeSubs.data) {
              await stripe.subscriptions.cancel(s.id);
            }
          } catch (_) {}
        }
      }

      // Only downgrade profile tier if the user does not have free_access
      // (consistent with cancel-subscription and stripe-webhook behaviour)
      const { data: userForRevoke } = await adminClient
        .from('profiles')
        .select('free_access')
        .eq('id', target_user_id)
        .single();

      if (!userForRevoke?.free_access) {
        await adminClient.from('profiles').update({
          subscription_tier: 'free',
        }).eq('id', target_user_id);
      }

      return json({ success: true, subscription_canceled: true });
    }

    // ── ACTION: delete_subscription ──────────────────
    if (action === 'delete_subscription') {
      const subscriptionId = body.subscription_id;
      if (!subscriptionId) return json({ error: 'Missing subscription_id' }, 400);

      // Only allow deletion of non-active subscriptions
      const { data: sub } = await adminClient
        .from('subscriptions')
        .select('id, status, user_id')
        .eq('id', subscriptionId)
        .single();

      if (!sub) return json({ error: 'Subscription not found' }, 404);
      if (sub.status === 'active' || sub.status === 'trialing') {
        return json({ error: 'Cannot delete an active subscription. Cancel it first.' }, 400);
      }

      const { error } = await adminClient
        .from('subscriptions')
        .delete()
        .eq('id', subscriptionId);

      if (error) throw error;
      return json({ success: true });
    }

    // ── ACTION: refund ───────────────────────────────
    if (action === 'refund') {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
      const amountCents = body.amount ? Math.round(parseFloat(body.amount) * 100) : undefined;

      // Find the most recent subscription with a Stripe ID (active or recently canceled)
      const { data: activeSub } = await adminClient
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', target_user_id)
        .not('stripe_subscription_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!activeSub?.stripe_subscription_id) return json({ error: 'No active subscription found' }, 404);

      // Get latest invoice from Stripe subscription
      const stripeSub = await stripe.subscriptions.retrieve(activeSub.stripe_subscription_id);
      const invoiceId = stripeSub.latest_invoice as string;
      if (!invoiceId) return json({ error: 'No invoice found for subscription' }, 404);

      const invoice = await stripe.invoices.retrieve(invoiceId);
      const paymentIntentId = invoice.payment_intent as string;
      if (!paymentIntentId) return json({ error: 'No payment intent found for invoice' }, 404);

      // Create refund (full or partial)
      const refundParams: Record<string, unknown> = { payment_intent: paymentIntentId };
      if (amountCents) refundParams.amount = amountCents;

      const refund = await stripe.refunds.create(refundParams as Stripe.RefundCreateParams);

      // If the user is currently blocked, mark that a refund was issued (prevents access restoration on unblock)
      const { data: refundedProfile } = await adminClient
        .from('profiles')
        .select('is_blocked')
        .eq('id', target_user_id)
        .single();
      if (refundedProfile?.is_blocked) {
        await adminClient.from('profiles').update({ blocked_refund_issued: true }).eq('id', target_user_id);
      }

      return json({ success: true, refund_id: refund.id, amount: refund.amount, status: refund.status });
    }

    // ── ACTION: get_charge_info ──────────────────────────────
    if (action === 'get_charge_info') {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });

      const { data: activeSub } = await adminClient
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', target_user_id)
        .not('stripe_subscription_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!activeSub?.stripe_subscription_id) return json({ error: 'No subscription found' }, 404);

      const stripeSub = await stripe.subscriptions.retrieve(activeSub.stripe_subscription_id);
      const invoiceId = stripeSub.latest_invoice as string;
      if (!invoiceId) return json({ error: 'No invoice found' }, 404);

      const invoice = await stripe.invoices.retrieve(invoiceId);
      const piId = invoice.payment_intent as string;
      if (!piId) return json({ error: 'No payment intent' }, 404);

      const pi = await stripe.paymentIntents.retrieve(piId);
      const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;
      if (!chargeId) return json({ amount_cents: invoice.amount_paid, amount_refunded_cents: 0 });

      const charge = await stripe.charges.retrieve(chargeId);
      return json({
        amount_cents: charge.amount,
        amount_refunded_cents: charge.amount_refunded,
      });
    }

    return json({ error: 'Unknown action' }, 400);

  } catch (err) {
    console.error('admin-update-user error:', err);
    return json({ error: translateStripeError(err.message) || 'Erro interno' }, 500);
  }
});

function translateStripeError(msg: string): string {
  if (!msg) return '';
  if (/already been refunded/i.test(msg)) return 'Este pagamento já foi reembolsado integralmente.';
  if (/greater than unrefunded amount/i.test(msg)) {
    const m = msg.match(/\(R\$\s*([\d.,]+)\)/g);
    if (m && m.length >= 2) return `Valor de reembolso (${m[0]}) maior que o disponível ${m[1]}.`;
    return 'Valor de reembolso maior que o disponível na cobrança.';
  }
  if (/charge.*not found/i.test(msg)) return 'Cobrança não encontrada no Stripe.';
  if (/no such payment_intent/i.test(msg)) return 'Intenção de pagamento não encontrada.';
  if (/no such invoice/i.test(msg)) return 'Fatura não encontrada.';
  if (/no such subscription/i.test(msg)) return 'Assinatura não encontrada no Stripe.';
  if (/card.*declined/i.test(msg)) return 'Cartão recusado.';
  if (/insufficient_funds/i.test(msg)) return 'Saldo insuficiente no cartão.';
  if (/authentication_required/i.test(msg)) return 'Autenticação adicional exigida pelo banco.';
  return msg;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
