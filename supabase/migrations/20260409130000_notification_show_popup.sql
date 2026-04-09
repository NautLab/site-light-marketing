-- Add show_popup flag to admin_notifications (default true for backward compat)
ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS show_popup boolean NOT NULL DEFAULT true;
