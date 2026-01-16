"use client";

import { useState, useEffect } from 'react';
import { formatPrice } from '@/lib/utils';
import { Payment, PaymentMethodType } from '@/types';
import { X, Plus, CreditCard, Banknote, Ticket, CheckCircle2, Trash2, Smartphone, Gift, FileSignature } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentModalProps {
    isOpen: boolean;
    totalAmount: number;
    onClose: () => void;
    onConfirm: (payments: Payment[]) => void;
}

const PAYMENT_METHODS: { id: PaymentMethodType; label: string; icon: any }[] = [
    { id: 'card', label: 'Carte Bancaire (CB)', icon: CreditCard },
    { id: 'amex', label: 'American Express', icon: CreditCard },
    { id: 'cash', label: 'Espèces', icon: Banknote },
    { id: 'ticket_restaurant_card', label: 'Titre Resto (Carte)', icon: Ticket },
    { id: 'ticket_restaurant_paper', label: 'Titre Resto (Papier)', icon: Ticket },
    { id: 'cheque_vacances', label: 'Chèque Vacances', icon: Ticket },
    { id: 'mobile_payment', label: 'Paiement Mobile (Lydia/Sunday)', icon: Smartphone },
    { id: 'check', label: 'Chèque Bancaire', icon: FileSignature },
    { id: 'gift_voucher', label: 'Chèque Cadeau', icon: Gift },
    { id: 'other', label: 'Autre', icon: CheckCircle2 },
];

export function PaymentModal({ isOpen, totalAmount, onClose, onConfirm }: PaymentModalProps) {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [activeMethod, setActiveMethod] = useState<PaymentMethodType>('card');

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setPayments([{ method: 'card', amount: totalAmount }]);
            setActiveMethod('card');
        }
    }, [isOpen, totalAmount]);

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = totalAmount - totalPaid;
    const isComplete = Math.abs(remaining) < 0.01; // Float precision check

    const handleAddPayment = () => {
        if (remaining <= 0) return;
        setPayments([...payments, { method: activeMethod, amount: remaining }]);
    };

    const handleUpdateAmount = (index: number, amount: number) => {
        const newPayments = [...payments];
        newPayments[index].amount = amount;
        setPayments(newPayments);
    };

    const handleUpdateMethod = (index: number, method: PaymentMethodType) => {
        const newPayments = [...payments];
        newPayments[index].method = method;
        setPayments(newPayments);
    };

    const handleRemovePayment = (index: number) => {
        const newPayments = [...payments];
        newPayments.splice(index, 1);
        setPayments(newPayments);
    };

    const handleConfirm = () => {
        if (!isComplete) return;
        onConfirm(payments);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-secondary/30">
                    <div>
                        <h2 className="text-xl font-heading font-bold text-foreground">Paiement</h2>
                        <p className="text-sm text-muted-foreground">Total à payer: <span className="text-foreground font-bold">{formatPrice(totalAmount)}</span></p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X size={20} className="text-muted-foreground" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 flex-1 overflow-y-auto space-y-6">

                    {/* Payment Lines */}
                    <div className="space-y-3">
                        {payments.map((payment, index) => (
                            <div key={index} className="flex items-center space-x-3 animate-fade-in">
                                <div className="flex-1">
                                    <select
                                        value={payment.method}
                                        onChange={(e) => handleUpdateMethod(index, e.target.value as PaymentMethodType)}
                                        className="w-full bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary/50 outline-none appearance-none"
                                    >
                                        {PAYMENT_METHODS.map((m) => (
                                            <option key={m.id} value={m.id} className="bg-zinc-900 text-white">
                                                {m.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-32 relative">
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={payment.amount}
                                        onChange={(e) => handleUpdateAmount(index, parseFloat(e.target.value) || 0)}
                                        className="w-full bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground text-right focus:ring-2 focus:ring-primary/50 outline-none font-mono font-bold"
                                    />
                                    <span className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">€</span>
                                </div>
                                {payments.length > 1 && (
                                    <button
                                        onClick={() => handleRemovePayment(index)}
                                        className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Add Split Button */}
                    {remaining > 0.01 && (
                        <button
                            onClick={handleAddPayment}
                            className="w-full py-3 border border-dashed border-white/20 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:border-white/40 hover:bg-white/5 transition-all flex items-center justify-center space-x-2"
                        >
                            <Plus size={16} />
                            <span>Ajouter un moyen de paiement (Reste: {formatPrice(remaining)})</span>
                        </button>
                    )}

                    {/* Summary */}
                    <div className="bg-secondary/30 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Total Payé</span>
                            <span className="font-bold text-emerald-500">{formatPrice(totalPaid)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Reste à payer</span>
                            <span className={cn("font-bold", remaining > 0.01 ? "text-destructive" : "text-muted-foreground")}>
                                {formatPrice(Math.max(0, remaining))}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 bg-secondary/30">
                    <button
                        onClick={handleConfirm}
                        disabled={!isComplete}
                        className="w-full bg-primary hover:bg-red-500 disabled:bg-secondary disabled:text-muted-foreground disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center space-x-2"
                    >
                        <CheckCircle2 size={20} />
                        <span>Confirmer le paiement</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
