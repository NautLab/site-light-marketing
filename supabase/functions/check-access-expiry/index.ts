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

    // Expired — full revoke
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

    return json({ expired: true, revoked: true });
  } catch (err) {
    console.error('check-access-expiry error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
