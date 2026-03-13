import { supabase } from './supabase';
import { getPowerSyncDatabase } from './powersync/PowerSyncDb';
import kyoMenuData from '@/data/menu_data.json';

export async function seedDatabase() {
    if (!supabase) throw new Error('Supabase client not initialized');

    const results = {
        success: false,
        count: 0,
        mitakeCount: 0,
        error: null as any
    };

    try {
        console.log('Starting Unified Seed...');

        // 1. Load Mitake IDs for tagging
        const mitakeResponse = await fetch('/mitake.json');
        if (!mitakeResponse.ok) throw new Error('Failed to load mitake.json');
        const mitakeData = await mitakeResponse.json();
        const mitakeIds = new Set(mitakeData.map((p: any) => p.id));

        // 2. Prepare Products from Kyo Menu (Source of Truth)
        const products = kyoMenuData.map((p: any) => {
            const tags: string[] = [];
            if (mitakeIds.has(p.id)) {
                tags.push('mitake');
            }

            return {
                id: p.id,
                name: p.name,
                price: typeof p.price === 'string' ? parseFloat(p.price) : p.price,
                category: p.category || 'General',
                image: p.image,
                description: p.description || '',
                available: true,
                modifier_groups: p.modifier_groups || null,
                tags: tags // New field
            };
        });

        // 3. Upsert to PowerSync Local DB
        const db = getPowerSyncDatabase();
        await db.writeTransaction(async (tx) => {
            for (const p of products) {
                await tx.execute(
                    `INSERT OR REPLACE INTO pos_products (id, name, price, category, description, image, available, modifier_groups, tags)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        p.id,
                        p.name,
                        p.price,
                        p.category, // Default 'General' handled in map above
                        p.description || '',
                        p.image,
                        p.available ? 1 : 0,
                        JSON.stringify(p.modifier_groups || []),
                        JSON.stringify(p.tags || [])
                    ]
                );
            }
        });

        results.success = true;
        results.count = products.length;
        results.mitakeCount = mitakeIds.size;

    } catch (error) {
        console.error('Seed Error:', error);
        results.error = error;
    }

    return results;
}
