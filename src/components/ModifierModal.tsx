"use client";

import { useState, useEffect } from 'react';
import { Product, ModifierGroup, ModifierOption } from '@/types';
import { formatPrice } from '@/lib/utils';
import { X, Check } from 'lucide-react';

interface ModifierModalProps {
    product: Product;
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (modifiers: ModifierOption[]) => void;
}

export function ModifierModal({ product, isOpen, onClose, onConfirm }: ModifierModalProps) {
    const [selectedModifiers, setSelectedModifiers] = useState<ModifierOption[]>([]);

    // Reset selection when opening
    useEffect(() => {
        if (isOpen) setSelectedModifiers([]);
    }, [isOpen]);

    if (!isOpen) return null;

    const groups = product.modifierGroups || [];

    const toggleOption = (group: ModifierGroup, option: ModifierOption) => {
        if (group.multiSelect) {
            // Checkbox logic
            const isSelected = selectedModifiers.some((m) => m.id === option.id);
            if (isSelected) {
                setSelectedModifiers(selectedModifiers.filter((m) => m.id !== option.id));
            } else {
                setSelectedModifiers([...selectedModifiers, option]);
            }
        } else {
            // Radio logic: remove other options from this group, add this one
            const otherOptionsIds = group.options.map((o) => o.id);
            const newSelection = selectedModifiers.filter((m) => !otherOptionsIds.includes(m.id));
            newSelection.push(option);
            setSelectedModifiers(newSelection);
        }
    };

    const isOptionSelected = (optionId: string) => selectedModifiers.some((m) => m.id === optionId);

    // Validation: Check if all required groups have a selection
    const isValid = groups.every((group) => {
        if (!group.required) return true;
        // Check if at least one option from this group is selected
        const groupOptionIds = group.options.map((o) => o.id);
        return selectedModifiers.some((m) => groupOptionIds.includes(m.id));
    });

    const currentTotal = product.price + selectedModifiers.reduce((acc, m) => acc + m.priceAdjustment, 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="flex flex-col w-full max-w-2xl max-h-[90vh] bg-[#18181b] border border-white/10 rounded-3xl shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
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
                                        const selected = isOptionSelected(option.id);
                                        return (
                                            <button
                                                key={option.id}
                                                onClick={() => toggleOption(group, option)}
                                                className={`group flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${selected
                                                        ? 'bg-red-600 border-red-500 text-white shadow-lg shadow-red-900/20'
                                                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700'
                                                    }`}
                                            >
                                                <div className="flex items-center space-x-3">
                                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${selected ? 'border-white bg-white text-red-600' : 'border-zinc-600 group-hover:border-zinc-500'
                                                        }`}>
                                                        {selected && <Check size={12} strokeWidth={4} />}
                                                    </div>
                                                    <span className="font-medium">{option.name}</span>
                                                </div>
                                                {option.priceAdjustment > 0 && (
                                                    <span className={`text-sm font-medium ${selected ? 'text-red-100' : 'text-zinc-500'}`}>
                                                        +{formatPrice(option.priceAdjustment)}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 bg-black/20 backdrop-blur-xl">
                    <button
                        onClick={() => onConfirm(selectedModifiers)}
                        disabled={!isValid}
                        className="w-full bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed font-bold py-4 rounded-xl flex items-center justify-center space-x-3 text-lg transition-all active:scale-[0.98] shadow-xl"
                    >
                        <span>Ajouter au panier</span>
                        <div className="w-1 h-1 rounded-full bg-zinc-400" />
                        <span>{formatPrice(currentTotal)}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
