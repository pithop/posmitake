-- =========================================================================
-- Add rappel_at column to pos_orders for reliable kitchen reminders
-- Execute this in your Supabase SQL Editor.
-- =========================================================================

ALTER TABLE public.pos_orders
ADD COLUMN IF NOT EXISTS rappel_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Enable Realtime for UPDATE events on pos_orders (may already be enabled)
ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_orders;
