"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useSystemStore } from '@/store/useStore';
import { BellRing, X, ChevronRight } from 'lucide-react';

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
    items: any[];
}

export function OrderAlertManager() {
    const [alertQueue, setAlertQueue] = useState<AlertOrder[]>([]);
    const [mounted, setMounted] = useState(false);
    const acknowledgedIds = useRef<Set<string>>(new Set());
    const myDeviceId = useSystemStore((s) => s.deviceId);
    const lastPollTime = useRef<string>(new Date().toISOString());

    useEffect(() => setMounted(true), []);

    // Parse items from the order — uses embedded items_json (instant, no fetch needed)
    const parseItems = useCallback((order: any): any[] => {
        const raw = order.items_json;
        if (!raw) return [];
        try {
            if (typeof raw === 'string') return JSON.parse(raw);
            if (Array.isArray(raw)) return raw;
        } catch { }
        return [];
    }, []);

    // Add an order to the alert queue
    const enqueueAlert = useCallback((order: any) => {
        if (acknowledgedIds.current.has(order.id)) return;

        // Don't alert on own device's orders
        if (order.source_device === myDeviceId) {
            acknowledgedIds.current.add(order.id);
            return;
        }

        // Don't alert on orders older than 2 minutes
        const age = Date.now() - new Date(order.created_at).getTime();
        if (age > 120000) {
            acknowledgedIds.current.add(order.id);
            return;
        }

        const items = parseItems(order);
        const alertOrder: AlertOrder = {
            id: order.id,
            total: Number(order.total),
            source_device: order.source_device || 'inconnue',
            order_type: order.order_type || 'sur_place',
            created_at: order.created_at,
            items,
        };

        acknowledgedIds.current.add(order.id);
        console.log('[Alert] 🔔 Enqueuing alert for', order.id, '— items:', items.length);

        setAlertQueue(prev => {
            // Avoid duplicate
            if (prev.some(o => o.id === order.id)) return prev;
            return [...prev, alertOrder];
        });

        playAlertSound();
    }, [myDeviceId, parseItems]);

    useEffect(() => {
        if (!supabase) return;

        // METHOD 1: Realtime — instant when it works
        const channel = supabase.channel('kitchen_alerts_v2')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pos_orders' },
                (payload: any) => {
                    console.log('[Alert] Realtime INSERT:', payload.new?.id);
                    enqueueAlert(payload.new);
                })
            .subscribe((status) => console.log('[Alert] Realtime:', status));

        // METHOD 2: Polling every 2s — guaranteed delivery regardless of Realtime
        const poll = setInterval(async () => {
            try {
                const { data } = await supabase!
                    .from('pos_orders')
                    .select('*')
                    .gt('created_at', lastPollTime.current)
                    .order('created_at', { ascending: true });

                if (data && data.length > 0) {
                    lastPollTime.current = data[data.length - 1].created_at;
                    for (const order of data) {
                        enqueueAlert(order);
                    }
                }
            } catch { }
        }, 2000);

        return () => { supabase!.removeChannel(channel); clearInterval(poll); };
    }, [enqueueAlert]);

    // Acknowledge (dismiss) the first alert in the queue
    const handleDismiss = useCallback(() => {
        setAlertQueue(prev => {
            const next = prev.slice(1);
            if (next.length === 0) stopAlertSound();
            return next;
        });
    }, []);

    if (!mounted || alertQueue.length === 0) return null;

    const currentAlert = alertQueue[0];
    const pendingCount = alertQueue.length;

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex flex-col bg-red-600 overflow-hidden">
            {/* Header */}
            <div className="bg-black/40 p-4 md:p-6 flex items-center justify-between shadow-2xl flex-shrink-0">
                <div className="flex items-center gap-3 md:gap-5 text-white flex-1 min-w-0">
                    <div className="w-14 h-14 md:w-20 md:h-20 bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.4)] animate-bounce flex-shrink-0">
                        <BellRing size={32} className="md:hidden" />
                        <BellRing size={48} className="hidden md:block" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-2xl md:text-5xl font-black tracking-wider uppercase">
                            NOUVELLE COMMANDE
                        </h1>
                        <p className="text-base md:text-2xl font-bold text-red-100 mt-1 truncate">
                            {currentAlert.order_type === 'emporte' ? '📦 EMPORTÉ' : '🍽️ SUR PLACE'}
                            {' · '}
                            {currentAlert.source_device}
                            {' · '}
                            {currentAlert.total.toFixed(2)} €
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                    {pendingCount > 1 && (
                        <div className="bg-yellow-400 text-black font-black text-lg md:text-2xl px-4 py-2 rounded-xl animate-pulse">
                            +{pendingCount - 1} en attente
                        </div>
                    )}
                    <button onClick={handleDismiss}
                        className="h-12 px-4 md:h-16 md:px-8 bg-black hover:bg-zinc-900 border-2 border-white text-white font-black text-xl md:text-3xl rounded-xl shadow-2xl active:scale-95 flex items-center gap-2">
                        <X size={24} className="md:hidden" /><X size={36} className="hidden md:block" />
                        {pendingCount > 1 ? 'SUIVANT' : 'FERMER'}
                    </button>
                </div>
            </div>

            {/* Items */}
            <div className="flex-1 p-3 md:p-6 overflow-y-auto w-full max-w-5xl mx-auto flex flex-col gap-3 md:gap-5">
                {currentAlert.items.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-white/70 text-xl md:text-3xl font-bold text-center">
                            Détails non disponibles
                        </div>
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

            {/* Footer */}
            <div className="p-3 md:p-6 bg-black/40 flex justify-center flex-shrink-0">
                <button onClick={handleDismiss}
                    className="w-full max-w-3xl py-5 md:py-7 bg-white hover:bg-zinc-200 text-red-600 font-black text-xl md:text-3xl rounded-2xl shadow-[0_0_60px_rgba(255,255,255,0.2)] active:scale-[0.98] flex justify-center items-center gap-3 md:gap-5">
                    {pendingCount > 1 ? (
                        <>
                            <ChevronRight size={32} />
                            COMMANDE SUIVANTE ({pendingCount - 1} restante{pendingCount > 2 ? 's' : ''})
                        </>
                    ) : (
                        <>
                            <BellRing size={32} className="animate-pulse" />
                            J'AI PRIS EN CHARGE
                        </>
                    )}
                </button>
            </div>
        </div>,
        document.body
    );
}
