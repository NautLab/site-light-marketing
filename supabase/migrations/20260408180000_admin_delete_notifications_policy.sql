-- Allow admins to delete admin_notifications (Item 8)
CREATE POLICY "admin_delete_notifications"
    ON admin_notifications
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('admin', 'super_admin')
        )
    );
