-- Enable realtime for admin_notifications so INSERT events are broadcast
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'admin_notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE admin_notifications;
    END IF;
END $$;
