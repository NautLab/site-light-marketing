// Edge Function: admin-update-plan
// Edit or delete a plan (admin/super_admin only)
// Actions: 'edit' | 'delete'

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

    const body = await req.json();
    const { action, plan_id } = body;

    if (!plan_id) return json({ error: 'Missing plan_id' }, 400);

    // Fetch the plan
    const { data: plan, error: planErr } = await adminClient
      .from('plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planErr || !plan) return json({ error: 'Plan not found' }, 404);

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
    });

    // ── EDIT ────────────────────────────────────────────────────
    if (action === 'edit') {
      const {
        name,
        description,
        tier,
        observation,
        monthly_limit,
        unlocked_screens,
        price_brl,
      } = body;

      // Update Stripe product name/description if changed
      if (plan.stripe_product_id && (name || description !== undefined)) {
        await stripe.products.update(plan.stripe_product_id, {
          name: name || plan.name,
          description: description ?? plan.description ?? undefined,
        }).catch(() => { /* Stripe update is best-effort */ });
      }

      // Build DB update
      const updates: Record<string, unknown> = {};
      if (name !== undefined)              updates.name              = name;
      if (description !== undefined)       updates.description       = description;
      if (tier !== undefined)              updates.tier              = tier;
      if (observation !== undefined)       updates.observation       = observation || null;
      if (monthly_limit !== undefined)     updates.monthly_limit     = monthly_limit || null;
      if (unlocked_screens !== undefined)  updates.unlocked_screens  = unlocked_screens || [];
      if (price_brl !== undefined)         updates.price_brl         = price_brl;

      const { data: updated, error: updateErr } = await adminClient
        .from('plans')
        .update(updates)
        .eq('id', plan_id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      return json({ success: true, plan: updated });
    }

    // ── DELETE ──────────────────────────────────────────────────
    if (action === 'delete') {
      // Check for active subscriptions on this plan
      const { count } = await adminClient
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('plan_id', plan_id)
        .eq('status', 'active');

      if ((count ?? 0) > 0) {
        return json({ error: `Não é possível excluir: este plano tem ${count} assinatura(s) ativa(s). Arquive-o em vez disso.` }, 409);
      }

      // Archive Stripe product (deactivate)
      if (plan.stripe_product_id) {
        await stripe.products.update(plan.stripe_product_id, { active: false })
          .catch(() => { /* best-effort */ });
      }
      if (plan.stripe_price_id) {
        await stripe.prices.update(plan.stripe_price_id, { active: false })
          .catch(() => { /* best-effort */ });
      }

      // Hard delete from DB
      const { error: deleteErr } = await adminClient
        .from('plans')
        .delete()
        .eq('id', plan_id);

      if (deleteErr) throw deleteErr;
      return json({ success: true, deleted: true });
    }

    return json({ error: 'Unknown action' }, 400);

  } catch (err) {
    console.error('admin-update-plan error:', err);
    return json({ error: err.message || 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
