"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { BellRing, X } from 'lucide-react';

// Audio synthesize variables
let audioCtx: AudioContext | null = null;
let beepInterval: NodeJS.Timeout | null = null;

const playAlertSound = () => {
    if (typeof window === 'undefined') return;
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // Stop any existing
    stopAlertSound();

    // Loop a loud double-beep pattern
    beepInterval = setInterval(() => {
        if (!audioCtx) return;
        const playBeep = (startTime: number) => {
            const oscillator = audioCtx!.createOscillator();
            const gainNode = audioCtx!.createGain();

            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(880, startTime);

            // High volume piercing beep
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.02);
            gainNode.gain.linearRampToValueAtTime(0, startTime + 0.15);

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx!.destination);

            oscillator.start(startTime);
            oscillator.stop(startTime + 0.15);
        };

        const now = audioCtx.currentTime;
        playBeep(now); // beep 1
        playBeep(now + 0.2); // beep 2
    }, 1500);
};

const stopAlertSound = () => {
    if (beepInterval) {
        clearInterval(beepInterval);
        beepInterval = null;
    }
};

export function OrderAlertManager() {
    const [incomingOrder, setIncomingOrder] = useState<{ order: any, items: any[] } | null>(null);
    const [mounted, setMounted] = useState(false);

    // SSR guard — portal requires document to be available
    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!supabase) return;

        // Subscribe to NEW inserts in pos_orders
        const channel = supabase.channel('public:pos_orders')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'pos_orders' },
                async (payload: any) => {
                    const newOrder = payload.new;

                    // Alert on ALL new orders, unconditionally, so the kitchen always sees it
                    try {
                        // Fetch the items for this order to display in the alert
                        const { data: items } = await supabase!
                            .from('pos_order_items')
                            .select('*')
                            .eq('order_id', newOrder.id);

                        // Play synthesized sound continuously
                        playAlertSound();

                        setIncomingOrder({ order: newOrder, items: items || [] });
                    } catch (err) {
                        console.error("Failed to fetch incoming order items:", err);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase!.removeChannel(channel);
        };
    }, []); // Subscribe immediately on mount, independent of deviceId

    if (!mounted || !incomingOrder) return null;

    const handleClose = () => {
        stopAlertSound();
        setIncomingOrder(null);
    };

    // Render into document.body via portal to escape any stacking context or z-index war
    return createPortal(
        <div className="fixed inset-0 z-[99999] flex flex-col bg-red-600 animate-pulse-fast overflow-hidden">
            {/* Massive Header */}
            <div className="bg-black/40 p-8 flex items-center justify-between shadow-2xl">
                <div className="flex items-center gap-6 text-white">
                    <div className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(255,255,255,0.5)] animate-bounce">
                        <BellRing size={56} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-6xl font-black tracking-widest uppercase drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">NOUVELLE COMMANDE</h1>
                        <p className="text-3xl font-bold text-red-100 mt-2">Machine : {incomingOrder.order.source_device || 'Inconnue'}</p>
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

            {/* Massive Order Details */}
            <div className="flex-1 p-8 overflow-y-auto w-full max-w-7xl mx-auto flex flex-col gap-6">
                {incomingOrder.items.map((item, idx) => {
                    let mods = [];
                    let note = '';
                    try {
                        const parsed = JSON.parse(item.selected_modifiers || '{}');
                        if (parsed.mods) {
                            mods = parsed.mods;
                            note = parsed.note;
                        } else if (Array.isArray(parsed)) {
                            mods = parsed;
                        }
                    } catch (e) { }

                    return (
                        <div key={idx} className="bg-white rounded-3xl p-8 flex flex-col gap-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-[8px] border-black/20">
                            <div className="flex gap-6 items-center">
                                <div className="w-20 h-20 rounded-2xl bg-red-600 text-white flex items-center justify-center font-black text-5xl shadow-inner border-4 border-red-800">
                                    {item.quantity}
                                </div>
                                <h2 className="text-5xl font-black text-black leading-tight flex-1">{item.product_name}</h2>
                            </div>

                            {mods.length > 0 && (
                                <div className="bg-zinc-100 rounded-2xl p-6 space-y-3 font-bold text-3xl text-zinc-800 border-l-[12px] border-blue-500">
                                    <h3 className="text-xl text-blue-600 uppercase tracking-widest mb-2">Suppléments :</h3>
                                    {mods.map((m: any, i: number) => (
                                        <div key={i} className="flex items-center gap-4">
                                            <span className="text-blue-500 text-4xl leading-none">+</span>
                                            <span className="leading-none">{m.quantity && m.quantity > 1 ? `${m.quantity}x ` : ''}{m.name}</span>
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
                    )
                })}
            </div>

            {/* Huge Footer Action */}
            <div className="p-8 bg-black/40 flex justify-center backdrop-blur-md">
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
