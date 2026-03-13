"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { BellRing, X } from 'lucide-react';

// Audio synthesis
let audioCtx: AudioContext | null = null;
let beepInterval: NodeJS.Timeout | null = null;

const playAlertSound = () => {
    if (typeof window === 'undefined') return;
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    stopAlertSound();

    beepInterval = setInterval(() => {
        if (!audioCtx) return;
        const playBeep = (startTime: number) => {
            const osc = audioCtx!.createOscillator();
            const gain = audioCtx!.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(880, startTime);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.5, startTime + 0.02);
            gain.gain.linearRampToValueAtTime(0, startTime + 0.15);
            osc.connect(gain);
            gain.connect(audioCtx!.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.15);
        };
        const now = audioCtx.currentTime;
        playBeep(now);
        playBeep(now + 0.2);
    }, 1500);
};

const stopAlertSound = () => {
    if (beepInterval) {
        clearInterval(beepInterval);
        beepInterval = null;
    }
};

export function OrderAlertManager() {
    const [incomingOrder, setIncomingOrder] = useState<{ order: any; items: any[] } | null>(null);
    const [mounted, setMounted] = useState(false);
    const acknowledgedIds = useRef<Set<string>>(new Set());
    const lastPollTime = useRef<string>(new Date().toISOString());

    useEffect(() => setMounted(true), []);

    // Fetch items for an order
    const fetchItems = useCallback(async (orderId: string) => {
        if (!supabase) return [];
        try {
            const { data } = await supabase.from('pos_order_items').select('*').eq('order_id', orderId);
            return data || [];
        } catch { return []; }
    }, []);

    // Show alert for an order
    const showAlert = useCallback(async (order: any) => {
        if (acknowledgedIds.current.has(order.id)) return;
        console.log('[Alert] Showing alert for order:', order.id);
        playAlertSound();
        setIncomingOrder({ order, items: [] });

        // Fetch items with small delay + retry
        const tryFetch = async () => {
            for (let i = 0; i < 4; i++) {
                const items = await fetchItems(order.id);
                if (items.length > 0) {
                    setIncomingOrder(prev => prev ? { ...prev, items } : null);
                    return;
                }
                await new Promise(r => setTimeout(r, 1500));
            }
        };
        tryFetch();
    }, [fetchItems]);

    useEffect(() => {
        if (!supabase) {
            console.warn('[Alert] supabase client is null');
            return;
        }

        // === METHOD 1: Realtime subscription (instant when it works) ===
        const channel = supabase.channel('kitchen_alerts')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'pos_orders' },
                (payload: any) => {
                    console.log('[Alert] Realtime INSERT received:', payload.new?.id);
                    showAlert(payload.new);
                }
            )
            .subscribe((status) => {
                console.log('[Alert] Realtime status:', status);
            });

        // === METHOD 2: Polling fallback (every 5s, catches what Realtime misses) ===
        const pollInterval = setInterval(async () => {
            try {
                const { data: recentOrders } = await supabase!
                    .from('pos_orders')
                    .select('*')
                    .gt('created_at', lastPollTime.current)
                    .order('created_at', { ascending: true });

                if (recentOrders && recentOrders.length > 0) {
                    // Update poll timestamp to latest order
                    lastPollTime.current = recentOrders[recentOrders.length - 1].created_at;

                    for (const order of recentOrders) {
                        if (!acknowledgedIds.current.has(order.id)) {
                            console.log('[Alert] Poll found new order:', order.id);
                            showAlert(order);
                            break; // Show one at a time
                        }
                    }
                }
            } catch (e) {
                // Silent fail on poll — non-critical
            }
        }, 5000);

        return () => {
            supabase!.removeChannel(channel);
            clearInterval(pollInterval);
        };
    }, [showAlert]);

    if (!mounted || !incomingOrder) return null;

    const handleClose = () => {
        stopAlertSound();
        acknowledgedIds.current.add(incomingOrder.order.id);
        setIncomingOrder(null);
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex flex-col bg-red-600 overflow-hidden">
            {/* Header */}
            <div className="bg-black/40 p-6 md:p-8 flex items-center justify-between shadow-2xl flex-shrink-0">
                <div className="flex items-center gap-4 md:gap-6 text-white">
                    <div className="w-16 h-16 md:w-24 md:h-24 bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(255,255,255,0.5)] animate-bounce">
                        <BellRing size={40} className="text-white md:hidden" />
                        <BellRing size={56} className="text-white hidden md:block" />
                    </div>
                    <div>
                        <h1 className="text-3xl md:text-6xl font-black tracking-widest uppercase drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
                            NOUVELLE COMMANDE
                        </h1>
                        <p className="text-xl md:text-3xl font-bold text-red-100 mt-1 md:mt-2">
                            Machine : {incomingOrder.order.source_device || 'Inconnue'}
                            &nbsp;·&nbsp;
                            Total : {Number(incomingOrder.order.total).toFixed(2)} €
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleClose}
                    className="h-16 px-6 md:h-24 md:px-12 bg-black hover:bg-zinc-900 border-4 border-white text-white font-black text-2xl md:text-4xl rounded-2xl shadow-2xl transition-transform active:scale-95 flex items-center gap-2 md:gap-4"
                >
                    <X size={32} className="md:hidden" />
                    <X size={48} className="hidden md:block" />
                    FERMER
                </button>
            </div>

            {/* Order Items Body */}
            <div className="flex-1 p-4 md:p-8 overflow-y-auto w-full max-w-6xl mx-auto flex flex-col gap-4 md:gap-6">
                {incomingOrder.items.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-white/70 text-2xl md:text-4xl font-bold animate-pulse text-center">
                            Chargement des articles...
                        </div>
                    </div>
                ) : (
                    incomingOrder.items.map((item, idx) => {
                        let mods: any[] = [];
                        let note = '';
                        try {
                            const raw = item.selected_modifiers;
                            if (raw) {
                                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                                if (Array.isArray(parsed)) {
                                    mods = parsed;
                                } else {
                                    mods = parsed.mods || [];
                                    note = parsed.note || '';
                                }
                            }
                        } catch (e) { }

                        return (
                            <div key={idx} className="bg-white rounded-2xl md:rounded-3xl p-6 md:p-8 flex flex-col gap-3 md:gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-4 md:border-[8px] border-black/20">
                                <div className="flex gap-4 md:gap-6 items-center">
                                    <div className="w-14 h-14 md:w-20 md:h-20 rounded-xl md:rounded-2xl bg-red-600 text-white flex items-center justify-center font-black text-3xl md:text-5xl shadow-inner border-2 md:border-4 border-red-800 flex-shrink-0">
                                        {item.quantity}
                                    </div>
                                    <h2 className="text-3xl md:text-5xl font-black text-black leading-tight">{item.product_name}</h2>
                                </div>

                                {mods.length > 0 && (
                                    <div className="bg-zinc-100 rounded-xl md:rounded-2xl p-4 md:p-6 space-y-2 md:space-y-3 border-l-[8px] md:border-l-[12px] border-blue-500">
                                        <h3 className="text-base md:text-xl text-blue-600 uppercase tracking-widest mb-1 md:mb-2 font-bold">Suppléments :</h3>
                                        {mods.map((m: any, i: number) => (
                                            <div key={i} className="flex items-center gap-3 md:gap-4 text-xl md:text-3xl font-bold text-zinc-800">
                                                <span className="text-blue-500 text-2xl md:text-4xl">+</span>
                                                <span>{m.quantity && m.quantity > 1 ? `${m.quantity}× ` : ''}{m.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {note && (
                                    <div className="bg-yellow-300 border-4 md:border-[8px] border-yellow-500 text-black p-4 md:p-6 rounded-xl md:rounded-2xl font-black text-2xl md:text-4xl shadow-lg">
                                        ⚠️ NOTE : {note}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer */}
            <div className="p-4 md:p-8 bg-black/40 flex justify-center backdrop-blur-md flex-shrink-0">
                <button
                    onClick={handleClose}
                    className="w-full max-w-3xl py-6 md:py-8 bg-white hover:bg-zinc-200 text-red-600 font-black text-2xl md:text-4xl rounded-2xl md:rounded-[2rem] shadow-[0_0_100px_rgba(255,255,255,0.3)] transition-transform active:scale-[0.98] flex justify-center items-center gap-4 md:gap-6"
                >
                    <BellRing size={36} className="animate-pulse md:hidden" />
                    <BellRing size={48} className="animate-pulse hidden md:block" />
                    J'AI PRIS EN CHARGE
                </button>
            </div>
        </div>,
        document.body
    );
}
