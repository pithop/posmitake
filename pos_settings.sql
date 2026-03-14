-- =========================================================================
-- SQL Script to create the pos_settings table for dynamic receipt info
-- Execute this script in your Supabase SQL Editor.
-- =========================================================================

-- Create the table
CREATE TABLE IF NOT EXISTS public.pos_settings (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Forces a single row (singleton)
    store_name text NOT NULL DEFAULT 'MITAKE RAMEN',
    subtitle text NOT NULL DEFAULT 'Japanese Kitchen',
    address text NOT NULL DEFAULT '569 Av. Henri Mauriat, 13100 Aix-en-Provence',
    phone text NOT NULL DEFAULT '09 72 21 38 99',
    siret text NOT NULL DEFAULT '',
    footer_message_1 text NOT NULL DEFAULT 'Merci de votre visite !',
    footer_message_2 text NOT NULL DEFAULT 'À très bientôt.',
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Enable RLS (Optional depending on your setup, but good practice. 
-- In the POS we assume we have basic access for authenticated anon/service roles)
ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;

-- Create basic policies (Allow all for the POS client)
CREATE POLICY "Allow anonymous read access" ON public.pos_settings FOR SELECT USING (true);
CREATE POLICY "Allow anonymous update" ON public.pos_settings FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous insert" ON public.pos_settings FOR INSERT WITH CHECK (true);

-- Insert the default row
INSERT INTO public.pos_settings (id, store_name, subtitle, address, phone, siret, footer_message_1, footer_message_2) 
VALUES (
    1, 
    'MITAKE RAMEN', 
    'Japanese Kitchen', 
    '569 Av. Henri Mauriat, 13100 Aix-en-Provence', 
    '09 72 21 38 99', 
    '', 
    'Merci de votre visite !', 
    'À très bientôt.'
) 
ON CONFLICT (id) DO NOTHING;
