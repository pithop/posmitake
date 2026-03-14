import { getPowerSyncDatabase } from './powersync/PowerSyncDb';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'AUDIT';
export type LogCategory = 'NETWORK' | 'ORDER' | 'REALTIME' | 'PRINT' | 'DB' | 'SYSTEM';

interface LogEntry {
    id: string;
    session_id: string;
    trace_id: string | null;
    client_timestamp: number;
    level: LogLevel;
    category: LogCategory;
    event_name: string;
    device_id: string;
    user_id: string | null;
    payload: string; // Stored as JSON string
}

class PosLogger {
    private batch: LogEntry[] = [];
    private batchSize = 20;
    private flushIntervalMs = 3000;
    private intervalId: NodeJS.Timeout | null = null;
    private sessionId: string;
    private deviceId: string = 'unknown';

    constructor() {
        this.sessionId = crypto.randomUUID();
        // Start flush interval in browser only
        if (typeof window !== 'undefined') {
            this.intervalId = setInterval(() => this.flush(), this.flushIntervalMs);
            // Attempt to load device ID from local storage if available
            try {
                const storedState = localStorage.getItem('mitake-pos-storage');
                if (storedState) {
                    const parsed = JSON.parse(storedState);
                    if (parsed?.state?.deviceId) {
                        this.deviceId = parsed.state.deviceId;
                    }
                }
            } catch (e) { }
        }
    }

    public setDeviceId(id: string) {
        this.deviceId = id;
    }

    private maskPayload(payload: any): any {
        if (!payload) return payload;

        try {
            // Deep copy to avoid mutating original
            const masked = JSON.parse(JSON.stringify(payload));

            // Very basic masking rules
            const maskString = (str: string) => {
                if (str && typeof str === 'string' && str.length > 4) {
                    return '****' + str.slice(-4);
                }
                return '****';
            };

            const traverseAndMask = (obj: any) => {
                for (let key in obj) {
                    if (typeof obj[key] === 'object' && obj[key] !== null) {
                        traverseAndMask(obj[key]);
                    } else if (typeof obj[key] === 'string') {
                        const lowerKey = key.toLowerCase();
                        if (lowerKey.includes('phone') || lowerKey.includes('email') || lowerKey.includes('card') || lowerKey.includes('password')) {
                            obj[key] = maskString(obj[key]);
                        }
                    }
                }
            };

            traverseAndMask(masked);
            return masked;
        } catch (e) {
            return payload; // If masking fails, return as-is (or could drop for safety)
        }
    }

    public log(level: LogLevel, category: LogCategory, event_name: string, payload: any = {}, trace_id: string | null = null) {
        const maskedPayload = this.maskPayload(payload);

        const entry: LogEntry = {
            id: crypto.randomUUID(),
            session_id: this.sessionId,
            trace_id,
            client_timestamp: Date.now(),
            level,
            category,
            event_name,
            device_id: this.deviceId,
            user_id: null, // Hardcoded for now, can be dynamically set if auth is used
            payload: JSON.stringify(maskedPayload)
        };

        this.batch.push(entry);

        // Immediate flush for FATAL or if batch is full
        if (level === 'FATAL' || this.batch.length >= this.batchSize) {
            this.flush();
        }
    }

    public info(category: LogCategory, event_name: string, payload?: any, trace_id?: string) {
        this.log('INFO', category, event_name, payload, trace_id);
    }

    public warn(category: LogCategory, event_name: string, payload?: any, trace_id?: string) {
        this.log('WARN', category, event_name, payload, trace_id);
    }

    public error(category: LogCategory, event_name: string, payload?: any, trace_id?: string) {
        this.log('ERROR', category, event_name, payload, trace_id);
    }

    public fatal(category: LogCategory, event_name: string, payload?: any, trace_id?: string) {
        this.log('FATAL', category, event_name, payload, trace_id);
    }

    public audit(category: LogCategory, event_name: string, payload?: any, trace_id?: string) {
        this.log('AUDIT', category, event_name, payload, trace_id);
    }

    private async flush() {
        if (this.batch.length === 0) return;
        if (typeof window === 'undefined') return;

        const entriesToFlush = [...this.batch];
        this.batch = []; // Clear current batch

        try {
            const db = getPowerSyncDatabase();
            if (!db.connect) {
                // DB not ready yet, put them back
                this.batch = [...entriesToFlush, ...this.batch];
                return;
            }

            // PowerSync transaction
            await db.writeTransaction(async (tx) => {
                for (const entry of entriesToFlush) {
                    await tx.execute(
                        `INSERT INTO pos_logs (id, session_id, trace_id, client_timestamp, level, category, event_name, device_id, user_id, payload) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            entry.id,
                            entry.session_id,
                            entry.trace_id ?? null,
                            entry.client_timestamp,
                            entry.level,
                            entry.category,
                            entry.event_name,
                            entry.device_id ?? null,
                            entry.user_id ?? null,
                            entry.payload ?? null
                        ]
                    );
                }
            });
            // Successfully flushed!
        } catch (err) {
            console.error('[Logger] Failed to flush to PowerSync:', err);
            // If it fails, we put them back at the beginning of the batch to retry later
            // But to prevent infinite memory growth, we cap it
            if (this.batch.length < 1000) {
                this.batch = [...entriesToFlush, ...this.batch];
            } else {
                console.error('[Logger] Dropping logs, batch size exceeded.');
            }
        }
    }
}

export const logger = new PosLogger();
