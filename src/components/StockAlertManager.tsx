"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useSystemStore } from '@/store/useStore';
import { AlertTriangle, X, Package, CheckCircle, XCircle } from 'lucide-react';

// =========================
// Hardcoded Mitake ramen/hot food products for stock alerts
// =========================
const STOCK_PRODUCTS = [
    { id: 'ramen_chashu', name: 'Ramen Cha-Shu', emoji: '🍜' },
    { id: 'ramen_classic', name: 'Ramen Classic', emoji: '🍜' },
    { id: 'ramen_shoyu', name: 'Ramen Shoyu', emoji: '🍜' },
    { id: 'maze_men', name: 'Mazé Men', emoji: '🍜' },
    { id: 'kara_age', name: 'Kara Age', emoji: '🍗' },
    { id: 'ebi_fried', name: 'Ebi Fried', emoji: '🍤' },
    { id: 'gyoza_6', name: 'Gyoza par 6', emoji: '🥟' },
    { id: 'gyoza_poulet', name: 'Gyoza Poulet', emoji: '🥟' },
    { id: 'korokke', name: 'Korokke', emoji: '🥔' },
    { id: 'yakitori', name: 'Yakitori', emoji: '🍢' },
    { id: 'takoyaki', name: 'Takoyaki', emoji: '🐙' },
    { id: 'harumaki', name: 'Harumaki', emoji: '🌯' },
];

const BROADCAST_CHANNEL = 'stock_alerts';

// Audio — 3 low deep beeps
let audioCtx: AudioContext | null = null;
const playStockSound = () => {
    if (typeof window === 'undefined') return;
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    for (let i = 0; i < 3; i++) {
        const t = now + i * 0.3;
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(220, t);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6, t + 0.05);
        g.gain.linearRampToValueAtTime(0, t + 0.25);
        o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.25);
    }
};

interface StockAlert {
    productId: string;
    productName: string;
    type: 'rupture' | 'retour';
    fromDevice: string;
    timestamp: number;
}

export function StockAlertManager() {
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [incomingAlert, setIncomingAlert] = useState<StockAlert | null>(null);
    const [mounted, setMounted] = useState(false);
    const myDeviceId = useSystemStore((s) => s.deviceId);
    const recentAlerts = useRef<Set<string>>(new Set());

    useEffect(() => setMounted(true), []);

    // Send a stock alert via Supabase Realtime Broadcast
    const sendStockAlert = useCallback(async (product: typeof STOCK_PRODUCTS[0], type: 'rupture' | 'retour') => {
        if (!supabase) return;

        const alert: StockAlert = {
            productId: product.id,
            productName: product.name,
            type,
            fromDevice: myDeviceId,
            timestamp: Date.now(),
        };

        console.log('[Stock] Broadcasting:', type, product.name);

        // Use Supabase Realtime Broadcast (no table needed)
        const channel = supabase.channel(BROADCAST_CHANNEL);
        await channel.subscribe();
        await channel.send({
            type: 'broadcast',
            event: 'stock_change',
            payload: alert,
        });
        supabase.removeChannel(channel);

        // Flash confirmation locally
        setIncomingAlert(alert);
        playStockSound();
        setTimeout(() => setIncomingAlert(prev => prev === alert ? null : prev), 4000);
    }, [myDeviceId]);

    // Listen for stock alerts from other devices
    useEffect(() => {
        if (!supabase) return;

        const channel = supabase.channel(BROADCAST_CHANNEL)
            .on('broadcast', { event: 'stock_change' }, (payload: any) => {
                const alert = payload.payload as StockAlert;
                if (!alert) return;

                // Don't show own alerts a second time
                const key = `${alert.productId}-${alert.timestamp}`;
                if (recentAlerts.current.has(key)) return;
                recentAlerts.current.add(key);

                // Show if from another device
                if (alert.fromDevice !== myDeviceId) {
                    console.log('[Stock] Received alert:', alert.type, alert.productName, 'from', alert.fromDevice);
                    setIncomingAlert(alert);
                    playStockSound();
                }
            })
            .subscribe();

        return () => { supabase!.removeChannel(channel); };
    }, [myDeviceId]);

    if (!mounted) return null;

    const isRupture = incomingAlert?.type === 'rupture';

    return createPortal(
        <>
            {/* ===== FLOATING RUPTURE BUTTON ===== */}
            <button
                onClick={() => setIsPanelOpen(true)}
                className="fixed bottom-6 right-6 z-50 px-5 py-3 bg-amber-500/90 hover:bg-amber-500 text-black font-black text-sm rounded-full shadow-2xl shadow-amber-500/30 active:scale-95 transition-all flex items-center gap-2 backdrop-blur-lg border border-amber-400/50"
            >
                <Package size={18} />
                RUPTURE
            </button>

            {/* ===== STOCK PANEL (quick big buttons) ===== */}
            {isPanelOpen && (
                <div className="fixed inset-0 z-[99998] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-2xl max-h-[90vh] bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
                        {/* Header */}
                        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-amber-500/10">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-500 rounded-xl">
                                    <Package size={22} className="text-black" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-white">Rupture de Stock</h2>
                                    <p className="text-zinc-400 text-xs">Appuyez pour alerter toutes les machines</p>
                                </div>
                            </div>
                            <button onClick={() => setIsPanelOpen(false)} className="p-3 hover:bg-white/10 rounded-full transition-colors">
                                <X size={24} className="text-zinc-400" />
                            </button>
                        </div>

                        {/* Product Grid */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {STOCK_PRODUCTS.map((product) => (
                                    <div key={product.id} className="flex flex-col gap-1.5">
                                        {/* RUPTURE button (primary action) */}
                                        <button
                                            onClick={() => { sendStockAlert(product, 'rupture'); setIsPanelOpen(false); }}
                                            className="aspect-[4/3] rounded-2xl bg-red-600/20 hover:bg-red-600/40 border-2 border-red-500/30 hover:border-red-500 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group"
                                        >
                                            <span className="text-3xl">{product.emoji}</span>
                                            <span className="font-bold text-white text-sm leading-tight text-center px-2">{product.name}</span>
                                            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1">
                                                <XCircle size={12} /> Rupture
                                            </span>
                                        </button>
                                        {/* RETOUR button (secondary) */}
                                        <button
                                            onClick={() => { sendStockAlert(product, 'retour'); setIsPanelOpen(false); }}
                                            className="py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 text-[11px] font-bold uppercase tracking-wide flex items-center justify-center gap-1 transition-all active:scale-95"
                                        >
                                            <CheckCircle size={12} /> Retour en stock
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== INCOMING STOCK ALERT MODAL (amber/green) ===== */}
            {incomingAlert && (
                <div
                    className={`fixed top-0 left-0 right-0 z-[99999] flex items-center justify-center p-4 animate-in slide-in-from-top duration-300 ${isRupture ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                    onClick={() => setIncomingAlert(null)}
                >
                    <div className="w-full max-w-3xl flex items-center gap-4 md:gap-6 py-4 md:py-6 px-6 md:px-8">
                        <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center flex-shrink-0 ${isRupture ? 'bg-black/30' : 'bg-black/20'
                            }`}>
                            {isRupture
                                ? <AlertTriangle size={40} className="text-white animate-pulse" />
                                : <CheckCircle size={40} className="text-white" />
                            }
                        </div>
                        <div className="flex-1 text-white">
                            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-wide">
                                {isRupture ? '⛔ RUPTURE' : '✅ RETOUR EN STOCK'}
                            </h2>
                            <p className="text-xl md:text-3xl font-bold mt-1 text-white/90">
                                {incomingAlert.productName}
                            </p>
                            <p className="text-sm md:text-base font-medium mt-1 text-white/60">
                                Signalé par {incomingAlert.fromDevice} · Cliquez pour fermer
                            </p>
                        </div>
                        <button onClick={() => setIncomingAlert(null)} className="p-3 bg-black/20 hover:bg-black/40 rounded-full flex-shrink-0 transition-colors">
                            <X size={28} className="text-white" />
                        </button>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}
