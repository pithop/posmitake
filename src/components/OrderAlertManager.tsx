"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useSystemStore } from '@/store/useStore';
import { BellRing, X } from 'lucide-react';

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
        const playBeep = (t: number) => {
            const o = audioCtx!.createOscillator(), g = audioCtx!.createGain();
            o.type = 'square'; o.frequency.setValueAtTime(880, t);
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.02);
            g.gain.linearRampToValueAtTime(0, t + 0.15);
            o.connect(g); g.connect(audioCtx!.destination); o.start(t); o.stop(t + 0.15);
        };
        const now = audioCtx.currentTime; playBeep(now); playBeep(now + 0.2);
    }, 1500);
};
const stopAlertSound = () => { if (beepInterval) { clearInterval(beepInterval); beepInterval = null; } };

export function OrderAlertManager() {
    const [incomingOrder, setIncomingOrder] = useState<{ order: any; items: any[] } | null>(null);
    const [mounted, setMounted] = useState(false);
    const acknowledgedIds = useRef<Set<string>>(new Set());
    const myDeviceId = useSystemStore((s) => s.deviceId);

    // Use current time as baseline — only alert on orders AFTER this moment
    const mountTime = useRef<string>(new Date().toISOString());
    const lastPollTime = useRef<string>(new Date().toISOString());

    useEffect(() => setMounted(true), []);

    const fetchItems = useCallback(async (orderId: string) => {
        if (!supabase) return [];
        for (let i = 0; i < 4; i++) {
            if (i > 0) await new Promise(r => setTimeout(r, 1500));
            try {
                const { data } = await supabase.from('pos_order_items').select('*').eq('order_id', orderId);
                if (data && data.length > 0) return data;
            } catch { }
        }
        return [];
    }, []);

    const showAlert = useCallback(async (order: any) => {
        if (acknowledgedIds.current.has(order.id)) return;

        // Don't alert on own orders (same device)
        if (order.source_device === myDeviceId) {
            console.log('[Alert] Ignoring own order from', myDeviceId);
            acknowledgedIds.current.add(order.id);
            return;
        }

        // Don't alert on orders older than 60 seconds
        const orderAge = Date.now() - new Date(order.created_at).getTime();
        if (orderAge > 60000) {
            console.log('[Alert] Ignoring old order', order.id, '(age:', Math.round(orderAge / 1000), 's)');
            acknowledgedIds.current.add(order.id);
            return;
        }

        console.log('[Alert] 🔔 Showing alert for order:', order.id, 'from:', order.source_device);
        playAlertSound();
        setIncomingOrder({ order, items: [] });

        const items = await fetchItems(order.id);
        setIncomingOrder(prev => prev ? { ...prev, items } : null);
    }, [fetchItems, myDeviceId]);

    useEffect(() => {
        if (!supabase) return;

        // METHOD 1: Realtime
        const channel = supabase.channel('kitchen_alerts')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pos_orders' },
                (payload: any) => {
                    console.log('[Alert] Realtime INSERT:', payload.new?.id);
                    showAlert(payload.new);
                })
            .subscribe((status) => console.log('[Alert] Realtime:', status));

        // METHOD 2: Polling every 5s — only orders AFTER mount time
        const pollInterval = setInterval(async () => {
            try {
                const { data } = await supabase!
                    .from('pos_orders')
                    .select('*')
                    .gt('created_at', lastPollTime.current)
                    .order('created_at', { ascending: true });

                if (data && data.length > 0) {
                    lastPollTime.current = data[data.length - 1].created_at;
                    for (const order of data) {
                        if (!acknowledgedIds.current.has(order.id)) {
                            showAlert(order);
                            break;
                        }
                    }
                }
            } catch { }
        }, 5000);

        return () => { supabase!.removeChannel(channel); clearInterval(pollInterval); };
    }, [showAlert]);

    if (!mounted || !incomingOrder) return null;

    const handleClose = () => {
        stopAlertSound();
        acknowledgedIds.current.add(incomingOrder.order.id);
        setIncomingOrder(null);
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex flex-col bg-red-600 overflow-hidden">
            <div className="bg-black/40 p-6 md:p-8 flex items-center justify-between shadow-2xl flex-shrink-0">
                <div className="flex items-center gap-4 md:gap-6 text-white">
                    <div className="w-16 h-16 md:w-24 md:h-24 bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(255,255,255,0.5)] animate-bounce">
                        <BellRing size={40} className="md:hidden" />
                        <BellRing size={56} className="hidden md:block" />
                    </div>
                    <div>
                        <h1 className="text-3xl md:text-6xl font-black tracking-widest uppercase drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
                            NOUVELLE COMMANDE
                        </h1>
                        <p className="text-xl md:text-3xl font-bold text-red-100 mt-1 md:mt-2">
                            Machine : {incomingOrder.order.source_device || 'Inconnue'} · Total : {Number(incomingOrder.order.total).toFixed(2)} €
                        </p>
                    </div>
                </div>
                <button onClick={handleClose}
                    className="h-16 px-6 md:h-24 md:px-12 bg-black hover:bg-zinc-900 border-4 border-white text-white font-black text-2xl md:text-4xl rounded-2xl shadow-2xl active:scale-95 flex items-center gap-2 md:gap-4">
                    <X size={32} className="md:hidden" /><X size={48} className="hidden md:block" />
                    FERMER
                </button>
            </div>

            <div className="flex-1 p-4 md:p-8 overflow-y-auto w-full max-w-6xl mx-auto flex flex-col gap-4 md:gap-6">
                {incomingOrder.items.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-white/70 text-2xl md:text-4xl font-bold animate-pulse text-center">Chargement des articles...</div>
                    </div>
                ) : (
                    incomingOrder.items.map((item, idx) => {
                        let mods: any[] = [], note = '';
                        try {
                            const raw = item.selected_modifiers;
                            if (raw) {
                                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                                if (Array.isArray(parsed)) mods = parsed;
                                else { mods = parsed.mods || []; note = parsed.note || ''; }
                            }
                        } catch { }
                        return (
                            <div key={idx} className="bg-white rounded-2xl md:rounded-3xl p-6 md:p-8 flex flex-col gap-3 md:gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-4 md:border-[8px] border-black/20">
                                <div className="flex gap-4 md:gap-6 items-center">
                                    <div className="w-14 h-14 md:w-20 md:h-20 rounded-xl md:rounded-2xl bg-red-600 text-white flex items-center justify-center font-black text-3xl md:text-5xl border-2 md:border-4 border-red-800 flex-shrink-0">{item.quantity}</div>
                                    <h2 className="text-3xl md:text-5xl font-black text-black leading-tight">{item.product_name}</h2>
                                </div>
                                {mods.length > 0 && (
                                    <div className="bg-zinc-100 rounded-xl md:rounded-2xl p-4 md:p-6 space-y-2 border-l-[8px] md:border-l-[12px] border-blue-500">
                                        <h3 className="text-base md:text-xl text-blue-600 uppercase tracking-widest font-bold">Suppléments :</h3>
                                        {mods.map((m: any, i: number) => (
                                            <div key={i} className="flex items-center gap-3 text-xl md:text-3xl font-bold text-zinc-800">
                                                <span className="text-blue-500 text-2xl md:text-4xl">+</span>
                                                <span>{m.quantity && m.quantity > 1 ? `${m.quantity}× ` : ''}{m.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {note && (
                                    <div className="bg-yellow-300 border-4 md:border-[8px] border-yellow-500 text-black p-4 md:p-6 rounded-xl md:rounded-2xl font-black text-2xl md:text-4xl shadow-lg">⚠️ NOTE : {note}</div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            <div className="p-4 md:p-8 bg-black/40 flex justify-center flex-shrink-0">
                <button onClick={handleClose}
                    className="w-full max-w-3xl py-6 md:py-8 bg-white hover:bg-zinc-200 text-red-600 font-black text-2xl md:text-4xl rounded-2xl md:rounded-[2rem] shadow-[0_0_100px_rgba(255,255,255,0.3)] active:scale-[0.98] flex justify-center items-center gap-4 md:gap-6">
                    <BellRing size={36} className="animate-pulse md:hidden" /><BellRing size={48} className="animate-pulse hidden md:block" />
                    J'AI PRIS EN CHARGE
                </button>
            </div>
        </div>,
        document.body
    );
}
