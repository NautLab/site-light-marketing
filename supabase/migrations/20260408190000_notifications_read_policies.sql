-- RLS policies: authenticated users can read active notifications and manage their own reads

DROP POLICY IF EXISTS "users_read_active_notifications" ON admin_notifications;
CREATE POLICY "users_read_active_notifications"
    ON admin_notifications FOR SELECT
    TO authenticated
    USING (is_active = true);

DROP POLICY IF EXISTS "users_select_own_reads" ON notification_reads;
CREATE POLICY "users_select_own_reads"
    ON notification_reads FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_insert_own_reads" ON notification_reads;
CREATE POLICY "users_insert_own_reads"
    ON notification_reads FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());
