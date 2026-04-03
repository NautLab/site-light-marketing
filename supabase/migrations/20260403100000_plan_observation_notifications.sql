-- Migration: plan observation column + admin notifications system
-- Date: 2026-04-03

-- ─────────────────────────────────────────────────────────────
-- 1. Add observation column to plans
-- ─────────────────────────────────────────────────────────────
ALTER TABLE plans ADD COLUMN IF NOT EXISTS observation TEXT;

-- ─────────────────────────────────────────────────────────────
-- 2. Admin notifications table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_notifications (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title          TEXT        NOT NULL,
    message        TEXT        NOT NULL,
    -- target_type: 'all' | 'role' | 'tier' | 'specific'
    target_type    TEXT        NOT NULL DEFAULT 'all'
                               CHECK (target_type IN ('all', 'role', 'tier', 'specific')),
    target_roles   TEXT[]      NOT NULL DEFAULT '{}',
    target_tiers   TEXT[]      NOT NULL DEFAULT '{}',
    target_user_ids UUID[]     NOT NULL DEFAULT '{}',
    is_active      BOOLEAN     NOT NULL DEFAULT true,
    created_by     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 3. Notification reads table (tracks who dismissed which notification)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_reads (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    notification_id UUID        NOT NULL REFERENCES admin_notifications(id) ON DELETE CASCADE,
    read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, notification_id)
);

-- ─────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads  ENABLE ROW LEVEL SECURITY;

-- Admins see all notifications (active & inactive)
-- Regular users see only active notifications (client filters targeting)
CREATE POLICY "select_admin_notifications" ON admin_notifications
    FOR SELECT TO authenticated
    USING (
        is_active = true
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Only admins can insert notifications
CREATE POLICY "insert_admin_notifications" ON admin_notifications
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Only admins can update notifications (e.g. deactivate)
CREATE POLICY "update_admin_notifications" ON admin_notifications
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Users see their own reads; admins see all reads
CREATE POLICY "select_notification_reads" ON notification_reads
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Each user can only insert reads for themselves
CREATE POLICY "insert_notification_reads" ON notification_reads
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
