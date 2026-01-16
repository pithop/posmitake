import { supabase } from './supabase';
import { Product } from '@/types';

export async function importMitakeData() {
    try {
        const response = await fetch('/mitake.json');
        if (!response.ok) throw new Error('Failed to load mitake.json');

        const products = await response.json();

        console.log(`Found ${products.length} products to import...`);

        const formattedProducts = products.map((p: any) => ({
            id: p.id,
            name: p.name,
            price: parseFloat(p.price),
            category: p.category || 'General',
            image: p.image,
            description: p.description || '',
            available: p.available !== false,
            modifier_groups: p.modifier_groups || null
        }));

        if (!supabase) throw new Error('Supabase client not initialized');

        const { error } = await supabase
            .from('pos_products')
            .upsert(formattedProducts, { onConflict: 'id' });

        if (error) throw error;

        return { success: true, count: products.length };
    } catch (error) {
        console.error('Import failed:', error);
        return { success: false, error };
    }
}
