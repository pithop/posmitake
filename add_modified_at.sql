-- =========================================================================
-- Add modified_at column to pos_orders for reliable modification alerts
-- Execute this in your Supabase SQL Editor.
-- =========================================================================

ALTER TABLE public.pos_orders
ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
