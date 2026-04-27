"use client";

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCartStore } from '@/store/useStore';
import { formatPrice } from '@/lib/utils';
import { Payment, PaymentMethodType, OrderType } from '@/types';
import { X, CreditCard, Banknote, Ticket, CheckCircle2, Trash2, Smartphone, Gift, FileSignature, Delete, UtensilsCrossed, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentModalProps {
    isOpen: boolean;
    totalAmount: number;
    onClose: () => void;
    onConfirm: (payments: Payment[], orderType: OrderType, customerName: string, pickupTime: string) => void;
    onPutOnHold?: (orderType: OrderType, customerName: string, pickupTime: string) => void;
}

const PAYMENT_METHODS: { id: PaymentMethodType; label: string; icon: any; color: string }[] = [
    { id: 'card', label: 'Carte Bancaire', icon: CreditCard, color: 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20' },
    { id: 'ticket_restaurant_paper', label: 'Titre Resto', icon: Ticket, color: 'bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20' },
    { id: 'cheque_vacances', label: 'Chèque Vacances', icon: Ticket, color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20' },
    { id: 'cash', label: 'Espèces', icon: Banknote, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' },
];

export function PaymentModal({ isOpen, totalAmount, onClose, onConfirm, onPutOnHold }: PaymentModalProps) {
    const { items } = useCartStore();
    const [payments, setPayments] = useState<Payment[]>([]);
    const [inputAmount, setInputAmount] = useState<string>('');
    const [mounted, setMounted] = useState(false);
    const [orderType, setOrderType] = useState<OrderType>('emporte');
    const [customerName, setCustomerName] = useState('');
    const [pickupTime, setPickupTime] = useState('');

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setPayments([]);
            setInputAmount('');
            setOrderType('emporte');
            setCustomerName('');
            setPickupTime('');
        }
    }, [isOpen, totalAmount]);

    const handleConfirm = () => {
        onConfirm([], orderType, customerName, pickupTime);
    };

    const handlePutOnHold = () => {
        if (onPutOnHold) {
            onPutOnHold(orderType, customerName, pickupTime);
        }
    };

    if (!isOpen) return null;

    const numpadKeys = [
        '1', '2', '3',
        '4', '5', '6',
        '7', '8', '9',
        'C', '0', '.'
    ];

    if (!mounted || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-3xl animate-fade-in sm:p-4">
            <div className="w-full h-full max-w-[1240px] mx-auto flex flex-col lg:flex-row gap-0 lg:gap-4 bg-background sm:rounded-[2rem] overflow-hidden shadow-2xl border border-white/5 relative">

                {/* Close Button Mobile */}
                <button onClick={onClose} className="absolute top-4 right-4 lg:hidden p-3 bg-white/10 hover:bg-white/20 rounded-full z-[110] backdrop-blur-md transition-all">
                    <X size={24} className="text-white" />
                </button>

                {/* LEFT PANE: Summary */}
                <div className="w-full lg:w-[600px] xl:w-[700px] mx-auto bg-secondary/30 lg:rounded-[1.5rem] border-r lg:border border-white/5 flex flex-col lg:h-[80vh] shrink-0">
                    <div className="p-4 lg:p-6 pb-3 lg:pb-4 flex items-center justify-between">
                        <h2 className="text-xl lg:text-2xl font-heading font-medium tracking-tight">Assigner la commande</h2>
                        <button onClick={onClose} className="hidden lg:flex p-2 hover:bg-white/10 rounded-full transition-colors bg-white/5 border border-white/5">
                            <X size={22} className="text-muted-foreground hover:text-white" />
                        </button>
                    </div>

                    {/* Sur Place / Emporté Toggle */}
                    <div className="px-4 lg:px-5 pb-2 lg:pb-3">
                        <div className="flex rounded-2xl overflow-hidden border border-white/10 bg-black/40">
                            <button
                                onClick={() => setOrderType('sur_place')}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 lg:gap-3 py-3 lg:py-4 font-bold text-base lg:text-lg transition-all",
                                    orderType === 'sur_place'
                                        ? "bg-amber-500 text-black shadow-lg"
                                        : "text-white/40 hover:text-white/70 hover:bg-white/5"
                                )}
                            >
                                <UtensilsCrossed size={22} />
                                Sur Place
                            </button>
                            <button
                                onClick={() => setOrderType('emporte')}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 lg:gap-3 py-3 lg:py-4 font-bold text-base lg:text-lg transition-all",
                                    orderType === 'emporte'
                                        ? "bg-sky-500 text-black shadow-lg"
                                        : "text-white/40 hover:text-white/70 hover:bg-white/5"
                                )}
                            >
                                <ShoppingBag size={22} />
                                Emporté
                            </button>
                        </div>
                    </div>

                    {/* Customer Name + Time */}
                    <div className="px-4 lg:px-5 pb-2 lg:pb-3 flex gap-2">
                        <input
                            type="text"
                            placeholder="👤 Nom client"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-2 lg:py-3 text-white text-base font-bold placeholder-white/40 focus:outline-none focus:border-amber-500/50"
                        />
                        <input
                            type="time"
                            value={pickupTime}
                            onChange={(e) => setPickupTime(e.target.value)}
                            className="w-[110px] bg-black/40 border border-white/15 rounded-xl px-2 py-2 lg:py-3 text-white text-base font-mono font-black focus:outline-none focus:border-amber-500/50 text-center"
                        />
                    </div>

                    {/* Order Items (Mini Ticket) */}
                    <div className="flex-1 overflow-y-auto px-5 py-3 border-b border-white/5 bg-black/20 no-scrollbar relative shadow-inner">
                        <div className="space-y-3">
                            {items.map((item) => (
                                <div key={item.instanceId} className="flex justify-between items-start text-sm">
                                    <div className="flex gap-3">
                                        <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center font-bold text-xs text-white shrink-0">
                                            {item.quantity}
                                        </div>
                                        <div>
                                            <p className="font-medium text-white/90 leading-tight">{item.menuItem.name}</p>
                                            {(item.selectedModifiers.length > 0 || item.note) && (
                                                <div className="text-muted-foreground text-[11px] mt-1 space-y-0.5">
                                                    {item.selectedModifiers.map(mod => (
                                                        <p key={mod.id}>
                                                            + {mod.quantity && mod.quantity > 1 ? `${mod.quantity}x ` : ''}{mod.name}
                                                        </p>
                                                    ))}
                                                    {item.note && (
                                                        <p className="text-yellow-500/80 italic mt-0.5 whitespace-pre-wrap">📝 {item.note}</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer / Confirm Action */}
                    <div className="p-3 lg:p-4 bg-black/60 backdrop-blur-md z-10 border-t border-white/5 space-y-3">
                        <button
                            onClick={handleConfirm}
                            className="w-full py-6 lg:py-8 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-2xl lg:text-3xl flex items-center justify-center gap-3 transition-all animate-scale-up shadow-[0_0_60px_rgba(16,185,129,0.4)] active:scale-95"
                        >
                            <CheckCircle2 size={36} />
                            ENVOYER EN CUISINE
                        </button>
                        <button
                            onClick={handlePutOnHold}
                            className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white font-bold text-sm lg:text-base flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                            ⏳ METTRE EN ATTENTE
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
