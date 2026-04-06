// Edge Function: admin-update-user
// Handles: update_role, grant_free_access, revoke_free_access
// Requires: caller must be admin or super_admin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

      // Verify the plan exists and is active
      const { data: plan } = await adminClient
        .from('plans')
        .select('id, name')
        .eq('id', planId)
        .single();

      if (!plan) {
        return json({ error: 'Plan not found' }, 404);
      }

      const { error } = await adminClient
        .from('profiles')
        .update({
          free_access: true,
          free_access_plan_id: planId,
          free_access_granted_by: caller.id,
          subscription_tier: 'paid',
        })
        .eq('id', target_user_id);

      if (error) throw error;
      return json({ success: true, free_access: true, plan_id: planId, plan_name: plan.name });
    }

    // ── ACTION: revoke_free_access ───────────────────────
    if (action === 'revoke_free_access') {
      const { error } = await adminClient
        .from('profiles')
        .update({
          free_access: false,
          free_access_plan_id: null,
          free_access_granted_by: null,
          subscription_tier: 'free',
        })
        .eq('id', target_user_id);

      if (error) throw error;
      return json({ success: true, free_access: false });
    }

    return json({ error: 'Unknown action' }, 400);

  } catch (err) {
    console.error('admin-update-user error:', err);
    return json({ error: err.message || 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
