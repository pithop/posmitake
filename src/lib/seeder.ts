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

        // 2. Prepare Products from Kyo Menu (Source of Truth for NEW products only)
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
                tags: tags
            };
        });

        // 3. Seed into PowerSync Local DB
        //    - INSERT OR IGNORE: only adds NEW products (preserves user-edited prices/names)
        //    - Separate UPDATE: only touches tags and modifier_groups (safe metadata, not user-editable)
        const db = getPowerSyncDatabase();
        await db.writeTransaction(async (tx) => {
            for (const p of products) {
                // Insert new products only — does NOT overwrite existing rows
                await tx.execute(
                    `INSERT OR IGNORE INTO pos_products (id, name, price, category, description, image, available, modifier_groups, tags)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        p.id,
                        p.name,
                        p.price,
                        p.category,
                        p.description || '',
                        p.image,
                        p.available ? 1 : 0,
                        JSON.stringify(p.modifier_groups || []),
                        JSON.stringify(p.tags || [])
                    ]
                );

                // Always update tags and modifier_groups (metadata that isn't user-editable)
                await tx.execute(
                    `UPDATE pos_products SET tags = ?, modifier_groups = ? WHERE id = ?`,
                    [
                        JSON.stringify(p.tags || []),
                        JSON.stringify(p.modifier_groups || []),
                        p.id
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
