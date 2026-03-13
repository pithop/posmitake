"use client";

import { useState, useEffect } from 'react';
import { Product, ModifierGroup, ModifierOption } from '@/types';
import { formatPrice, cn } from '@/lib/utils';
import { X, Check, Plus, Minus } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ModifierModalProps {
    product: Product;
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (modifiers: ModifierOption[], note: string) => void;
}

export function ModifierModal({ product, isOpen, onClose, onConfirm }: ModifierModalProps) {
    const [selectedModifiers, setSelectedModifiers] = useState<ModifierOption[]>([]);
    const [note, setNote] = useState('');

    // Reset selection when opening
    useEffect(() => {
        if (isOpen) {
            setSelectedModifiers([]);
            setNote('');
        }
    }, [isOpen]);

    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!isOpen || !mounted || typeof document === 'undefined') return null;

    const groups = product.modifierGroups || [];

    const handleOptionClick = (group: ModifierGroup, option: ModifierOption, delta: number) => {
        if (group.multiSelect) {
            // Quantity logic for multiple selections
            const existingIndex = selectedModifiers.findIndex(m => m.id === option.id);
            if (existingIndex > -1) {
                const currentQuantity = selectedModifiers[existingIndex].quantity || 1;
                const newQuantity = currentQuantity + delta;

                if (newQuantity <= 0) {
                    setSelectedModifiers(selectedModifiers.filter(m => m.id !== option.id));
                } else {
                    const newSelection = [...selectedModifiers];
                    newSelection[existingIndex] = { ...newSelection[existingIndex], quantity: newQuantity };
                    setSelectedModifiers(newSelection);
                }
            } else if (delta > 0) {
                setSelectedModifiers([...selectedModifiers, { ...option, quantity: 1 }]);
            }
        } else {
            // Radio logic (single select) - Ignore delta, just set
            if (delta < 0) return; // Don't allow minus on radio buttons
            const otherOptionsIds = group.options.map((o) => o.id);
            const newSelection = selectedModifiers.filter((m) => !otherOptionsIds.includes(m.id));
            newSelection.push({ ...option, quantity: 1 });
            setSelectedModifiers(newSelection);
        }
    };

    const getOptionQuantity = (optionId: string) => {
        const mod = selectedModifiers.find((m) => m.id === optionId);
        return mod?.quantity || 0;
    };

    // Validation: Check if all required groups have a selection
    const isValid = groups.every((group) => {
        if (!group.required) return true;
        // Check if at least one option from this group is selected
        const groupOptionIds = group.options.map((o) => o.id);
        return selectedModifiers.some((m) => groupOptionIds.includes(m.id));
    });

    const currentTotal = product.price + selectedModifiers.reduce((acc, m) => acc + (m.priceAdjustment * (m.quantity || 1)), 0);

    return createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="flex flex-col w-full max-w-2xl max-h-[90vh] bg-[#18181b] border border-white/10 rounded-3xl shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-black/20">
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">{product.name}</h2>
                        <p className="text-zinc-400 text-sm">Personnalisez votre commande</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {groups.length === 0 ? (
                        <div className="text-center text-zinc-500 py-10">
                            Aucune option disponible pour ce produit.
                        </div>
                    ) : (
                        groups.map((group) => (
                            <div key={group.id} className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-zinc-200">{group.title}</h3>
                                    {group.required && (
                                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-full uppercase tracking-wider border border-red-500/20">
                                            Obligatoire
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {group.options.map((option) => {
                                        const qty = getOptionQuantity(option.id);
                                        const selected = qty > 0;

                                        return (
                                            <div
                                                key={option.id}
                                                className={`group flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${selected
                                                    ? 'bg-red-600/10 border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.1)]'
                                                    : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700'
                                                    }`}
                                            >
                                                <button
                                                    onClick={() => handleOptionClick(group, option, 1)}
                                                    className="flex-1 flex items-center space-x-3 text-left"
                                                >
                                                    <div className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center transition-colors ${selected ? 'border-red-500 bg-red-500 text-white' : 'border-zinc-600 group-hover:border-zinc-500'
                                                        }`}>
                                                        {selected && !group.multiSelect && <Check size={12} strokeWidth={4} />}
                                                        {selected && group.multiSelect && <span className="text-xs font-bold">{qty}</span>}
                                                    </div>
                                                    <div>
                                                        <span className={cn("font-medium", selected ? "text-red-100" : "text-zinc-300")}>{option.name}</span>
                                                        {option.priceAdjustment > 0 && (
                                                            <span className={`block text-xs font-medium ${selected ? 'text-red-300' : 'text-zinc-500'}`}>
                                                                +{formatPrice(option.priceAdjustment)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>

                                                {/* Quantity Controls for Multi-Select */}
                                                {group.multiSelect && selected && (
                                                    <div className="flex items-center space-x-2 ml-4">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleOptionClick(group, option, -1); }}
                                                            className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
                                                        >
                                                            <Minus size={14} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleOptionClick(group, option, 1); }}
                                                            className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
                                                        >
                                                            <Plus size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                    {/* Notes Field */}
                    <div className="space-y-3 pt-4 border-t border-white/5">
                        <h3 className="text-lg font-bold text-zinc-200">Notes / Allergies</h3>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Sans oignons, allergie arachide..."
                            className="w-full h-24 bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/50 resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 bg-black/20 backdrop-blur-xl">
                    <button
                        onClick={() => onConfirm(selectedModifiers, note)}
                        disabled={!isValid}
                        className="w-full bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed font-bold py-4 rounded-xl flex items-center justify-center space-x-3 text-lg transition-all active:scale-[0.98] shadow-xl"
                    >
                        <span>Ajouter au panier</span>
                        <div className="w-1 h-1 rounded-full bg-zinc-400" />
                        <span>{formatPrice(currentTotal)}</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
