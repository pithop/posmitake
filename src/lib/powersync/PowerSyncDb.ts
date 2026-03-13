import { AbstractPowerSyncDatabase, PowerSyncDatabase, WASQLiteOpenFactory, WASQLiteVFS } from '@powersync/web';
import { AppSchema } from './SystemSchema';
import { supabase } from '@/lib/supabase';

// Connector to sync Uplink (Local -> Supabase)
export class SupabaseConnector {
    async fetchCredentials() {
        // We manage auth via Supabase client directly, but PowerSync needs this.
        // Return a dummy token or implementing actual auth if needed later.
        // For partial sync it might just need an empty object or session token.
        if (!supabase) return { endpoint: '', token: '' };
        const { data } = await supabase.auth.getSession();
        return {
            endpoint: '', // Not used for manual uploads
            token: data.session?.access_token || ''
        };
    }

    async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
        if (!supabase) return;

        const transaction = await database.getNextCrudTransaction();
        if (!transaction) return;

        try {
            for (const op of transaction.crud) {
                const table = op.table;
                const data = op.opData;

                if (op.op === 'PUT') {
                    await supabase.from(table).upsert(data || {});
                } else if (op.op === 'PATCH') {
                    await supabase.from(table).update(data || {}).eq('id', data?.id);
                } else if (op.op === 'DELETE') {
                    await supabase.from(table).delete().eq('id', data?.id);
                }
            }
            await transaction.complete();
        } catch (error) {
            console.error('Data upload failed:', error);
        }
    }
}

let dbInstance: PowerSyncDatabase | null = null;

export const getPowerSyncDatabase = (): PowerSyncDatabase => {
    if (typeof window === 'undefined') {
        // Return a dummy or null during SSR to prevent build crashes
        // But throwing is better if we ensure it's client-only
        throw new Error("PowerSync can only be initialized on the client side.");
    }

    if (!dbInstance) {
        dbInstance = new PowerSyncDatabase({
            schema: AppSchema,
            database: new WASQLiteOpenFactory({
                dbFilename: 'mitake_pos_local.db',
                vfs: WASQLiteVFS.OPFSCoopSyncVFS,
                worker: '/@powersync/worker/WASQLiteDB.umd.js'
            }),
            sync: {
                worker: '/@powersync/worker/SharedSyncImplementation.umd.js'
            },
            flags: {
                useWebWorker: true,
                enableMultiTabs: false // simpler to debug without shared workers
            }
        });
    }
    return dbInstance;
};

export const connector = new SupabaseConnector();
// Export a function to get the DB, not the DB itself.
export { dbInstance as db }; // Legacy export (might be null initially)
