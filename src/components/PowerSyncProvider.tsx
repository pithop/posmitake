"use client";

import { PowerSyncContext } from "@powersync/react";
import { ReactNode, useEffect, useState } from "react";
// Import GETTER, not the instance
import { getPowerSyncDatabase, connector } from "@/lib/powersync/PowerSyncDb";
import { PowerSyncDatabase } from "@powersync/web";
import { supabase } from "@/lib/supabase";

export const PowerSyncProvider = ({ children }: { children: ReactNode }) => {
    const [db, setDb] = useState<PowerSyncDatabase | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        // Initialize DB only on client side
        let isActive = true;

        // EMERGENCY BYPASS: If init takes too long (e.g. frozen thread), force dummy DB
        const forceTimer = setTimeout(() => {
            if (isActive && !db) {
                console.warn("Emergency Bypass Triggered: forcing UI load");
                // Dummy DB to allow UI to render
                const dummyDb = {
                    execute: async () => ({ rows: { _array: [], length: 0, item: () => null } }),
                    getAll: async () => [],
                    get: async () => null,
                    onChange: () => () => { },
                    disconnect: async () => { },
                    connect: async () => { }, // mock connect
                    customQuery: () => ({ subscribe: (callback: any) => { callback({ rows: [] }); return () => { }; } }),
                    watch: () => ({ subscribe: (callback: any) => { callback({ rows: [] }); return () => { }; } })
                } as any;
                setDb(dummyDb);
                setError("Verification Mode: Database Disabled");
            }
        }, 10000);

        const init = async () => {
            try {
                console.log('[PowerSync] Starting initialization...');
                const _db = getPowerSyncDatabase();
                console.log('[PowerSync] DB Instance created:', _db);

                // Race connection with 5s timeout to prevent infinite hang
                console.log('[PowerSync] Connecting...');

                // Allow user to bypass if valid DB instance exists even if connect hangs?
                // No, we need connect for sync. But for offline UI, maybe just open is enough?
                // _db.connect is what starts the sync worker.

                await Promise.race([
                    _db.connect(connector),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout: Database initialization took too long.")), 5000))
                ]);

                if (isActive) {
                    console.log('[PowerSync] Connected!');
                    clearTimeout(forceTimer); // Clear bypass if valid
                    setError(null);
                    setDb(_db);

                    // Bootstrapping Data from Supabase to Local DB
                    // Run this non-blocking so the UI can render immediately
                    // It will populate data as soon as it's done.
                    (async () => {
                        try {
                            console.log('[PowerSync] Bootstrapping data from Supabase...');
                            if (supabase) {
                                const { data: products, error } = await supabase.from('pos_products').select('*');
                                if (error) {
                                    if (Object.keys(error).length > 0 || String(error) !== '[object Object]') {
                                        console.warn('[PowerSync] Supabase Fetch Warning:', error);
                                    }
                                } else if (products && products.length > 0) {
                                    await _db.writeTransaction(async (tx) => {
                                        for (const p of products) {
                                            await tx.execute(
                                                `INSERT OR REPLACE INTO pos_products (id, name, price, category, description, image, available, modifier_groups, tags)
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
                                        }
                                    });
                                    console.log(`[PowerSync] Bootstrapped ${products.length} products from Supabase.`);
                                }
                            }

                            // Always re-seed from local JSON after bootstrap to:
                            // 1. Guarantee modifier_groups from menu_data.json are applied (Supabase rows may lack them)
                            // 2. Ensure all 4 ramens (incl. Shoyu) exist with correct data
                            const { seedDatabase } = await import('@/lib/seeder');
                            const seedResult = await seedDatabase();
                            console.log('[PowerSync] Local seed applied (modifier_groups guaranteed):', seedResult);
                        } catch (bootstrapErr) {
                            console.error('[PowerSync] Bootstrap warning (non-fatal):', bootstrapErr);
                        }
                    })();
                }
            } catch (e: any) {
                console.error("Failed to initialize PowerSync:", e);
                if (isActive) {
                    setError(e.message || String(e));
                }
            }
        };
        init();
        return () => { isActive = false; clearTimeout(forceTimer); };
    }, []);

    // If we have an error, we show it but we can add a "Continue Anyway" button
    if (error) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-zinc-950 text-white p-4 space-y-4">
                <div className="text-center max-w-lg">
                    <h2 className="text-xl font-bold text-red-500 mb-2">System Warning</h2>
                    <p className="text-zinc-400 text-sm mb-4">The offline database could not be initialized in this environment.</p>
                    <pre className="text-xs bg-black/50 p-4 rounded text-red-200 overflow-auto max-w-full text-left mb-6 font-mono border border-white/10">
                        {error}
                    </pre>

                    <div className="flex flex-col space-y-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-white text-black rounded-xl hover:bg-zinc-200 transition-colors font-medium text-sm"
                        >
                            Retry Connection
                        </button>

                        <button
                            onClick={() => {
                                // Create a dummy DB context to allow UI to render without crashing
                                // This is a "Dummy" implementation for UI testing
                                const dummyDb = {
                                    execute: async () => ({ rows: { _array: [], length: 0, item: () => null } }),
                                    getAll: async () => [],
                                    get: async () => null,
                                    onChange: () => () => { },
                                    disconnect: async () => { },
                                    connect: async () => { },
                                    customQuery: () => ({ subscribe: (callback: any) => { callback({ rows: [] }); return () => { }; } }),
                                    watch: () => ({ subscribe: (callback: any) => { callback({ rows: [] }); return () => { }; } })
                                } as any;
                                setDb(dummyDb);
                                setError(null);
                            }}
                            className="text-xs text-zinc-500 hover:text-white transition-colors underline decoration-zinc-800 underline-offset-4"
                        >
                            Continue in UI-Only Mode (No Data)
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!isMounted || !db) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-zinc-950 text-white space-y-4" suppressHydrationWarning>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                <p className="text-zinc-400 text-sm tracking-wider animate-pulse">INITIALIZING SYSTEM...</p>
                <div className="flex flex-col items-center space-y-1">
                    <p className="text-zinc-600 text-xs">Preparing local database...</p>
                    <p className="text-zinc-800 text-[10px] font-mono">Status: WAITING</p>
                </div>
            </div>
        );
    }

    return (
        <PowerSyncContext.Provider value={db}>
            {children}
        </PowerSyncContext.Provider>
    );
};
