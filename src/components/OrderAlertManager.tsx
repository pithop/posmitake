"use client";

import { useEffect, useState } from 'react';
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

// Fetch order items with retry — items are uploaded asynchronously after the order row,
// so we retry up to 3 times with 1.5s intervals to wait for PowerSync sync
const fetchOrderItemsWithRetry = async (orderId: string, retries = 3): Promise<any[]> => {
    for (let attempt = 0; attempt < retries; attempt++) {
        if (attempt > 0) {
            await new Promise(r => setTimeout(r, 1500));
        }
        try {
            const { data, error } = await supabase!
                .from('pos_order_items')
                .select('*')
                .eq('order_id', orderId);

            if (!error && data && data.length > 0) {
                return data;
            }
        } catch (e) {
            console.warn('[Alert] Item fetch attempt', attempt + 1, 'failed:', e);
        }
    }
    return [];
};

export function OrderAlertManager() {
    const [incomingOrder, setIncomingOrder] = useState<{ order: any; items: any[] } | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!supabase) return;

        const channel = supabase.channel('kitchen:new_orders')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'pos_orders' },
                async (payload: any) => {
                    const newOrder = payload.new;
                    console.log('[Alert] New order received:', newOrder.id);

                    playAlertSound();

                    // Show alert immediately with the order (no items yet)
                    setIncomingOrder({ order: newOrder, items: [] });

                    // Fetch items with retry (PowerSync uploads items ~1-3s after order)
                    const items = await fetchOrderItemsWithRetry(newOrder.id);
                    console.log('[Alert] Fetched', items.length, 'items for order', newOrder.id);

                    // Update with items once fetched
                    setIncomingOrder(prev => prev ? { ...prev, items } : null);
                }
            )
            .subscribe((status) => {
                console.log('[Alert] Realtime status:', status);
            });

        return () => {
            supabase!.removeChannel(channel);
        };
    }, []);

    if (!mounted || !incomingOrder) return null;

    const handleClose = () => {
        stopAlertSound();
        setIncomingOrder(null);
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex flex-col bg-red-600 overflow-hidden">
            {/* Header */}
            <div className="bg-black/40 p-8 flex items-center justify-between shadow-2xl flex-shrink-0">
                <div className="flex items-center gap-6 text-white">
                    <div className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(255,255,255,0.5)] animate-bounce">
                        <BellRing size={56} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-6xl font-black tracking-widest uppercase drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
                            NOUVELLE COMMANDE
                        </h1>
                        <p className="text-3xl font-bold text-red-100 mt-2">
                            Machine : {incomingOrder.order.source_device || 'Inconnue'}
                            &nbsp;·&nbsp;
                            Total : {Number(incomingOrder.order.total).toFixed(2)} €
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleClose}
                    className="h-24 px-12 bg-black hover:bg-zinc-900 border-4 border-white text-white font-black text-4xl rounded-2xl shadow-2xl transition-transform active:scale-95 flex items-center gap-4"
                >
                    <X size={48} />
                    FERMER
                </button>
            </div>

            {/* Order Items Body */}
            <div className="flex-1 p-8 overflow-y-auto w-full max-w-6xl mx-auto flex flex-col gap-6">
                {incomingOrder.items.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-white/70 text-4xl font-bold animate-pulse text-center">
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
                            <div key={idx} className="bg-white rounded-3xl p-8 flex flex-col gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-[8px] border-black/20">
                                <div className="flex gap-6 items-center">
                                    <div className="w-20 h-20 rounded-2xl bg-red-600 text-white flex items-center justify-center font-black text-5xl shadow-inner border-4 border-red-800 flex-shrink-0">
                                        {item.quantity}
                                    </div>
                                    <h2 className="text-5xl font-black text-black leading-tight">{item.product_name}</h2>
                                </div>

                                {mods.length > 0 && (
                                    <div className="bg-zinc-100 rounded-2xl p-6 space-y-3 border-l-[12px] border-blue-500">
                                        <h3 className="text-xl text-blue-600 uppercase tracking-widest mb-2 font-bold">Suppléments :</h3>
                                        {mods.map((m: any, i: number) => (
                                            <div key={i} className="flex items-center gap-4 text-3xl font-bold text-zinc-800">
                                                <span className="text-blue-500 text-4xl">+</span>
                                                <span>{m.quantity && m.quantity > 1 ? `${m.quantity}× ` : ''}{m.name}</span>
                                                {m.price > 0 && <span className="text-zinc-400 text-2xl ml-auto">+{Number(m.price).toFixed(2)} €</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {note && (
                                    <div className="bg-yellow-300 border-[8px] border-yellow-500 text-black p-6 rounded-2xl font-black text-4xl shadow-lg">
                                        ⚠️ NOTE : {note}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer */}
            <div className="p-8 bg-black/40 flex justify-center backdrop-blur-md flex-shrink-0">
                <button
                    onClick={handleClose}
                    className="w-full max-w-3xl py-8 bg-white hover:bg-zinc-200 text-red-600 font-black text-4xl rounded-[2rem] shadow-[0_0_100px_rgba(255,255,255,0.3)] transition-transform active:scale-[0.98] flex justify-center items-center gap-6"
                >
                    <BellRing size={48} className="animate-pulse" />
                    J'AI PRIS EN CHARGE LA COMMANDE
                </button>
            </div>
        </div>,
        document.body
    );
}
