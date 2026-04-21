-- 1. Delete all cancelled subscriptions
DELETE FROM public.subscriptions WHERE status = 'canceled';

-- 2. Insert manual subscription for teus2002@hotmail.com on Teste 2a plan (09/04/2026)
DO $$
DECLARE
    v_user_id  UUID;
    v_plan_id  UUID;
    v_tier     TEXT;
BEGIN
    -- Get user ID
    SELECT id INTO v_user_id
    FROM public.profiles
    WHERE email = 'teus2002@hotmail.com'
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE NOTICE 'User teus2002@hotmail.com not found — skipping subscription insert.';
        RETURN;
    END IF;

    -- Get plan ID and tier
    SELECT id, tier INTO v_plan_id, v_tier
    FROM public.plans
    WHERE name = 'Teste 2a'
    LIMIT 1;

    IF v_plan_id IS NULL THEN
        RAISE NOTICE 'Plan "Teste 2a" not found — skipping subscription insert.';
        RETURN;
    END IF;

    -- Remove any existing active subscription for this user (avoid duplicates)
    DELETE FROM public.subscriptions
    WHERE user_id = v_user_id AND status IN ('active', 'trialing');

    -- Insert the manual subscription
    INSERT INTO public.subscriptions (
        user_id,
        plan_id,
        plan_name_snapshot,
        status,
        billing_interval,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        created_at,
        updated_at
    ) VALUES (
        v_user_id,
        v_plan_id,
        'Teste 2a',
        'active',
        'month',
        '2026-04-09 00:00:00+00',
        '2026-05-09 00:00:00+00',
        false,
        '2026-04-09 00:00:00+00',
        now()
    );

    RAISE NOTICE 'Subscription inserted for teus2002@hotmail.com on plan "Teste 2a" (tier: %).', v_tier;
END;
$$;
