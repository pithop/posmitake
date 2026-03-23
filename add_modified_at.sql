-- =========================================================================
-- Add modified_at + modification_diff columns to pos_orders
-- Execute this in your Supabase SQL Editor.
-- =========================================================================

ALTER TABLE public.pos_orders
ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

ALTER TABLE public.pos_orders
ADD COLUMN IF NOT EXISTS modification_diff JSONB DEFAULT NULL;
