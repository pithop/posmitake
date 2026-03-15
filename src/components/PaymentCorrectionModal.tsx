"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatPrice } from '@/lib/utils';
import { Payment, PaymentMethodType } from '@/types';
import { X, CreditCard, Banknote, Ticket, Save, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getPowerSyncDatabase } from '@/lib/powersync/PowerSyncDb';

interface PaymentCorrectionModalProps {
    isOpen: boolean;
    orderId: string;
    totalAmount: number;
    initialPayments: Payment[];
    onClose: () => void;
    onSuccess: (updatedPayments: Payment[]) => void;
}

const PAYMENT_METHODS: { id: PaymentMethodType; label: string; icon: any; color: string }[] = [
    { id: 'card', label: 'Carte Bancaire', icon: CreditCard, color: 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20' },
    { id: 'ticket_restaurant_paper', label: 'Titre Resto', icon: Ticket, color: 'bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20' },
    { id: 'cheque_vacances', label: 'Chèque Vacances', icon: Ticket, color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20' },
    { id: 'cash', label: 'Espèces', icon: Banknote, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' },
];

export function PaymentCorrectionModal({ isOpen, orderId, totalAmount, initialPayments, onClose, onSuccess }: PaymentCorrectionModalProps) {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [inputAmount, setInputAmount] = useState<string>('');
    const [mounted, setMounted] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setPayments([...initialPayments]);
            setInputAmount('');
        }
    }, [isOpen, initialPayments]);

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, totalAmount - totalPaid);
    const changedAmount = totalPaid > totalAmount ? totalPaid - totalAmount : 0;
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

    const handleSave = async () => {
        if (!isComplete) return;
        setIsSaving(true);

        try {
            const db = getPowerSyncDatabase();
            const primaryMethod = payments[0]?.method || 'cash';

            // 1. Update SQLite
            await db.writeTransaction(async (tx) => {
                await tx.execute(
                    `UPDATE pos_orders SET payment_method = ?, payment_details = ? WHERE id = ?`,
                    [primaryMethod, JSON.stringify(payments), orderId]
                );
            });

            // 2. Update Supabase
            if (supabase) {
                await supabase.from('pos_orders')
                    .update({
                        payment_method: primaryMethod,
                        payment_details: payments
                    })
                    .eq('id', orderId);
            }

            // 3. Log Audit
            logger.audit('ORDER', 'ORDER_PAYMENT_CORRECTED', {
                order_id: orderId,
                old_payments: initialPayments,
                new_payments: payments,
                totalAmount
            });

            onSuccess(payments);
            onClose();
        } catch (error) {
            console.error("Payment correction failed:", error);
            alert("Erreur lors de la correction du paiement.");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen || !mounted || typeof document === 'undefined') return null;

    const numpadKeys = [
        '1', '2', '3',
        '4', '5', '6',
        '7', '8', '9',
        'C', '0', '.'
    ];

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-3xl animate-fade-in sm:p-4">
            <div className="w-full h-full max-w-[900px] mx-auto flex flex-col lg:flex-row gap-0 lg:gap-4 bg-background sm:rounded-[2rem] overflow-hidden shadow-2xl border border-white/5 relative">

                {/* Close Button Mobile */}
                <button onClick={onClose} className="absolute top-4 right-4 lg:hidden p-3 bg-white/10 hover:bg-white/20 rounded-full z-[110] backdrop-blur-md transition-all">
                    <X size={24} className="text-white" />
                </button>

                {/* LEFT PANE: Summary */}
                <div className="w-full lg:w-[420px] bg-secondary/30 lg:rounded-[1.5rem] border-r lg:border border-white/5 flex flex-col shrink-0 lg:h-full h-[40vh]">
                    {/* Header */}
                    <div className="p-6 pb-4 flex items-center justify-between border-b border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-500 flex items-center justify-center border border-orange-500/30">
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold tracking-tight text-white">Corriger Règlement</h2>
                                <p className="text-sm font-mono text-muted-foreground">Commande {orderId}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="hidden lg:flex p-2 hover:bg-white/10 rounded-full transition-colors bg-white/5 border border-white/5">
                            <X size={22} className="text-muted-foreground hover:text-white" />
                        </button>
                    </div>

                    {/* Totals Box */}
                    <div className="px-6 py-6 border-b border-white/5 bg-black/40">
                        <div className="flex justify-between items-center text-base text-muted-foreground mb-4">
                            <span>Total commande</span>
                            <span className="font-mono text-white text-lg">{formatPrice(totalAmount)}</span>
                        </div>
                        <div className="flex justify-between items-center text-3xl font-bold font-mono tracking-tight">
                            <span className="text-muted-foreground/80">Reste</span>
                            <span className={cn(isComplete ? "text-emerald-500" : "text-amber-500")}>
                                {formatPrice(remaining)}
                            </span>
                        </div>
                        {changedAmount > 0 && (
                            <div className="flex justify-between items-center text-3xl font-bold font-mono tracking-tight pt-3 mt-3 border-t border-white/10 animate-fade-in">
                                <span className="text-emerald-400">À rendre</span>
                                <span className="text-emerald-400">
                                    {formatPrice(changedAmount)}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Payment Lines */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 no-scrollbar bg-black/20">
                        {payments.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground/40 italic text-sm gap-2">
                                <Banknote size={32} />
                                <p>Saisissez le nouveau règlement</p>
                            </div>
                        )}
                        {payments.map((p, i) => {
                            const methodDef = PAYMENT_METHODS.find(m => m.id === p.method) || PAYMENT_METHODS[0];
                            const Icon = methodDef.icon;
                            return (
                                <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 animate-scale-up">
                                    <div className="flex items-center gap-3">
                                        <div className={cn("p-2 rounded-lg border border-white/5", methodDef.color.replace('border-', 'border-').split(' ')[0])}>
                                            <Icon size={20} className={methodDef.color.split(' ')[1]} />
                                        </div>
                                        <span className="font-medium text-white/90">{methodDef.label}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="font-mono font-bold text-lg text-white">{formatPrice(p.amount)}</span>
                                        <button
                                            onClick={() => handleRemovePayment(i)}
                                            className="p-2 text-white/30 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-all"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Valid Button */}
                    <div className="p-5 border-t border-white/5 bg-black/40">
                        <button
                            onClick={handleSave}
                            disabled={!isComplete || isSaving}
                            className={cn(
                                "w-full py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all transform active:scale-[0.98]",
                                isComplete
                                    ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_30px_rgba(16,185,129,0.3)] border border-emerald-400/50"
                                    : "bg-white/5 text-white/30 cursor-not-allowed border border-white/5"
                            )}
                        >
                            <Save size={24} />
                            {isSaving ? "Modification..." : "SAUVEGARDER CORRECTION"}
                        </button>
                    </div>
                </div>

                {/* RIGHT PANE: Numpad & Methods */}
                <div className="flex-1 flex flex-col h-[60vh] lg:h-full overflow-hidden shrink-0">
                    <div className="p-6 pb-2">
                        <div className="bg-black border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-center min-h-[120px] shadow-inner relative overflow-hidden">
                            <span className="absolute top-4 left-6 text-muted-foregroundText text-sm font-medium tracking-widest uppercase">Montant ajusté</span>
                            <span className={cn(
                                "text-5xl lg:text-7xl font-black font-mono tracking-tighter transition-all",
                                inputAmount !== '' ? "text-white scale-110" : "text-white/40"
                            )}>
                                {displayAmount.toFixed(2)}<span className="text-4xl lg:text-5xl text-white/30 ml-2">€</span>
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col lg:flex-row p-6 pt-2 gap-4 h-full min-h-0">
                        {/* NumPad */}
                        <div className="grid grid-cols-3 gap-3 w-full lg:w-[60%] flex-1">
                            {numpadKeys.map((key) => (
                                <button
                                    key={key}
                                    onClick={() => handleNumpad(key)}
                                    disabled={isComplete}
                                    className={cn(
                                        "rounded-2xl lg:rounded-3xl font-bold text-2xl lg:text-3xl transition-all border",
                                        isComplete ? "opacity-30 cursor-not-allowed border-white/5 bg-white/5" :
                                            key === 'C' ? "text-red-400 bg-red-400/10 hover:bg-red-400/20 border-red-400/20" :
                                                "bg-white/5 hover:bg-white/10 text-white border-white/10 hover:scale-[1.02] active:scale-95 shadow-lg"
                                    )}
                                >
                                    {key}
                                </button>
                            ))}
                        </div>

                        {/* Payment Methods */}
                        <div className="grid grid-cols-2 lg:flex lg:flex-col gap-3 w-full lg:w-[40%] flex-1">
                            {PAYMENT_METHODS.map((method) => {
                                const Icon = method.icon;
                                return (
                                    <button
                                        key={method.id}
                                        onClick={() => handleAddPayment(method.id)}
                                        disabled={isComplete}
                                        className={cn(
                                            "flex flex-col items-center justify-center gap-2 lg:gap-3 p-3 lg:p-0 lg:flex-1 rounded-2xl lg:rounded-3xl border transition-all hover:scale-[1.02] active:scale-95 shadow-lg",
                                            method.color,
                                            isComplete && "opacity-30 cursor-not-allowed hover:scale-100"
                                        )}
                                    >
                                        <Icon size={32} className="opacity-80 hidden lg:block" />
                                        <Icon size={24} className="opacity-80 lg:hidden" />
                                        <span className="font-bold text-sm lg:text-lg">{method.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
