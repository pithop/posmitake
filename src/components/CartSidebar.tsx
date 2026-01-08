"use client";

import { useCartStore, useSystemStore } from '@/store/useStore';
import { formatPrice } from '@/lib/utils';
import { Trash2, Minus, Plus, CreditCard, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';

export function CartSidebar() {
    const { items, total, removeFromCart, updateQuantity, clearCart } = useCartStore();
    const { checkout } = useSystemStore();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    const handleCheckout = () => {
        if (items.length === 0) return;
        if (confirm('Confirmer l\'encaissement ?')) {
            checkout();
        }
    };

    if (!isClient) return <div className="h-full w-full bg-zinc-900/50 animate-pulse" />;

    return (
        <div className="flex h-full flex-col glass-panel">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-red-500/10 rounded-lg text-red-500">
                        <ShoppingBag size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Panier</h2>
                        <p className="text-zinc-500 text-xs font-medium">{items.length} articles</p>
                    </div>
                </div>
                <button
                    onClick={clearCart}
                    disabled={items.length === 0}
                    className="text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-30 transition-colors"
                >
                    Vider
                </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {items.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4">
                        <ShoppingBag size={48} strokeWidth={1} />
                        <p className="text-sm">Votre panier est vide</p>
                    </div>
                ) : (
                    items.map((item) => (
                        <div key={item.instanceId} className="group flex flex-col bg-white/5 hover:bg-white/10 rounded-xl p-3 transition-colors border border-white/5">
                            <div className="flex justify-between items-start">
                                <div className="flex-1 pr-4">
                                    <h4 className="font-medium text-zinc-200 text-sm leading-snug">{item.menuItem.name}</h4>
                                    {item.selectedModifiers.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {item.selectedModifiers.map((m) => (
                                                <span key={m.id} className="text-[10px] font-medium text-zinc-400 bg-black/30 px-1.5 py-0.5 rounded">
                                                    {m.name}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <p className="font-bold text-white text-sm whitespace-nowrap">
                                    {formatPrice(item.totalPrice)}
                                </p>
                            </div>

                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                                <div className="flex items-center space-x-1 bg-black/40 rounded-lg p-1">
                                    <button
                                        onClick={() => updateQuantity(item.instanceId, -1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <span className="w-8 text-center text-sm font-bold text-white">{item.quantity}</span>
                                    <button
                                        onClick={() => updateQuantity(item.instanceId, 1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                                <button
                                    onClick={() => removeFromCart(item.instanceId)}
                                    className="p-2 text-zinc-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer / Totals */}
            <div className="p-6 bg-black/40 border-t border-white/5 backdrop-blur-xl">
                <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-sm text-zinc-400">
                        <span>Sous-total</span>
                        <span>{formatPrice(total)}</span>
                    </div>
                    <div className="flex justify-between items-end">
                        <span className="text-zinc-400 text-sm">Total TTC</span>
                        <span className="text-2xl font-black text-white tracking-tight">{formatPrice(total)}</span>
                    </div>
                </div>

                <button
                    onClick={handleCheckout}
                    disabled={items.length === 0}
                    className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl flex items-center justify-center space-x-3 text-lg shadow-lg shadow-red-900/20 active:scale-[0.98] transition-all"
                >
                    <CreditCard size={20} />
                    <span>Encaissement</span>
                </button>
            </div>
        </div>
    );
}
