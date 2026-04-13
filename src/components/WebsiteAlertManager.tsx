"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils";
import { useSystemStore } from '@/store/useStore';
import { logger } from "@/lib/logger";
import { Globe, X, ChevronRight, ChevronLeft, Minimize2, CheckCircle2 } from 'lucide-react';

// Audio Context
let audioCtx: AudioContext | null = null;
let beepInterval: NodeJS.Timeout | null = null;

const playWebsiteAlertSound = () => {
    if (typeof window === 'undefined') return;
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    stopWebsiteAlertSound();

    // Different sound for web orders (higher pitch, different rhythm)
    beepInterval = setInterval(() => {
        if (!audioCtx) return;
        const beep = (t: number, freq: number) => {
            const o = audioCtx!.createOscillator(), g = audioCtx!.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6, t + 0.05);
            g.gain.linearRampToValueAtTime(0, t + 0.3);
            o.connect(g); g.connect(audioCtx!.destination); o.start(t); o.stop(t + 0.3);
        };
        const now = audioCtx.currentTime;
        beep(now, 1046.50); // C6
        beep(now + 0.15, 1318.51); // E6
    }, 2000);
};

const stopWebsiteAlertSound = () => {
    if (beepInterval) { clearInterval(beepInterval); beepInterval = null; }
};

interface WebOrderAlert {
    id: string;
    total: number;
    source_device: string;
    order_type: string;
    created_at: string;
    customer_name?: string;
    delivery_address?: string;
    customer_notes?: string;
    items: any[];
}

export function WebsiteAlertManager() {
    const [alertQueue, setAlertQueue] = useState<WebOrderAlert[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [mounted, setMounted] = useState(false);
    const processedIds = useRef<Set<string>>(new Set());
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
        // ONLY accept orders from the website that are pending
        if (order.source_device !== 'website' || order.status !== 'pending') return;
        if (processedIds.current.has(order.id)) return;

        // Skip older than 10 minutes just in case
        const age = Date.now() - new Date(order.created_at).getTime();
        if (age > 600000) {
            processedIds.current.add(order.id);
            return;
        }

        processedIds.current.add(order.id);
        const items = parseItems(order);

        let delivery_address = order.delivery_address || null;
        let customer_notes = order.customer_notes || null;

        if (order.payment_details && Array.isArray(order.payment_details) && order.payment_details.length > 0) {
            const extraData = order.payment_details[0];
            if (extraData?.delivery_address) delivery_address = extraData.delivery_address;
            if (extraData?.customer_notes) customer_notes = extraData.customer_notes;
        }

        const alertOrder: WebOrderAlert = {
            id: order.id,
            total: Number(order.total),
            source_device: order.source_device,
            order_type: order.order_type || 'emporte',
            created_at: order.created_at,
            customer_name: order.customer_name || 'Client Web',
            delivery_address,
            customer_notes,
            items,
        };

        logger.info('REALTIME', 'WEBSITE_ORDER_ALERT_RECEIVED', { order_id: order.id });

        setAlertQueue(prev => {
            if (prev.some(o => o.id === order.id)) return prev;
            return [...prev, alertOrder];
        });

        setIsExpanded(true);
        playWebsiteAlertSound();
    }, [parseItems]);

    useEffect(() => {
        if (!supabase) return;

        const channel = supabase.channel('website_orders_alerts')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pos_orders' },
                (payload: any) => {
                    enqueueAlert(payload.new);
                })
            .subscribe();

        const poll = setInterval(async () => {
            try {
                const { data } = await supabase!
                    .from('pos_orders')
                    .select('*')
                    .eq('source_device', 'website')
                    .eq('status', 'pending')
                    .gt('created_at', lastPollTime.current)
                    .order('created_at', { ascending: true });

                if (data && data.length > 0) {
                    lastPollTime.current = data[data.length - 1].created_at;
                    for (const order of data) enqueueAlert(order);
                }
            } catch { }
        }, 3000); // slightly slower poll to save network

        return () => {
            supabase!.removeChannel(channel);
            clearInterval(poll);
        };
    }, [enqueueAlert]);

    const handleMinimize = useCallback(() => {
        setIsExpanded(false);
        stopWebsiteAlertSound();
    }, []);

    const handleAcknowledge = useCallback((indexToRemove: number) => {
        setAlertQueue(prev => {
            const next = [...prev];
            const removed = next.splice(indexToRemove, 1);

            if (removed.length > 0) {
                logger.audit('REALTIME', 'WEBSITE_ORDER_ACKNOWLEDGED', {
                    order_id: removed[0].id,
                    queue_size_remaining: next.length
                });
            }

            if (next.length === 0) {
                stopWebsiteAlertSound();
                setIsExpanded(false);
                setCurrentIndex(0);
            } else if (currentIndex >= next.length) {
                setCurrentIndex(Math.max(0, next.length - 1));
            }

            return next;
        });
    }, [currentIndex]);

    if (!mounted || alertQueue.length === 0) return null;

    const currentOrder = alertQueue[currentIndex];

    // THE FULL PAGE MODAL ALERTS
    if (isExpanded) {
        const isDelivery = currentOrder.order_type === 'delivery';
        
        return createPortal(
            <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-8 animate-in fade-in zoom-in duration-300 backdrop-blur-3xl ${isDelivery ? 'bg-purple-900/90' : 'bg-blue-900/90'}`}>

                {/* Visual pulse effect behind */}
                <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
                    <div className={`w-[80vw] h-[80vw] rounded-full animate-ping blur-3xl opacity-50 ${isDelivery ? 'bg-purple-500/20' : 'bg-blue-500/20'}`} />
                </div>

                {/* Main Card */}
                <div className={`relative z-10 w-full max-w-4xl border-4 rounded-3xl shadow-[0_0_100px_rgba(59,130,246,0.5)] flex flex-col overflow-hidden max-h-screen ${isDelivery ? 'bg-purple-950 border-purple-400 shadow-[0_0_100px_rgba(168,85,247,0.5)]' : 'bg-blue-950 border-blue-400'}`}>

                    {/* Header */}
                    <div className={`p-6 flex items-center justify-between text-white shrink-0 ${isDelivery ? 'bg-purple-600' : 'bg-blue-600'}`}>
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/20 rounded-2xl animate-pulse">
                                <Globe size={48} className="text-white drop-shadow-md" />
                            </div>
                            <div>
                                <h1 className="text-4xl font-black uppercase tracking-tight drop-shadow-sm flex items-center gap-3">
                                    Nouvelle Commande Web
                                </h1>
                                <p className={`${isDelivery ? 'text-purple-100' : 'text-blue-100'} font-medium text-lg mt-1`}>
                                    Client: <span className="font-bold text-white">{currentOrder.customer_name}</span> • {currentOrder.order_type.replace('_', ' ').toUpperCase()}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-4 items-center">
                            <span className="text-sm font-medium opacity-80 bg-white/10 px-4 py-2 rounded-full hidden sm:block">
                                ID: {currentOrder.id.split('-')[0]}
                            </span>
                            <button
                                onClick={handleMinimize}
                                className="w-16 h-16 flex items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20 transition-colors"
                            >
                                <Minimize2 size={32} />
                            </button>
                        </div>
                    </div>

                    {/* Content (Scrollable) */}
                    <div className="p-8 flex-1 overflow-y-auto min-h-0 bg-zinc-900">
                        {currentOrder.customer_notes && (
                            <div className="mb-6 bg-yellow-400 border-4 border-yellow-500 rounded-2xl p-6 text-black shadow-lg animate-pulse">
                                <h3 className="font-black text-2xl uppercase mb-2 flex items-center gap-2">
                                    ⚠️ NOTES CLIENT
                                </h3>
                                <p className="font-bold text-xl">{currentOrder.customer_notes}</p>
                            </div>
                        )}

                        {isDelivery && currentOrder.delivery_address && (
                            <div className="mb-6 bg-purple-900/50 border-2 border-purple-400 rounded-2xl p-6 text-white">
                                <h3 className="font-black text-xl uppercase mb-2 text-purple-300 flex items-center gap-2">
                                    📍 ADRESSE DE LIVRAISON
                                </h3>
                                <p className="font-bold text-2xl leading-tight">{currentOrder.delivery_address}</p>
                            </div>
                        )}

                        <div className="space-y-4">
                            {currentOrder.items.map((item, i) => (
                                <div key={i} className="flex gap-6 items-center p-4 bg-white/5 border border-white/10 rounded-2xl shadow-sm">
                                    <div className="w-16 h-16 flex items-center justify-center bg-zinc-800 rounded-xl font-black text-2xl text-blue-400 border border-blue-400/30">
                                        {item.quantity}x
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-3xl font-bold text-slate-100 uppercase">{item.name}</h3>
                                        {(item.options || item.modifiers || item.comment || item.note) && (
                                            <div className="mt-2 text-slate-300 bg-zinc-800/80 p-3 rounded-lg border border-white/5">
                                                {((item.options && item.options.length > 0) || (item.modifiers && item.modifiers.length > 0)) && (
                                                    <p className="font-medium text-lg flex flex-wrap gap-2">
                                                        <span className="text-emerald-400">SUPPLÉMENTS:</span>
                                                        {(item.options || item.modifiers).map((m: any, idx: number) => (
                                                            <span key={idx} className="bg-zinc-700 px-2 py-0.5 rounded text-white text-base">
                                                                {m.name} {m.price > 0 ? `(+${formatPrice(Number(m.price) || 0)})` : ''}
                                                            </span>
                                                        ))}
                                                    </p>
                                                )}
                                                {(item.comment || item.note) && (
                                                    <p className="mt-2 text-red-400 font-bold block text-lg bg-red-950/40 p-2 rounded-lg border border-red-500/20">
                                                        ⚠️ NOTES: {item.comment || item.note}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/10 flex justify-end">
                            <div className="text-right">
                                <span className="text-slate-400 uppercase font-bold tracking-widest text-sm">Total à payer sur place</span>
                                <div className="text-5xl font-black text-emerald-400">
                                    {formatPrice(currentOrder.total)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-6 bg-zinc-950 border-t border-white/10 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap shrink-0">
                        <div className="flex items-center gap-3">
                            {alertQueue.length > 1 && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                                        disabled={currentIndex === 0}
                                        className="h-16 w-16 flex items-center justify-center rounded-2xl bg-zinc-800 text-slate-300 disabled:opacity-30 border border-white/5"
                                    >
                                        <ChevronLeft size={36} />
                                    </button>
                                    <div className="h-16 flex items-center px-6 rounded-2xl bg-zinc-800 border border-white/5 text-slate-300 font-bold text-xl">
                                        {currentIndex + 1} / {alertQueue.length}
                                    </div>
                                    <button
                                        onClick={() => setCurrentIndex(i => Math.min(alertQueue.length - 1, i + 1))}
                                        disabled={currentIndex === alertQueue.length - 1}
                                        className="h-16 w-16 flex items-center justify-center rounded-2xl bg-zinc-800 text-slate-300 disabled:opacity-30 border border-white/5"
                                    >
                                        <ChevronRight size={36} />
                                    </button>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => handleAcknowledge(currentIndex)}
                            className="flex-1 sm:flex-none h-20 px-12 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-2xl uppercase tracking-widest rounded-2xl flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all active:scale-95 whitespace-nowrap"
                        >
                            <CheckCircle2 size={36} /> J'ai vu la commande !
                        </button>
                    </div>

                </div>
            </div>,
            document.body
        );
    }

    // MINIMIZED BUBBLE
    return createPortal(
        <div
            onClick={() => { setIsExpanded(true); playWebsiteAlertSound(); }}
            className="fixed top-24 right-6 sm:top-6 sm:right-6 z-[90] cursor-pointer group animate-bounce"
        >
            <div className="relative">
                <div className="absolute inset-0 bg-blue-500 rounded-2xl animate-ping opacity-75" />
                <div className="relative bg-zinc-900 border-2 border-blue-500 p-4 rounded-2xl shadow-2xl flex items-center gap-4 hover:scale-105 transition-transform">
                    <div className="bg-blue-500/20 p-2 rounded-xl text-blue-400">
                        <Globe size={28} />
                    </div>
                    <div>
                        <div className="text-white font-bold text-lg leading-tight uppercase tracking-tight">Nouvelle commande web</div>
                        <div className="text-blue-400 font-medium text-sm">
                            {alertQueue.length} en attente
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
