"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils";
import { useSystemStore } from '@/store/useStore';
import { logger } from "@/lib/logger";
import { BellRing, X, ChevronRight, ChevronLeft, Minimize2 } from 'lucide-react';

// Audio
let audioCtx: AudioContext | null = null;
let beepInterval: NodeJS.Timeout | null = null;

const playAlertSound = () => {
    if (typeof window === 'undefined') return;
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    stopAlertSound();
    beepInterval = setInterval(() => {
        if (!audioCtx) return;
        const beep = (t: number) => {
            const o = audioCtx!.createOscillator(), g = audioCtx!.createGain();
            o.type = 'square'; o.frequency.setValueAtTime(880, t);
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.02);
            g.gain.linearRampToValueAtTime(0, t + 0.15);
            o.connect(g); g.connect(audioCtx!.destination); o.start(t); o.stop(t + 0.15);
        };
        const now = audioCtx.currentTime; beep(now); beep(now + 0.2);
    }, 1500);
};
const stopAlertSound = () => { if (beepInterval) { clearInterval(beepInterval); beepInterval = null; } };

interface AlertOrder {
    id: string;
    total: number;
    source_device: string;
    order_type: string;
    created_at: string;
    customer_name?: string;
    pickup_time?: string;
    items: any[];
    is_rappel?: boolean;
}

export function OrderAlertManager() {
    // Queue of pending alerts
    const [alertQueue, setAlertQueue] = useState<AlertOrder[]>([]);
    // Index of the currently viewed alert
    const [currentIndex, setCurrentIndex] = useState(0);
    // Whether the full alert modal is open or minimized to bubble
    const [isExpanded, setIsExpanded] = useState(false);
    const [mounted, setMounted] = useState(false);
    const processedIds = useRef<Set<string>>(new Set());
    const processedRappels = useRef<Set<string>>(new Set());
    const myDeviceId = useSystemStore((s) => s.deviceId);
    const lastPollTime = useRef<string>(new Date().toISOString());

    useEffect(() => setMounted(true), []);

    const parseItems = useCallback((order: any): any[] => {
        const raw = order.items_json;
        if (!raw) return [];
        try {
            if (typeof raw === 'string') return JSON.parse(raw);
            if (Array.isArray(raw)) return raw;
        } catch { }
        return [];
    }, []);

    const enqueueAlert = useCallback((order: any) => {
        const isRappel = !!order.is_rappel;
        const rappelKey = order.rappel_at ? `${order.id}_${order.rappel_at}` : null;

        if (!isRappel && processedIds.current.has(order.id)) return;
        if (isRappel && rappelKey && processedRappels.current.has(rappelKey)) return;

        // Skip own device orders
        if (order.source_device === myDeviceId) {
            if (!isRappel) processedIds.current.add(order.id);
            if (isRappel && rappelKey) processedRappels.current.add(rappelKey);
            return;
        }

        // Skip orders older than 2 minutes
        const age = Date.now() - new Date(order.created_at).getTime();
        if (age > 120000) {
            if (!isRappel) processedIds.current.add(order.id);
            if (isRappel && rappelKey) processedRappels.current.add(rappelKey);
            return;
        }

        if (!isRappel) processedIds.current.add(order.id);
        if (isRappel && rappelKey) processedRappels.current.add(rappelKey);

        const items = parseItems(order);

        const alertOrder: AlertOrder = {
            id: order.id,
            total: Number(order.total),
            source_device: order.source_device || 'inconnue',
            order_type: order.order_type || 'sur_place',
            created_at: order.created_at,
            customer_name: order.customer_name || '',
            pickup_time: order.pickup_time || '',
            items,
        };

        console.log('[Alert] 🔔 New order/rappel:', order.id, '— items:', items.length);

        setAlertQueue(prev => {
            // If it's already in the queue, we don't duplicate it. But we will still play the sound below.
            if (prev.some(o => o.id === order.id)) return prev;
            return [...prev, alertOrder];
        });

        // SEND ACKNOWLEDGEMENT BACK TO CAISSE
        if (supabase) {
            const ackChannel = supabase.channel('kitchen_alerts_ack_send_' + Date.now());
            ackChannel
                .on('broadcast', { event: 'ACK_ORDER' }, () => { /* no-op listener to join topic */ })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await ackChannel.send({
                            type: 'broadcast',
                            event: 'ACK_ORDER',
                            payload: { traceId: order.id, deviceId: myDeviceId }
                        });
                        setTimeout(() => supabase!.removeChannel(ackChannel), 2000);
                    }
                });
        }

        // Auto-expand and play sound
        setIsExpanded(true);
        playAlertSound();
    }, [myDeviceId, parseItems]);

    // Listen for orders
    useEffect(() => {
        if (!supabase) return;

        const channel = supabase.channel('kitchen_alerts_v3')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pos_orders' },
                (payload: any) => {
                    console.log('[Alert] Realtime INSERT:', payload.new?.id);
                    enqueueAlert(payload.new);
                })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pos_orders' },
                (payload: any) => {
                    // Only re-alert if rappel_at was just set (this is the Rappel mechanism)
                    if (payload.new?.rappel_at && payload.new.rappel_at !== payload.old?.rappel_at) {
                        console.log('[Alert] Realtime RAPPEL (UPDATE):', payload.new?.id);
                        enqueueAlert({ ...payload.new, is_rappel: true });
                    }
                })
            .subscribe((status) => console.log('[Alert] Realtime:', status));

        const poll = setInterval(async () => {
            try {
                const { data } = await supabase!
                    .from('pos_orders')
                    .select('*')
                    .gt('created_at', lastPollTime.current)
                    .order('created_at', { ascending: true });

                if (data && data.length > 0) {
                    lastPollTime.current = data[data.length - 1].created_at;
                    for (const order of data) enqueueAlert(order);
                }
            } catch { }
        }, 2000);

        return () => { supabase!.removeChannel(channel); clearInterval(poll); };
    }, [enqueueAlert]);

    // MINIMIZE — hide full alert, keep bubble
    const handleMinimize = useCallback(() => {
        setIsExpanded(false);
        stopAlertSound();
    }, []);

    // ACKNOWLEDGE — fully dismiss the CURRENT order from queue
    const handleAcknowledge = useCallback((indexToRemove: number) => {
        setAlertQueue(prev => {
            const next = [...prev];
            const removed = next.splice(indexToRemove, 1);

            if (removed.length > 0) {
                logger.audit('REALTIME', 'RAPPEL_CUISINE_ACKNOWLEDGED_MANUALLY', {
                    order_id: removed[0].id,
                    queue_size_remaining: next.length
                });
            }

            if (next.length === 0) {
                stopAlertSound();
                setIsExpanded(false);
                setCurrentIndex(0);
            } else if (indexToRemove >= next.length) {
                // If we removed the last item in the list, step back one
                setCurrentIndex(Math.max(0, next.length - 1));
            }

            return next;
        });
    }, []);

    if (!mounted) return null;

    const pendingCount = alertQueue.length;
    // Ensure index is always within bounds
    const safeIndex = Math.min(Math.max(0, currentIndex), Math.max(0, pendingCount - 1));
    const currentAlert = alertQueue[safeIndex];

    // Nothing pending — render nothing
    if (pendingCount === 0) return null;

    return createPortal(
        <>
            {/* ===== FLOATING BUBBLE (always visible when minimized) ===== */}
            {!isExpanded && pendingCount > 0 && (
                <button
                    onClick={() => { setIsExpanded(true); playAlertSound(); }}
                    className="fixed bottom-24 right-6 z-[99998] flex items-center gap-3 px-5 py-4 bg-red-600 hover:bg-red-500 text-white rounded-full shadow-[0_0_40px_rgba(220,38,38,0.6)] animate-bounce active:scale-95 transition-all"
                >
                    <BellRing size={28} className="animate-pulse" />
                    <span className="font-black text-xl">{pendingCount}</span>
                    <span className="font-bold text-sm hidden sm:inline">commande{pendingCount > 1 ? 's' : ''}</span>
                </button>
            )}

            {/* ===== FULL ALERT MODAL ===== */}
            {isExpanded && currentAlert && (
                <div className="fixed inset-0 z-[99999] flex flex-col bg-red-600 overflow-hidden">
                    {/* Header */}
                    <div className="bg-black/40 p-4 md:p-6 flex items-center justify-between shadow-2xl flex-shrink-0">
                        <div className="flex items-center gap-3 md:gap-5 text-white flex-1 min-w-0">
                            <div className="w-14 h-14 md:w-20 md:h-20 bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.4)] animate-bounce flex-shrink-0">
                                <BellRing size={32} className="md:hidden" />
                                <BellRing size={48} className="hidden md:block" />
                            </div>
                            <div className="min-w-0">
                                <h1 className={`text-2xl md:text-4xl font-black tracking-wider uppercase ${currentAlert.is_rappel ? 'text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]' : ''}`}>
                                    {currentAlert.is_rappel ? "⚠️ RAPPEL COMMANDE" : "NOUVELLE COMMANDE"}
                                </h1>
                                {/* Order type — huge badge */}
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
                                {/* Customer name + time — big and clear */}
                                {(currentAlert.customer_name || currentAlert.pickup_time) && (
                                    <div className="mt-2 flex flex-wrap items-center gap-3">
                                        {currentAlert.customer_name && (
                                            <span className="text-xl md:text-3xl font-black text-yellow-300">
                                                👤 {currentAlert.customer_name}
                                            </span>
                                        )}
                                        {currentAlert.pickup_time && (
                                            <span className="text-xl md:text-3xl font-black text-green-300">
                                                🕐 {currentAlert.pickup_time}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
                            {/* Navigation controls if multiple alerts */}
                            {pendingCount > 1 && (
                                <div className="flex items-center bg-black/50 rounded-xl border border-white/20 p-1 md:p-2">
                                    <button
                                        onClick={() => setCurrentIndex(Math.max(0, safeIndex - 1))}
                                        disabled={safeIndex === 0}
                                        className="p-2 md:p-3 text-white disabled:opacity-30 hover:bg-white/10 rounded-lg active:scale-95 transition-all"
                                    >
                                        <ChevronLeft size={24} className="md:w-8 md:h-8" />
                                    </button>

                                    <div className="px-3 md:px-5 font-black text-xl md:text-2xl text-yellow-400 min-w-[80px] text-center">
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

                            {/* Minimize button (X → becomes floating bubble) */}
                            <button onClick={handleMinimize}
                                className="h-12 w-12 md:h-16 md:w-16 bg-black/50 hover:bg-black/70 border-2 border-white/30 text-white rounded-xl flex items-center justify-center active:scale-95 transition-all"
                                title="Minimiser"
                            >
                                <Minimize2 size={24} />
                            </button>
                        </div>
                    </div>

                    {/* Items */}
                    <div className="flex-1 p-3 md:p-6 overflow-y-auto w-full max-w-5xl mx-auto flex flex-col gap-3 md:gap-5">
                        {currentAlert.items.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-white/70 text-xl md:text-3xl font-bold text-center">Détails non disponibles</div>
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
                                    <div key={idx} className="bg-white rounded-2xl p-4 md:p-6 flex flex-col gap-2 md:gap-3 shadow-[0_10px_30px_rgba(0,0,0,0.4)] border-4 border-black/20">
                                        <div className="flex gap-3 md:gap-5 items-center">
                                            <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl bg-red-600 text-white flex items-center justify-center font-black text-2xl md:text-4xl border-2 border-red-800 flex-shrink-0">
                                                {item.quantity}
                                            </div>
                                            <h2 className="text-2xl md:text-4xl font-black text-black leading-tight">{item.product_name}</h2>
                                        </div>
                                        {mods.length > 0 && (
                                            <div className="bg-zinc-100 rounded-xl p-3 md:p-5 space-y-1 border-l-[6px] md:border-l-[10px] border-blue-500">
                                                {mods.map((m: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-2 text-lg md:text-2xl font-bold text-zinc-800">
                                                        <span className="text-blue-500">+</span>
                                                        <span>{m.quantity && m.quantity > 1 ? `${m.quantity}× ` : ''}{m.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {note && (
                                            <div className="bg-yellow-300 border-4 border-yellow-500 text-black p-3 md:p-5 rounded-xl font-black text-xl md:text-3xl shadow-lg">
                                                ⚠️ {note}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Footer — main action: ACKNOWLEDGE */}
                    <div className="p-3 md:p-6 bg-black/40 flex justify-center flex-shrink-0">
                        <button onClick={() => handleAcknowledge(safeIndex)}
                            className="w-full max-w-3xl py-5 md:py-7 bg-white hover:bg-zinc-200 text-red-600 font-black text-xl md:text-3xl rounded-2xl shadow-[0_0_60px_rgba(255,255,255,0.2)] active:scale-[0.98] flex justify-center items-center gap-3 md:gap-5">
                            <BellRing size={32} />
                            ✅ MARQUER COMME PRIS EN CHARGE
                        </button>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}
