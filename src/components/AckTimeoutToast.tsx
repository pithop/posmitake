"use client";

import { useEffect, useRef } from 'react';
import { useSystemStore } from '@/store/useStore';
import { RefreshCw, X, AlertTriangle } from 'lucide-react';

const AUTO_DISMISS_MS = 30000; // 30 seconds

export function AckTimeoutToast() {
    const ackTimeouts = useSystemStore(state => state.ackTimeouts);
    const dismissAckTimeout = useSystemStore(state => state.dismissAckTimeout);
    const retryAlert = useSystemStore(state => state.retryAlert);
    const autoDismissTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // Auto-dismiss after 30s
    useEffect(() => {
        for (const entry of ackTimeouts) {
            if (!autoDismissTimers.current.has(entry.orderId)) {
                const timer = setTimeout(() => {
                    dismissAckTimeout(entry.orderId);
                    autoDismissTimers.current.delete(entry.orderId);
                }, AUTO_DISMISS_MS);
                autoDismissTimers.current.set(entry.orderId, timer);
            }
        }
        // Clean up timers for entries that are no longer in the list
        autoDismissTimers.current.forEach((timer, orderId) => {
            if (!ackTimeouts.find(t => t.orderId === orderId)) {
                clearTimeout(timer);
                autoDismissTimers.current.delete(orderId);
            }
        });
    }, [ackTimeouts, dismissAckTimeout]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            autoDismissTimers.current.forEach(timer => clearTimeout(timer));
        };
    }, []);

    if (ackTimeouts.length === 0) return null;

    return (
        <div className="fixed bottom-6 left-6 z-[99990] flex flex-col gap-3 max-w-[420px]">
            {ackTimeouts.map((entry) => (
                <div
                    key={entry.orderId}
                    className="flex items-center gap-3 bg-zinc-900 border border-amber-500/40 rounded-2xl px-4 py-3 shadow-[0_0_30px_rgba(245,158,11,0.15)] animate-in slide-in-from-left-5 duration-300"
                >
                    <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                        <AlertTriangle size={20} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm truncate">
                            {entry.orderId}
                        </p>
                        <p className="text-amber-400/80 text-xs font-medium">
                            Alerte non reçue par la cuisine
                        </p>
                    </div>
                    <button
                        onClick={() => retryAlert(entry.orderId)}
                        className="shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs px-3 py-2 rounded-xl transition-all active:scale-95"
                    >
                        <RefreshCw size={14} />
                        Renvoyer
                    </button>
                    <button
                        onClick={() => dismissAckTimeout(entry.orderId)}
                        className="shrink-0 p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X size={16} className="text-zinc-500 hover:text-white" />
                    </button>
                </div>
            ))}
        </div>
    );
}
