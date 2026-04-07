// Edge Function: admin-update-coupon
// Actions: create, edit, toggle, archive, delete
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
        max_redemptions, max_redemptions_per_user, redeem_by,
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
          max_redemptions_per_user: max_redemptions_per_user || null,
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

    // ── ACTION: edit ─────────────────────────────────────
    if (action === 'edit') {
      const {
        coupon_id, code, name, discount_type, discount_value,
        duration, duration_in_months,
        max_redemptions, max_redemptions_per_user, redeem_by,
      } = body;

      if (!coupon_id) return json({ error: 'Missing coupon_id' }, 400);
      if (!name) return json({ error: 'Missing name' }, 400);
      if (!code) return json({ error: 'Missing code' }, 400);

      // Fetch current coupon from DB
      const { data: current } = await adminClient
        .from('coupons')
        .select('*')
        .eq('id', coupon_id)
        .single();

      if (!current) return json({ error: 'Coupon not found' }, 404);

      // Validate max_redemptions >= times_redeemed
      if (max_redemptions != null && max_redemptions < (current.times_redeemed || 0)) {
        return json({ error: `Limite de usos não pode ser menor que ${current.times_redeemed} (usos já realizados)` }, 400);
      }

      // Detect if Stripe-immutable fields changed
      const stripeChanged =
        discount_type !== current.discount_type ||
        parseFloat(discount_value) !== parseFloat(current.discount_value) ||
        duration !== current.duration ||
        (duration === 'repeating' ? (duration_in_months || null) : null) !== (current.duration === 'repeating' ? current.duration_in_months : null);

      const codeChanged = code.toUpperCase() !== (current.code || '').toUpperCase();

      let newStripeCouponId  = current.stripe_coupon_id;
      let newStripePromoId   = current.stripe_promotion_code_id;

      if (stripeChanged || codeChanged) {
        // Need to recreate Stripe objects
        // 1. Deactivate old promo code (keeps existing subscriptions intact)
        if (current.stripe_promotion_code_id) {
          try {
            await stripe.promotionCodes.update(current.stripe_promotion_code_id, { active: false });
          } catch (_) { /* promo may already be inactive */ }
        }

        // 2. Create new Stripe coupon
        const newParams: Record<string, unknown> = {
          name,
          duration,
          metadata: { code: code.toUpperCase() },
        };

        if (discount_type === 'percent') {
          newParams.percent_off = parseFloat(discount_value);
        } else {
          newParams.amount_off = Math.round(parseFloat(discount_value) * 100);
          newParams.currency   = 'brl';
        }

        if (duration === 'repeating' && duration_in_months) {
          newParams.duration_in_months = duration_in_months;
        }

        if (max_redemptions) newParams.max_redemptions = max_redemptions;
        if (redeem_by)       newParams.redeem_by = Math.floor(new Date(redeem_by).getTime() / 1000);

        const newCoupon = await stripe.coupons.create(newParams as Stripe.CouponCreateParams);
        newStripeCouponId = newCoupon.id;

        // 3. Create new Stripe promotion code
        try {
          const newPromo = await stripe.promotionCodes.create({
            coupon: newCoupon.id,
            code: code.toUpperCase(),
            max_redemptions: max_redemptions || undefined,
            expires_at: redeem_by ? Math.floor(new Date(redeem_by).getTime() / 1000) : undefined,
          });
          newStripePromoId = newPromo.id;
        } catch (promoErr: unknown) {
          // Rollback: delete new coupon, reactivate old promo
          try { await stripe.coupons.del(newCoupon.id); } catch (_) {}
          if (current.stripe_promotion_code_id) {
            try { await stripe.promotionCodes.update(current.stripe_promotion_code_id, { active: true }); } catch (_) {}
          }
          const msg = promoErr instanceof Error ? promoErr.message : String(promoErr);
          return json({ error: `Erro ao criar código promocional no Stripe: ${msg}. Se alterou valores do desconto, tente usar um código diferente.` }, 400);
        }
      } else {
        // Only name/metadata changed on Stripe side — update coupon name
        try {
          await stripe.coupons.update(current.stripe_coupon_id, { name });
        } catch (_) { /* ignore if coupon was deleted externally */ }
      }

      // Update DB with all fields
      const { data: updated, error } = await adminClient
        .from('coupons')
        .update({
          code: code.toUpperCase(),
          name,
          discount_type,
          discount_value: parseFloat(discount_value),
          duration,
          duration_in_months: duration === 'repeating' ? (duration_in_months || null) : null,
          max_redemptions: max_redemptions || null,
          max_redemptions_per_user: max_redemptions_per_user || null,
          redeem_by: redeem_by || null,
          stripe_coupon_id: newStripeCouponId,
          stripe_promotion_code_id: newStripePromoId,
        })
        .eq('id', coupon_id)
        .select()
        .single();

      if (error) throw error;

      return json({ success: true, coupon: updated });
    }

    // ── ACTION: archive ───────────────────────────────────
    if (action === 'archive') {
      const { coupon_id, is_archived } = body;

      if (!coupon_id) return json({ error: 'Missing coupon_id' }, 400);

      const updates: Record<string, unknown> = { is_archived };
      if (is_archived) updates.is_active = false;

      // If archiving, deactivate the promo code in Stripe too
      const { data: coupon } = await adminClient
        .from('coupons')
        .select('stripe_promotion_code_id')
        .eq('id', coupon_id)
        .single();

      if (coupon?.stripe_promotion_code_id && is_archived) {
        await stripe.promotionCodes.update(coupon.stripe_promotion_code_id, { active: false });
      }

      const { error } = await adminClient
        .from('coupons')
        .update(updates)
        .eq('id', coupon_id);

      if (error) throw error;

      return json({ success: true });
    }

    // ── ACTION: delete ────────────────────────────────────
    if (action === 'delete') {
      const { coupon_id } = body;

      if (!coupon_id) return json({ error: 'Missing coupon_id' }, 400);

      const { data: coupon } = await adminClient
        .from('coupons')
        .select('stripe_coupon_id')
        .eq('id', coupon_id)
        .single();

      if (!coupon) return json({ error: 'Coupon not found' }, 404);

      // Delete Stripe coupon (also deletes associated promo codes)
      try {
        await stripe.coupons.del(coupon.stripe_coupon_id);
      } catch (stripeErr) {
        console.warn('Stripe coupon delete failed (may already be deleted):', stripeErr.message);
      }

      const { error } = await adminClient
        .from('coupons')
        .delete()
        .eq('id', coupon_id);

      if (error) throw error;

      return json({ success: true });
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
