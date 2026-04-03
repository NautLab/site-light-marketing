-- Migration: Add is_archived column to plans table
-- Date: 2026-04-02

ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
