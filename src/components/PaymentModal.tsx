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
    const [orderType, setOrderType] = useState<OrderType>('sur_place');
    const [customerName, setCustomerName] = useState('');
    const [pickupTime, setPickupTime] = useState('');

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setPayments([]);
            setInputAmount('');
            setOrderType('sur_place');
            setCustomerName('');
            // Default pickup time = now (HH:MM)
            const now = new Date();
            setPickupTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        }
    }, [isOpen, totalAmount]);

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, totalAmount - totalPaid);
    const isComplete = remaining <= 0.001;

    // Amount to display in the big counter
    const displayAmount = inputAmount !== '' ? (parseFloat(inputAmount) || 0) : remaining;

    const handleNumpad = (key: string) => {
        if (isComplete) return;

        if (key === 'C') {
            setInputAmount('');
        } else if (key === 'BACK') {
            setInputAmount(prev => prev.slice(0, -1));
        } else if (key === '.') {
            if (!inputAmount.includes('.')) {
                setInputAmount(prev => (prev === '' ? '0.' : prev + '.'));
            }
        } else {
            if (inputAmount.includes('.')) {
                const parts = inputAmount.split('.');
                if (parts[1].length >= 2) return;
            }
            if (parseFloat(inputAmount + key) > 10000) return;
            setInputAmount(prev => prev + key);
        }
    };

    const handleAddPayment = (methodId: PaymentMethodType) => {
        if (isComplete) return;

        const amountToAdd = displayAmount;
        if (amountToAdd <= 0) return;

        setPayments([...payments, { method: methodId, amount: amountToAdd }]);
        setInputAmount('');
    };

    const handleRemovePayment = (index: number) => {
        const newPayments = [...payments];
        newPayments.splice(index, 1);
        setPayments(newPayments);
        setInputAmount('');
    };

    const handleConfirm = () => {
        if (!isComplete) return;
        onConfirm(payments, orderType, customerName, pickupTime);
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
                <div className="w-full lg:w-[380px] xl:w-[420px] bg-secondary/30 lg:rounded-[1.5rem] border-r lg:border border-white/5 flex flex-col h-1/2 lg:h-full shrink-0">
                    {/* Header */}
                    <div className="p-6 pb-4 flex items-center justify-between">
                        <h2 className="text-2xl font-heading font-medium tracking-tight">Checkout</h2>
                        <button onClick={onClose} className="hidden lg:flex p-2 hover:bg-white/10 rounded-full transition-colors bg-white/5 border border-white/5">
                            <X size={22} className="text-muted-foreground hover:text-white" />
                        </button>
                    </div>

                    {/* Sur Place / Emporté Toggle */}
                    <div className="px-5 pb-3">
                        <div className="flex rounded-2xl overflow-hidden border border-white/10 bg-black/40">
                            <button
                                onClick={() => setOrderType('sur_place')}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-3 py-4 font-bold text-lg transition-all",
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
                                    "flex-1 flex items-center justify-center gap-3 py-4 font-bold text-lg transition-all",
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
                    <div className="px-5 pb-3 flex gap-2">
                        <input
                            type="text"
                            placeholder="👤 Nom client"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-3 text-white text-base font-bold placeholder-white/40 focus:outline-none focus:border-amber-500/50"
                        />
                        <input
                            type="time"
                            value={pickupTime}
                            onChange={(e) => setPickupTime(e.target.value)}
                            className="w-[110px] bg-black/40 border border-white/15 rounded-xl px-2 py-3 text-white text-base font-mono font-black focus:outline-none focus:border-amber-500/50 text-center"
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
                                    <span className="font-mono text-white/90 shrink-0 ml-4 font-bold">{formatPrice(item.totalPrice)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Totals */}
                    <div className="px-6 py-4 space-y-3 border-b border-white/5">
                        <div className="flex justify-between items-center text-base text-muted-foreground">
                            <span>Total commande</span>
                            <span>{formatPrice(totalAmount)}</span>
                        </div>
                        <div className="flex justify-between items-center text-3xl font-bold font-mono tracking-tight">
                            <span className="text-muted-foreground/80">Reste</span>
                            <span className={cn(isComplete ? "text-emerald-500" : "text-white")}>
                                {formatPrice(remaining)}
                            </span>
                        </div>
                    </div>

                    {/* Payment Lines */}
                    <div className="h-[160px] overflow-y-auto px-5 py-3 space-y-2 no-scrollbar bg-black/40">
                        {payments.length === 0 && (
                            <div className="h-full flex items-center justify-center text-muted-foreground/30 italic text-sm">
                                Aucun encaissement...
                            </div>
                        )}
                        {payments.map((p, i) => {
                            const methodDef = PAYMENT_METHODS.find(m => m.id === p.method) || PAYMENT_METHODS[0];
                            const Icon = methodDef.icon;
                            return (
                                <div key={i} className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-white/10 animate-scale-up">
                                    <div className="flex items-center gap-4">
                                        <div className={cn("p-3 rounded-xl border border-white/5", methodDef.color.replace('border-', 'border-').split(' ')[0])}>
                                            <Icon size={24} className={methodDef.color.split(' ')[1]} />
                                        </div>
                                        <span className="font-medium text-lg">{methodDef.label}</span>
                                    </div>
                                    <div className="flex items-center gap-5">
                                        <span className="font-mono font-bold text-xl">{formatPrice(p.amount)}</span>
                                        <button
                                            onClick={() => handleRemovePayment(i)}
                                            className="p-3 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all rounded-full"
                                        >
                                            <Trash2 size={22} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer / Confirm Action */}
                    <div className="p-4 bg-black/60 backdrop-blur-md z-10 border-t border-white/5">
                        {isComplete ? (
                            <button
                                onClick={handleConfirm}
                                className="w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xl flex items-center justify-center gap-2 transition-all animate-scale-up shadow-[0_0_40px_rgba(16,185,129,0.2)] active:scale-95"
                            >
                                <CheckCircle2 size={28} />
                                VALIDER LA COMMANDE
                            </button>
                        ) : (
                            <button
                                onClick={handlePutOnHold}
                                className="w-full py-4 rounded-xl bg-orange-500 hover:bg-orange-400 bg-opacity-20 hover:bg-opacity-30 border-2 border-orange-500/50 text-orange-400 font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_0_30px_rgba(249,115,22,0.1)]"
                            >
                                ⏳ METTRE EN ATTENTE
                            </button>
                        )}
                    </div>
                </div>

                {/* RIGHT PANE: Input & Actions */}
                <div className="w-full lg:flex-1 flex flex-col h-1/2 lg:h-full relative overflow-y-auto lg:overflow-hidden p-4 lg:p-6 lg:pl-2">

                    {/* Amount Input Screen */}
                    <div className="w-full bg-black/40 rounded-[1.5rem] p-6 lg:p-8 border border-white/10 mb-6 flex items-center justify-between shadow-inner relative overflow-hidden group shrink-0">
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
                        <div className="text-xl lg:text-2xl text-muted-foreground font-medium relative z-10">
                            Montant
                        </div>
                        <div className={cn(
                            "text-5xl lg:text-6xl font-mono font-bold tracking-tighter transition-colors flex items-center gap-2 relative z-10",
                            inputAmount !== '' ? "text-primary" : "text-white"
                        )}>
                            {displayAmount.toFixed(2)} <span className="text-3xl lg:text-4xl opacity-40 font-sans tracking-normal">€</span>
                            {inputAmount !== '' && <div className="w-2 h-12 lg:h-14 bg-primary animate-pulse rounded-full ml-2"></div>}
                        </div>
                    </div>

                    {/* Interactive Grid */}
                    <div className={cn(
                        "flex flex-col xl:flex-row gap-4 xl:gap-8 flex-1 transition-all duration-500",
                        isComplete && "opacity-20 pointer-events-none blur-sm scale-95"
                    )}>

                        {/* Numpad */}
                        <div className="w-full xl:w-[320px] grid grid-cols-3 gap-2 place-content-start shrink-0">
                            {numpadKeys.map(key => (
                                <button
                                    key={key}
                                    onClick={() => handleNumpad(key)}
                                    className={cn("aspect-square bg-secondary/50 hover:bg-white/10 active:bg-white/20 border border-white/5 rounded-2xl text-2xl lg:text-3xl font-medium transition-all flex items-center justify-center font-mono hover:scale-[1.02] active:scale-95", key === 'C' ? "text-red-400" : "")}
                                >
                                    {key}
                                </button>
                            ))}
                        </div>

                        {/* Payment Methods */}
                        <div className="w-full flex-1 grid grid-cols-2 lg:grid-cols-2 gap-2 place-content-start">
                            {PAYMENT_METHODS.map(m => {
                                const Icon = m.icon;
                                return (
                                    <button
                                        key={m.id}
                                        onClick={() => handleAddPayment(m.id)}
                                        className={cn(
                                            "aspect-square xl:aspect-auto xl:py-6 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 text-center px-2",
                                            m.color
                                        )}
                                    >
                                        <Icon size={32} className="mb-1" />
                                        <span className="font-bold text-base lg:text-lg leading-tight">{m.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Backspace floating overlay */}
                    {!isComplete && (
                        <div className="absolute top-[80px] lg:top-[100px] right-12 z-20">
                            <button
                                onClick={() => handleNumpad('BACK')}
                                disabled={inputAmount === ''}
                                className={cn(
                                    "p-6 rounded-full transition-all shadow-2xl backdrop-blur-md active:scale-90",
                                    inputAmount === '' ? "opacity-0 scale-50 pointer-events-none" : "opacity-100 scale-100 bg-white/15 hover:bg-white/25 text-white"
                                )}
                            >
                                <Delete size={32} />
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>,
        document.body
    );
}
