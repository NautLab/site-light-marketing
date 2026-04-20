-- Enable realtime for subscriptions table so plan changes propagate instantly
ALTER TABLE subscriptions REPLICA IDENTITY FULL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'subscriptions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE subscriptions;
    END IF;
END $$;
