-- Enable pg_cron extension (already available in Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function: process_expired_free_access
-- Runs daily to restore paid plan access (or revoke to free) for users
-- whose free_access_expires_at has passed, without requiring any page visit.
CREATE OR REPLACE FUNCTION public.process_expired_free_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_restored_date TEXT;
  v_restored_end  TIMESTAMPTZ;
BEGIN
  FOR r IN
    SELECT id,
           free_access_prev_period_end,
           free_access_prev_plan_id,
           free_access_plan_id
    FROM public.profiles
    WHERE free_access = true
      AND free_access_expires_at IS NOT NULL
      AND free_access_expires_at <= now()
  LOOP
    -- Determine the restored end date (original paid period end, normalized to midnight BRT)
    IF r.free_access_prev_period_end IS NOT NULL
       AND r.free_access_prev_period_end > now()
    THEN
      -- Normalize to end-of-day in BRT (America/Sao_Paulo)
      v_restored_date := to_char(
        (r.free_access_prev_period_end AT TIME ZONE 'America/Sao_Paulo')::date,
        'YYYY-MM-DD'
      );
      v_restored_end := (v_restored_date || 'T23:59:59.000-03:00')::TIMESTAMPTZ;

      UPDATE public.profiles
      SET
        free_access              = true,
        free_access_plan_id      = COALESCE(r.free_access_prev_plan_id, r.free_access_plan_id),
        free_access_granted_by   = NULL,
        free_access_granted_at   = NULL,
        free_access_expires_at   = v_restored_end,
        free_access_prev_period_end = NULL,
        free_access_prev_plan_id    = NULL,
        subscription_tier        = 'paid',
        updated_at               = now()
      WHERE id = r.id;

    ELSE
      -- No remaining days — full revoke to free plan
      UPDATE public.profiles
      SET
        free_access              = false,
        free_access_plan_id      = NULL,
        free_access_granted_by   = NULL,
        free_access_granted_at   = NULL,
        free_access_expires_at   = NULL,
        free_access_prev_period_end = NULL,
        free_access_prev_plan_id    = NULL,
        subscription_tier        = 'free',
        updated_at               = now()
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;

-- Schedule: run every day at 03:00 UTC (= 00:00 BRT)
SELECT cron.schedule(
  'process-free-access-expiry',   -- job name
  '0 3 * * *',                    -- cron expression: 03:00 UTC daily
  $$ SELECT public.process_expired_free_access(); $$
);
