"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSystemStore } from '@/store/useStore';
import { useStockStatus } from '@/hooks/useStockStatus';
import { X, Package, CheckCircle, XCircle } from 'lucide-react';

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

let audioCtx2: AudioContext | null = null;
const playStockSound = () => {
    if (typeof window === 'undefined') return;
    try {
        if (!audioCtx2) audioCtx2 = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx2.state === 'suspended') audioCtx2.resume();
        const now = audioCtx2.currentTime;
        for (let i = 0; i < 3; i++) {
            const t = now + i * 0.3;
            const o = audioCtx2.createOscillator(), g = audioCtx2.createGain();
            o.type = 'triangle'; o.frequency.setValueAtTime(220, t);
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6, t + 0.05);
            g.gain.linearRampToValueAtTime(0, t + 0.25);
            o.connect(g); g.connect(audioCtx2.destination); o.start(t); o.stop(t + 0.25);
        }
    } catch { }
};

export function StockAlertManager() {
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [flashMsg, setFlashMsg] = useState<{ name: string; type: 'rupture' | 'retour' } | null>(null);
    const myDeviceId = useSystemStore((s) => s.deviceId);
    const { outOfStock, toggleStock } = useStockStatus();

    // ===== DRAGGABLE BUTTON STATE =====
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [initialized, setInitialized] = useState(false);
    const dragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const hasMoved = useRef(false);
    const btnRef = useRef<HTMLButtonElement>(null);

    // Initialize position (top-right area, responsive)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        // Try to load saved position
        try {
            const saved = localStorage.getItem('rupture_btn_pos');
            if (saved) {
                const p = JSON.parse(saved);
                // Validate it's on screen
                if (p.x >= 0 && p.x < window.innerWidth - 50 && p.y >= 0 && p.y < window.innerHeight - 30) {
                    setPos(p);
                    setInitialized(true);
                    return;
                }
            }
        } catch { }
        // Default position: top area, centered-right
        setPos({ x: window.innerWidth - 280, y: 12 });
        setInitialized(true);
    }, []);

    // Save position when it changes
    useEffect(() => {
        if (initialized) {
            try { localStorage.setItem('rupture_btn_pos', JSON.stringify(pos)); } catch { }
        }
    }, [pos, initialized]);

    // Mouse drag handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        dragging.current = true;
        hasMoved.current = false;
        dragOffset.current = {
            x: e.clientX - pos.x,
            y: e.clientY - pos.y,
        };
        e.preventDefault();
    }, [pos]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            hasMoved.current = true;
            setPos({
                x: Math.max(0, Math.min(window.innerWidth - 120, e.clientX - dragOffset.current.x)),
                y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y)),
            });
        };
        const handleMouseUp = () => { dragging.current = false; };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    // Touch drag handlers
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const touch = e.touches[0];
        dragging.current = true;
        hasMoved.current = false;
        dragOffset.current = {
            x: touch.clientX - pos.x,
            y: touch.clientY - pos.y,
        };
    }, [pos]);

    useEffect(() => {
        const handleTouchMove = (e: TouchEvent) => {
            if (!dragging.current) return;
            hasMoved.current = true;
            const touch = e.touches[0];
            setPos({
                x: Math.max(0, Math.min(window.innerWidth - 120, touch.clientX - dragOffset.current.x)),
                y: Math.max(0, Math.min(window.innerHeight - 40, touch.clientY - dragOffset.current.y)),
            });
        };
        const handleTouchEnd = () => { dragging.current = false; };
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('touchend', handleTouchEnd);
        return () => {
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, []);

    const handleClick = useCallback(() => {
        // Only open panel if we didn't drag
        if (!hasMoved.current) {
            setIsPanelOpen(true);
        }
    }, []);

    const handleToggle = useCallback(async (product: typeof STOCK_PRODUCTS[0]) => {
        const isCurrentlyOut = outOfStock.has(product.id);
        const newAvailable = isCurrentlyOut;

        await toggleStock(product.id, product.name, newAvailable, myDeviceId);
        playStockSound();

        setFlashMsg({
            name: product.name,
            type: newAvailable ? 'retour' : 'rupture',
        });
        setTimeout(() => setFlashMsg(null), 3000);
    }, [outOfStock, toggleStock, myDeviceId]);

    if (typeof document === 'undefined' || !initialized) return null;

    const ruptureCount = outOfStock.size;

    return createPortal(
        <>
            {/* DRAGGABLE RUPTURE BUTTON */}
            <button
                ref={btnRef}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onClick={handleClick}
                style={{
                    position: 'fixed',
                    left: pos.x,
                    top: pos.y,
                    zIndex: 9999,
                    touchAction: 'none',
                    userSelect: 'none',
                    cursor: dragging.current ? 'grabbing' : 'grab',
                }}
                className="px-4 py-2.5 bg-amber-500/90 hover:bg-amber-500 text-black font-black text-xs rounded-full shadow-lg shadow-amber-500/30 transition-colors flex items-center gap-2 backdrop-blur-lg border border-amber-400/50 select-none"
            >
                <Package size={14} />
                RUPTURE
                {ruptureCount > 0 && (
                    <span className="bg-red-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                        {ruptureCount}
                    </span>
                )}
            </button>

            {/* STOCK PANEL — toggle grid */}
            {isPanelOpen && (
                <div
                    className="fixed inset-0 z-[99990] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
                    onClick={(e) => { if (e.target === e.currentTarget) setIsPanelOpen(false); }}
                >
                    <div className="w-full max-w-2xl max-h-[85vh] bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl">
                        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-amber-500/10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-500 rounded-xl">
                                    <Package size={20} className="text-black" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-white">Rupture de Stock</h2>
                                    <p className="text-zinc-400 text-xs">Appuyez pour basculer l&apos;état du produit</p>
                                </div>
                            </div>
                            <button onClick={() => setIsPanelOpen(false)} className="p-2 hover:bg-white/10 rounded-full">
                                <X size={22} className="text-zinc-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                {STOCK_PRODUCTS.map((product) => {
                                    const isOut = outOfStock.has(product.id);
                                    return (
                                        <button
                                            key={product.id}
                                            onClick={() => handleToggle(product)}
                                            className={`relative rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 border-2 min-h-[100px] ${isOut
                                                ? 'bg-red-600/30 border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.2)]'
                                                : 'bg-zinc-900 border-zinc-700 hover:border-emerald-500/50'
                                                }`}
                                        >
                                            <span className="text-2xl">{product.emoji}</span>
                                            <span className="font-bold text-white text-sm leading-tight text-center">{product.name}</span>

                                            {isOut ? (
                                                <span className="text-[10px] font-black text-red-400 uppercase flex items-center gap-1 bg-red-500/20 px-2 py-0.5 rounded-full">
                                                    <XCircle size={11} /> RUPTURE
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1">
                                                    <CheckCircle size={11} /> En stock
                                                </span>
                                            )}

                                            {isOut && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <XCircle size={48} className="text-red-500/30" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* FLASH CONFIRMATION BANNER */}
            {flashMsg && (
                <div
                    className={`fixed top-0 left-0 right-0 z-[99999] cursor-pointer ${flashMsg.type === 'rupture' ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                    onClick={() => setFlashMsg(null)}
                >
                    <div className="max-w-xl mx-auto flex items-center gap-3 py-4 px-6">
                        {flashMsg.type === 'rupture'
                            ? <XCircle size={28} className="text-white flex-shrink-0" />
                            : <CheckCircle size={28} className="text-white flex-shrink-0" />
                        }
                        <div className="text-white">
                            <span className="font-black text-lg">
                                {flashMsg.type === 'rupture' ? '⛔ RUPTURE : ' : '✅ RETOUR : '}
                            </span>
                            <span className="font-bold text-lg">{flashMsg.name}</span>
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}
