"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils";
import { useSystemStore } from '@/store/useStore';
import { CheckCircle, Minimize2, ChevronLeft, ChevronRight } from 'lucide-react';

// Distinct Audio for "Ready" alert (higher pitch, pleasant ding)
let audioCtx: AudioContext | null = null;
let beepInterval: NodeJS.Timeout | null = null;

const playReadySound = () => {
    if (typeof window === 'undefined') return;
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    stopReadySound();
    
    // Play a happy double ding
    const beep = (t: number, freq: number) => {
        const o = audioCtx!.createOscillator(), g = audioCtx!.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0, t); 
        g.gain.linearRampToValueAtTime(0.6, t + 0.05);
        g.gain.linearRampToValueAtTime(0, t + 0.4);
        o.connect(g); g.connect(audioCtx!.destination); o.start(t); o.stop(t + 0.4);
        o.onended = () => { o.disconnect(); g.disconnect(); };
    };
    
    const now = audioCtx.currentTime; 
    beep(now, 1046.50); // C6
    beep(now + 0.15, 1318.51); // E6
};

const stopReadySound = () => { 
    if (beepInterval) { clearInterval(beepInterval); beepInterval = null; } 
};

interface ReadyAlertOrder {
    id: string;
    total: number;
    order_type: string;
    created_at: string;
    customer_name?: string;
    pickup_time?: string;
    items: any[];
}

export function ReadyAlertManager() {
    const [alertQueue, setAlertQueue] = useState<ReadyAlertOrder[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [mounted, setMounted] = useState(false);
    const processedIds = useRef<Map<string, number>>(new Map());
    const myDeviceId = useSystemStore((s) => s.deviceId);
    const myDeviceIdRef = useRef(myDeviceId);

    useEffect(() => setMounted(true), []);
    useEffect(() => { myDeviceIdRef.current = myDeviceId; }, [myDeviceId]);

    // Cleanup processed IDs
    useEffect(() => {
        const cleanup = setInterval(() => {
            const now = Date.now();
            processedIds.current.forEach((ts, key) => { if (now - ts > 600_000) processedIds.current.delete(key); });
        }, 300_000);
        return () => clearInterval(cleanup);
    }, []);

    const parseItems = useCallback((order: any): any[] => {
        const raw = order.items_json;
        if (!raw) return [];
        try {
            if (typeof raw === 'string') return JSON.parse(raw);
            if (Array.isArray(raw)) return raw;
        } catch { }
        return [];
    }, []);

    const enqueueAlert = useCallback((order: any, readyAtTime: string) => {
        const orderKey = `${order.id}_${readyAtTime}`;
        if (processedIds.current.has(orderKey)) return;

        const now = Date.now();
        processedIds.current.set(orderKey, now);

        const items = parseItems(order);

        const alertOrder: ReadyAlertOrder = {
            id: order.id,
            total: Number(order.total),
            order_type: order.order_type || 'sur_place',
            created_at: order.created_at,
            customer_name: order.customer_name || '',
            pickup_time: order.pickup_time || '',
            items
        };

        console.log('[ReadyAlert] ✅ Commande Prête:', order.id);

        setAlertQueue(prev => {
            const existingIndex = prev.findIndex(o => o.id === order.id);
            if (existingIndex !== -1) return prev; // Already in queue
            return [...prev, alertOrder];
        });

        setIsExpanded(true);
        playReadySound();
    }, [parseItems]);

    useEffect(() => {
        if (!supabase) return;

        const getReadyAt = (pd: any) => {
            if (!pd) return null;
            try {
                const details = typeof pd === 'string' ? JSON.parse(pd) : pd;
                if (Array.isArray(details)) {
                    return details.find(d => d.is_ready)?.ready_at || null;
                } else if (details?.is_ready) {
                    return details.ready_at;
                }
            } catch {}
            return null;
        };

        const channel = supabase.channel('ready_alerts_v1')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pos_orders' },
                (payload: any) => {
                    const newReadyAt = getReadyAt(payload.new?.payment_details);
                    const oldReadyAt = getReadyAt(payload.old?.payment_details);

                    if (newReadyAt && newReadyAt !== oldReadyAt) {
                        enqueueAlert(payload.new, newReadyAt);
                    }
                })
            .subscribe((status) => console.log('[ReadyAlert] Realtime:', status));

        return () => {
            supabase!.removeChannel(channel);
        };
    }, [enqueueAlert]);

    const handleMinimize = useCallback(() => {
        setIsExpanded(false);
        stopReadySound();
    }, []);

    const handleAcknowledge = useCallback((indexToRemove: number) => {
        setAlertQueue(prev => {
            const next = [...prev];
            next.splice(indexToRemove, 1);

            if (next.length === 0) {
                stopReadySound();
                setIsExpanded(false);
                setCurrentIndex(0);
            } else if (indexToRemove >= next.length) {
                setCurrentIndex(Math.max(0, next.length - 1));
            }
            return next;
        });
    }, []);

    if (!mounted) return null;

    const pendingCount = alertQueue.length;
    const safeIndex = Math.min(Math.max(0, currentIndex), Math.max(0, pendingCount - 1));
    const currentAlert = alertQueue[safeIndex];

    if (pendingCount === 0) return null;

    return createPortal(
        <>
            {/* FLOATING BUBBLE (placed slightly higher than red bubble to avoid overlap) */}
            {!isExpanded && pendingCount > 0 && (
                <button
                    onClick={() => { setIsExpanded(true); playReadySound(); }}
                    className="fixed bottom-48 right-6 z-[99998] flex items-center gap-3 px-5 py-4 bg-green-600 hover:bg-green-500 text-white rounded-full shadow-[0_0_40px_rgba(22,163,74,0.6)] animate-bounce active:scale-95 transition-all"
                >
                    <CheckCircle size={28} className="animate-pulse" />
                    <span className="font-black text-xl">{pendingCount}</span>
                    <span className="font-bold text-sm hidden sm:inline">prête{pendingCount > 1 ? 's' : ''}</span>
                </button>
            )}

            {/* FULL ALERT MODAL */}
            {isExpanded && currentAlert && (
                <div className="fixed inset-0 z-[99999] flex flex-col overflow-hidden bg-green-700">
                    {/* Header */}
                    <div className="bg-black/30 p-4 md:p-6 flex items-center justify-between shadow-2xl flex-shrink-0 border-b border-green-500/50">
                        <div className="flex items-center gap-3 md:gap-5 text-white flex-1 min-w-0">
                            <div className="w-14 h-14 md:w-20 md:h-20 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.4)] bg-green-500 flex-shrink-0 animate-pulse">
                                <CheckCircle size={32} className="md:hidden" />
                                <CheckCircle size={48} className="hidden md:block" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-2xl md:text-5xl font-black tracking-wider uppercase text-green-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                                    ✅ COMMANDE PRÊTE
                                </h1>
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                    <span className={`text-xl md:text-3xl font-black px-4 py-1 rounded-xl ${currentAlert.order_type === 'emporte'
                                        ? 'bg-sky-500 text-white'
                                        : 'bg-orange-500 text-white'
                                        }`}>
                                        {currentAlert.order_type === 'emporte' ? '📦 EMPORTÉ' : '🍽️ SUR PLACE'}
                                    </span>
                                    <span className="text-xl md:text-3xl font-black text-white">
                                        {currentAlert.total.toFixed(2)} €
                                    </span>
                                </div>
                                {(currentAlert.customer_name || currentAlert.pickup_time) && (
                                    <div className="mt-2 flex flex-wrap items-center gap-3">
                                        {currentAlert.customer_name && (
                                            <span className="text-xl md:text-3xl font-black text-yellow-300">
                                                👤 {currentAlert.customer_name}
                                            </span>
                                        )}
                                        {currentAlert.pickup_time && (
                                            <span className="text-xl md:text-3xl font-black text-green-200">
                                                🕐 {currentAlert.pickup_time}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
                            {pendingCount > 1 && (
                                <div className="flex items-center bg-black/40 rounded-xl border border-white/20 p-1 md:p-2">
                                    <button
                                        onClick={() => setCurrentIndex(Math.max(0, safeIndex - 1))}
                                        disabled={safeIndex === 0}
                                        className="p-2 md:p-3 text-white disabled:opacity-30 hover:bg-white/10 rounded-lg active:scale-95 transition-all"
                                    >
                                        <ChevronLeft size={24} className="md:w-8 md:h-8" />
                                    </button>

                                    <div className="px-3 md:px-5 font-black text-xl md:text-2xl text-white min-w-[80px] text-center">
                                        {safeIndex + 1} / {pendingCount}
                                    </div>

                                    <button
                                        onClick={() => setCurrentIndex(Math.min(pendingCount - 1, safeIndex + 1))}
                                        disabled={safeIndex === pendingCount - 1}
                                        className="p-2 md:p-3 text-white disabled:opacity-30 hover:bg-white/10 rounded-lg active:scale-95 transition-all"
                                    >
                                        <ChevronRight size={24} className="md:w-8 md:h-8" />
                                    </button>
                                </div>
                            )}

                            <button onClick={handleMinimize}
                                className="h-12 w-12 md:h-16 md:w-16 bg-black/40 hover:bg-black/60 border-2 border-white/30 text-white rounded-xl flex items-center justify-center active:scale-95 transition-all"
                                title="Minimiser"
                            >
                                <Minimize2 size={24} />
                            </button>
                        </div>
                    </div>

                    {/* Items List */}
                    <div className="flex-1 p-3 md:p-6 overflow-y-auto w-full max-w-5xl mx-auto flex flex-col gap-3 md:gap-5">
                        {currentAlert.items.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-green-200 text-xl font-bold">Détails non disponibles</div>
                            </div>
                        ) : (
                            currentAlert.items.map((item: any, idx: number) => {
                                let mods: any[] = [], note = '';
                                try {
                                    const sm = item.selected_modifiers;
                                    if (sm) {
                                        const parsed = typeof sm === 'string' ? JSON.parse(sm) : sm;
                                        if (Array.isArray(parsed)) mods = parsed;
                                        else { mods = parsed.mods || []; note = parsed.note || ''; }
                                    }
                                } catch { }

                                return (
                                    <div key={idx} className="bg-white rounded-2xl p-4 md:p-6 flex flex-col gap-2 md:gap-3 shadow-lg border-l-[12px] border-green-500">
                                        <div className="flex gap-3 md:gap-5 items-center">
                                            <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl bg-green-100 text-green-700 flex items-center justify-center font-black text-2xl md:text-4xl border-2 border-green-300 flex-shrink-0">
                                                {item.quantity}
                                            </div>
                                            <h2 className="text-2xl md:text-4xl font-black text-green-900 leading-tight block truncate">
                                                {item.product_name}
                                            </h2>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Footer - ACK */}
                    <div className="p-3 md:p-6 bg-black/30 flex justify-center flex-shrink-0">
                        <button onClick={() => handleAcknowledge(safeIndex)}
                            className="w-full max-w-3xl py-5 md:py-7 bg-white hover:bg-green-50 text-green-700 font-black text-xl md:text-3xl rounded-2xl shadow-[0_0_60px_rgba(255,255,255,0.2)] active:scale-[0.98] border-b-4 border-green-300 flex justify-center items-center gap-3 md:gap-5 transition-all">
                            <CheckCircle size={32} />
                            ✅ COMPRIS / FERMER
                        </button>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}
