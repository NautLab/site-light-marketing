-- Delete the manually inserted subscription for teus2002@hotmail.com
DELETE FROM public.subscriptions
WHERE user_id = (
    SELECT id FROM public.profiles WHERE email = 'teus2002@hotmail.com' LIMIT 1
)
AND plan_name_snapshot = 'Teste 2a'
AND stripe_subscription_id IS NULL
AND created_at = '2026-04-09 00:00:00+00';
