"use client";

import { useCartStore, useSystemStore } from '@/store/useStore';
import { formatPrice } from '@/lib/utils';
import { Trash2, Minus, Plus, CreditCard, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';

import { PaymentModal } from './PaymentModal';
import { Payment } from '@/types';

export function CartSidebar() {
    const { items, total, removeFromCart, updateQuantity, clearCart } = useCartStore();
    const { checkout } = useSystemStore();
    const [isClient, setIsClient] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    const handleCheckoutClick = () => {
        if (items.length === 0) return;
        setIsPaymentModalOpen(true);
    };

    const handleConfirmPayment = async (payments: Payment[]) => {
        await checkout(payments);
        setIsPaymentModalOpen(false);
    };

    if (!isClient) return <div className="h-full w-full bg-zinc-900/50 animate-pulse" />;

    return (
        <div className="flex h-full flex-col glass-panel bg-card/95 lg:bg-card/80 backdrop-blur-xl">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5">
                <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-primary/10 rounded-xl text-primary ring-1 ring-primary/20">
                        <ShoppingBag size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-heading font-bold text-foreground tracking-tight">Current Order</h2>
                        <p className="text-muted-foreground text-xs font-medium tracking-wide">{items.length} items</p>
                    </div>
                </div>
                <button
                    onClick={clearCart}
                    disabled={items.length === 0}
                    className="text-xs font-bold text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors uppercase tracking-wider px-3 py-1.5 hover:bg-white/5 rounded-lg"
                >
                    Clear
                </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                {items.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50 space-y-6 animate-fade-in">
                        <div className="p-6 rounded-full bg-secondary/30">
                            <ShoppingBag size={48} strokeWidth={1} />
                        </div>
                        <p className="text-sm font-medium">Your cart is empty</p>
                    </div>
                ) : (
                    items.map((item, idx) => (
                        <div key={item.instanceId} className="group flex flex-col bg-secondary/30 hover:bg-secondary/50 rounded-xl p-3 transition-colors border border-white/5 animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
                            <div className="flex justify-between items-start">
                                <div className="flex-1 pr-4">
                                    <h4 className="font-bold text-foreground text-sm leading-snug">{item.menuItem.name}</h4>
                                    {item.selectedModifiers.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {item.selectedModifiers.map((m) => (
                                                <span key={m.id} className="text-[10px] font-bold text-muted-foreground bg-black/40 px-2 py-0.5 rounded border border-white/5">
                                                    {m.name}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <p className="font-bold text-foreground text-sm whitespace-nowrap font-mono">
                                    {formatPrice(item.totalPrice)}
                                </p>
                            </div>

                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                                <div className="flex items-center space-x-1 bg-black/20 rounded-lg p-1 border border-white/5">
                                    <button
                                        onClick={() => updateQuantity(item.instanceId, -1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <span className="w-8 text-center text-sm font-bold text-foreground">{item.quantity}</span>
                                    <button
                                        onClick={() => updateQuantity(item.instanceId, 1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                                <button
                                    onClick={() => removeFromCart(item.instanceId)}
                                    className="p-2 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer / Totals */}
            <div className="p-6 bg-card/50 border-t border-white/5 backdrop-blur-xl">
                <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-sm text-muted-foreground font-medium">
                        <span>Subtotal</span>
                        <span>{formatPrice(total)}</span>
                    </div>
                    <div className="flex justify-between items-end">
                        <span className="text-muted-foreground text-sm font-medium">Total</span>
                        <span className="text-3xl font-heading font-black text-foreground tracking-tight">{formatPrice(total)}</span>
                    </div>
                </div>

                <button
                    onClick={handleCheckoutClick}
                    disabled={items.length === 0}
                    className="w-full bg-primary hover:bg-red-500 disabled:bg-secondary disabled:text-muted-foreground disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl flex items-center justify-center space-x-3 text-lg shadow-lg shadow-primary/20 active:scale-[0.98] transition-all group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    <CreditCard size={20} />
                    <span>Checkout</span>
                </button>
            </div>

            <PaymentModal
                isOpen={isPaymentModalOpen}
                totalAmount={total}
                onClose={() => setIsPaymentModalOpen(false)}
                onConfirm={handleConfirmPayment}
            />
        </div>
    );
}
