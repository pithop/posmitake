"use client";

import { useCartStore, useSystemStore } from '@/store/useStore';
import { formatPrice } from '@/lib/utils';
import { Trash2, Minus, Plus, CreditCard, ShoppingBag, Printer, Zap, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { PaymentModal } from './PaymentModal';
import { Receipt, ReceiptData } from './Receipt';
import { Payment, OrderType } from '@/types';
import { printBrowser, printQzTray } from '@/lib/printUtils';

export function CartSidebar() {
    const { items, total, removeFromCart, updateQuantity, clearCart } = useCartStore();
    const { checkout, putOnHold, printerName, deviceId } = useSystemStore();
    const [isClient, setIsClient] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

    // Post-checkout print state
    const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
    const [showPrintOverlay, setShowPrintOverlay] = useState(false);
    const [printStatus, setPrintStatus] = useState<string | null>(null);

    useEffect(() => {
        setIsClient(true);
    }, []);

    const handleCheckoutClick = () => {
        if (items.length === 0) return;
        setIsPaymentModalOpen(true);
    };

    const handleConfirmPayment = async (payments: Payment[], orderType: OrderType, customerName: string, pickupTime: string) => {
        // Snapshot items BEFORE checkout clears them
        const itemsSnapshot = [...items];
        const totalSnapshot = total;
        const orderIdCounter = useSystemStore.getState().orderIdCounter;
        const orderId = `#${String(orderIdCounter).padStart(3, '0')}`;

        await checkout(payments, orderType, customerName, pickupTime);
        setIsPaymentModalOpen(false);

        // Build receipt data for printing
        const receiptData: ReceiptData = {
            orderId,
            items: itemsSnapshot,
            total: totalSnapshot,
            payments,
            orderType,
            customerName,
            pickupTime,
            timestamp: Date.now(),
            deviceId,
        };

        setLastReceipt(receiptData);

        // Only show print overlay on main cash register, not tablet
        if (deviceId !== 'tablette') {
            setShowPrintOverlay(true);
        }
        setPrintStatus(null);
    };

    const handlePutOnHold = async (orderType: OrderType, customerName: string, pickupTime: string) => {
        setIsPaymentModalOpen(false);
        await putOnHold(orderType, customerName, pickupTime);
    };

    const handlePrintBrowser = () => {
        setPrintStatus('Impression navigateur...');
        // Small delay to let Receipt render
        setTimeout(() => {
            printBrowser();
            setPrintStatus('✅ Envoyé à l\'impression');
        }, 200);
    };

    const handlePrintQz = async () => {
        if (!lastReceipt) return;
        setPrintStatus('Envoi vers QZ Tray...');
        const result = await printQzTray(lastReceipt, printerName);
        if (result.success) {
            setPrintStatus('✅ Imprimé via QZ Tray');
        } else {
            setPrintStatus(`❌ ${result.error}`);
        }
    };

    const closePrintOverlay = () => {
        setShowPrintOverlay(false);
        setLastReceipt(null);
        setPrintStatus(null);
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
                                {/* Price hidden for KDS */}
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
                <button
                    onClick={handleCheckoutClick}
                    disabled={items.length === 0}
                    className="w-full bg-primary hover:bg-red-500 disabled:bg-secondary disabled:text-muted-foreground disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl flex items-center justify-center space-x-3 text-lg shadow-lg shadow-primary/20 active:scale-[0.98] transition-all group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    <span>Envoyer en préparation</span>
                </button>
            </div>

            <PaymentModal
                isOpen={isPaymentModalOpen}
                totalAmount={total}
                onClose={() => setIsPaymentModalOpen(false)}
                onConfirm={handleConfirmPayment}
                onPutOnHold={handlePutOnHold}
            />

            {/* Receipt hidden component for browser printing */}
            {/* Receipt rendered as PORTAL to body — must be direct child for @media print */}
            {typeof document !== 'undefined' && lastReceipt && createPortal(
                <Receipt data={lastReceipt} />,
                document.body
            )}

            {/* POST-CHECKOUT PRINT OVERLAY */}
            {showPrintOverlay && (
                <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 max-w-sm w-full space-y-6 shadow-2xl">
                        {/* Success header */}
                        <div className="text-center">
                            <div className="text-5xl mb-3">✅</div>
                            <h2 className="text-2xl font-black text-white">Commande validée</h2>
                            <p className="text-zinc-400 mt-1 text-center font-mono">
                                Commande N° {lastReceipt?.orderId}
                            </p>
                        </div>

                        {/* Print buttons */}
                        <div className="space-y-3">
                            <button
                                onClick={handlePrintBrowser}
                                className="w-full flex items-center justify-center gap-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-xl transition-all active:scale-[0.97] border border-zinc-700"
                            >
                                <Printer size={22} />
                                <span>Imprimer (Navigateur)</span>
                            </button>

                            <button
                                onClick={handlePrintQz}
                                className="w-full flex items-center justify-center gap-3 bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 rounded-xl transition-all active:scale-[0.97] shadow-lg shadow-amber-600/20"
                            >
                                <Zap size={22} />
                                <span>Imprimer (QZ Tray)</span>
                            </button>
                        </div>

                        {/* Status */}
                        {printStatus && (
                            <div className="text-center text-sm font-medium text-zinc-300 bg-zinc-900 rounded-lg py-2 px-4">
                                {printStatus}
                            </div>
                        )}

                        {/* Close */}
                        <button
                            onClick={closePrintOverlay}
                            className="w-full flex items-center justify-center gap-2 text-zinc-500 hover:text-zinc-300 font-medium py-3 transition-colors"
                        >
                            <X size={16} />
                            Fermer
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
