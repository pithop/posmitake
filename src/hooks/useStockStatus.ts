"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// This hook provides a shared stock status across all components.
// It reads from Supabase `pos_stock_status` table and syncs in real-time.

let globalOutOfStock: Set<string> = new Set();
let globalListeners: Array<() => void> = [];

function notifyGlobal() {
    globalListeners.forEach(fn => fn());
}

export function useStockStatus() {
    const [outOfStock, setOutOfStock] = useState<Set<string>>(globalOutOfStock);

    useEffect(() => {
        const update = () => setOutOfStock(new Set(globalOutOfStock));
        globalListeners.push(update);
        return () => { globalListeners = globalListeners.filter(fn => fn !== update); };
    }, []);

    // Fetch all stock statuses on mount
    useEffect(() => {
        if (!supabase) return;

        const fetchStock = async () => {
            if (!supabase) return;
            const { data } = await supabase
                .from('pos_stock_status')
                .select('product_id, available');

            if (data) {
                globalOutOfStock = new Set(
                    data.filter((d: any) => !d.available).map((d: any) => d.product_id)
                );
                notifyGlobal();
            }
        };

        fetchStock();

        // Subscribe to changes
        const channel = supabase.channel('stock_status_sync')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'pos_stock_status' },
                () => { fetchStock(); }
            )
            .subscribe();

        // Also poll every 5s for reliability
        const poll = setInterval(fetchStock, 5000);

        return () => {
            supabase!.removeChannel(channel);
            clearInterval(poll);
        };
    }, []);

    const toggleStock = useCallback(async (productId: string, productName: string, available: boolean, deviceId: string) => {
        if (!supabase) return;

        // Optimistic update
        if (available) {
            globalOutOfStock.delete(productId);
        } else {
            globalOutOfStock.add(productId);
        }
        notifyGlobal();

        // Write to Supabase
        await supabase.from('pos_stock_status').upsert({
            product_id: productId,
            product_name: productName,
            available,
            updated_at: new Date().toISOString(),
            updated_by: deviceId,
        });
    }, []);

    return { outOfStock, toggleStock };
}
