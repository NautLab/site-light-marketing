// Edge Function: admin-update-coupon
// Actions: create, toggle (activate/deactivate)
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

    if (!callerProfile || !['admin', 'super_admin'].includes(callerProfile.role)) {
      return json({ error: 'Forbidden' }, 403);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
    });

    const body = await req.json();
    const { action } = body;

    // ── ACTION: create ────────────────────────────────────
    if (action === 'create') {
      const {
        code, name, discount_type, discount_value,
        duration, duration_in_months,
        max_redemptions, redeem_by,
      } = body;

      if (!code || !name || !discount_type || !discount_value) {
        return json({ error: 'Missing required coupon fields' }, 400);
      }

      // Create Stripe coupon
      const stripeParams: Record<string, unknown> = {
        name,
        duration,
        metadata: { code },
      };

      if (discount_type === 'percent') {
        stripeParams.percent_off = discount_value;
      } else {
        stripeParams.amount_off  = Math.round(discount_value * 100);
        stripeParams.currency    = 'brl';
      }

      if (duration === 'repeating' && duration_in_months) {
        stripeParams.duration_in_months = duration_in_months;
      }

      if (max_redemptions) stripeParams.max_redemptions = max_redemptions;
      if (redeem_by)       stripeParams.redeem_by = Math.floor(new Date(redeem_by).getTime() / 1000);

      const stripeCoupon = await stripe.coupons.create(stripeParams as Stripe.CouponCreateParams);

      // Create Stripe promotion code so customers can use the code text
      const promoCode = await stripe.promotionCodes.create({
        coupon: stripeCoupon.id,
        code,
        max_redemptions: max_redemptions || undefined,
        expires_at: redeem_by ? Math.floor(new Date(redeem_by).getTime() / 1000) : undefined,
      });

      // Save to DB
      const { data: coupon, error } = await adminClient
        .from('coupons')
        .insert({
          name,
          code,
          stripe_coupon_id: stripeCoupon.id,
          stripe_promotion_code_id: promoCode.id,
          discount_type,
          discount_value,
          duration,
          duration_in_months: duration === 'repeating' ? duration_in_months : null,
          max_redemptions: max_redemptions || null,
          redeem_by: redeem_by || null,
          is_active: true,
          created_by: caller.id,
        })
        .select()
        .single();

      if (error) throw error;

      return json({ success: true, coupon });
    }

    // ── ACTION: toggle ────────────────────────────────────
    if (action === 'toggle') {
      const { coupon_id, is_active } = body;

      if (!coupon_id) return json({ error: 'Missing coupon_id' }, 400);

      // Fetch coupon to get Stripe IDs
      const { data: coupon } = await adminClient
        .from('coupons')
        .select('stripe_promotion_code_id')
        .eq('id', coupon_id)
        .single();

      // Update Stripe promotion code active status
      if (coupon?.stripe_promotion_code_id) {
        await stripe.promotionCodes.update(coupon.stripe_promotion_code_id, {
          active: is_active,
        });
      }

      const { error } = await adminClient
        .from('coupons')
        .update({ is_active })
        .eq('id', coupon_id);

      if (error) throw error;

      return json({ success: true, is_active });
    }

    return json({ error: 'Unknown action' }, 400);

  } catch (err) {
    console.error('admin-update-coupon error:', err);
    return json({ error: err.message || 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
