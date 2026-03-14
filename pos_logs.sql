-- =========================================================================
-- SQL Script for Observability Logging System
-- Execute this script in your Supabase SQL Editor.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.pos_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id text,
    trace_id text,
    client_timestamp bigint NOT NULL,
    server_timestamp timestamp with time zone DEFAULT timezone('utc'::text, now()),
    level text NOT NULL, -- INFO, WARN, ERROR, FATAL, AUDIT
    category text NOT NULL, -- NETWORK, ORDER, REALTIME, PRINT, DB, SYSTEM
    event_name text NOT NULL,
    device_id text NOT NULL,
    user_id text,
    payload jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.pos_logs ENABLE ROW LEVEL SECURITY;

-- POS devices need to be able to insert logs.
CREATE POLICY "Allow anonymous insert for logs" ON public.pos_logs FOR INSERT WITH CHECK (true);

-- Usually logs don't need to be read by all clients, but for PowerSync schema simplicity, we allow select.
-- In a strict production environment, you might restrict SELECT to admins only,
-- but since this is a local POS offline-first system, this is fine for now.
CREATE POLICY "Allow anonymous select for logs" ON public.pos_logs FOR SELECT USING (true);

-- IMPORTANT for PowerSync: You may need to add `pos_logs` to your publication if you are using one.
-- Example if using publication:
-- ALTER PUBLICATION powersync ADD TABLE public.pos_logs;
