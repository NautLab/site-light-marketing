// Edge Function: check-access-expiry
// Checks if the caller's free_access has expired and revokes it if so.
// Called from client on page load (index.html, planos.html).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    // Client with caller's JWT to get user identity
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    // Admin client to bypass RLS
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: profile } = await adminClient
      .from('profiles')
      .select('free_access, free_access_expires_at, free_access_prev_period_end, free_access_prev_plan_id, free_access_plan_id')
      .eq('id', user.id)
      .single();

    if (!profile || !profile.free_access || !profile.free_access_expires_at) {
      return json({ expired: false });
    }

    const expiresAt = new Date(profile.free_access_expires_at);
    if (expiresAt > new Date()) {
      return json({ expired: false });
    }

    // Expired — check if there are remaining days from the original paid plan.
    // When free access was granted, the paid subscription was cancelled and its
    // period_end was stored in free_access_prev_period_end. On expiry, those
    // remaining days should be given back starting from now (same logic as manual revoke).
    const prevPeriodEnd = profile.free_access_prev_period_end ?? null;
    const prevPlanId    = profile.free_access_prev_plan_id ?? profile.free_access_plan_id ?? null;
    const hasRemaining  = prevPeriodEnd && new Date(prevPeriodEnd) > new Date();

    if (hasRemaining && prevPlanId) {
      // Calculate how many days were remaining in the original plan when free access
      // was granted (approximated by free_access_expires_at as the cancellation date),
      // then shift those days from now so the user doesn't lose any paid time.
      // e.g., sub ends May 20, free access granted Apr 20 → 30 days remaining.
      //       On Apr 21, restored end = Apr 21 + 30 days = May 21.
      let restoredEnd: string = prevPeriodEnd;
      if (profile.free_access_expires_at) {
        const grantTs     = new Date(profile.free_access_expires_at).getTime();
        const prevEndTs   = new Date(prevPeriodEnd).getTime();
        const remainingMs = prevEndTs - grantTs;
        if (remainingMs > 0) {
          restoredEnd = new Date(Date.now() + remainingMs).toISOString();
        }
      }
      // Normalize to end-of-day in BRT (23:59:59-03:00) so no specific time is shown
      const restoredDate = new Date(restoredEnd).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
      restoredEnd = `${restoredDate}T23:59:59.000-03:00`;

      const { error } = await adminClient
        .from('profiles')
        .update({
          free_access: true,
          free_access_plan_id: prevPlanId,
          free_access_granted_by: null,
          free_access_expires_at: restoredEnd,
          free_access_prev_period_end: null,
          free_access_prev_plan_id: null,
          subscription_tier: 'paid',
        })
        .eq('id', user.id);

      if (error) throw error;
      return json({ expired: true, revoked: false, has_remaining_days: true, expires_at: restoredEnd, plan_id: prevPlanId });
    }

    // No remaining days — full revoke to free plan
    const { error } = await adminClient
      .from('profiles')
      .update({
        free_access: false,
        free_access_plan_id: null,
        free_access_granted_by: null,
        free_access_expires_at: null,
        free_access_prev_period_end: null,
        free_access_prev_plan_id: null,
        subscription_tier: 'free',
      })
      .eq('id', user.id);

    if (error) throw error;
    return json({ expired: true, revoked: true, has_remaining_days: false });
  } catch (err) {
    console.error('check-access-expiry error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
