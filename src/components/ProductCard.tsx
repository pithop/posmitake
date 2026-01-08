"use client";

import Image from 'next/image';
import { Product, ModifierOption } from '@/types';
import { formatPrice } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { ModifierModal } from './ModifierModal';

interface ProductCardProps {
    product: Product;
    onAdd: (product: Product, modifiers?: ModifierOption[]) => void;
}

export function ProductCard({ product, onAdd }: ProductCardProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    const hasModifiers = product.modifierGroups && product.modifierGroups.length > 0;

    const handleClick = () => {
        if (hasModifiers) {
            setIsModalOpen(true);
        } else {
            onAdd(product);
        }
    };

    const handleConfirmModifiers = (modifiers: ModifierOption[]) => {
        onAdd(product, modifiers);
        setIsModalOpen(false);
    };

    return (
        <>
            <div
                onClick={handleClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="group relative flex flex-col overflow-hidden rounded-2xl bg-[#121212] border border-white/5 hover:border-white/10 active:scale-[0.98] cursor-pointer touch-manipulation transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-black/50"
            >
                {/* Image Container */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-900">
                    {product.image ? (
                        <Image
                            src={product.image}
                            alt={product.name}
                            fill
                            className={`object-cover transition-transform duration-500 ease-out ${isHovered ? 'scale-110' : 'scale-100'}`}
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center text-zinc-700 font-medium">
                            No Image
                        </div>
                    )}

                    {/* Overlay Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60" />

                    {/* Price Tag (Floating) */}
                    <div className="absolute top-3 right-3 glass px-3 py-1.5 rounded-full text-sm font-bold text-white shadow-lg backdrop-blur-md bg-black/40 border-white/10">
                        {formatPrice(product.price)}
                    </div>
                </div>

                {/* Content */}
                <div className="flex flex-1 flex-col p-4 relative">
                    <h3 className="line-clamp-2 text-base font-semibold text-zinc-100 leading-snug min-h-[2.5rem]">
                        {product.name}
                    </h3>

                    <div className="mt-4 flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                            {product.category}
                        </span>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${isHovered ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                            <Plus size={18} strokeWidth={3} />
                        </div>
                    </div>
                </div>
            </div>

            {hasModifiers && (
                <ModifierModal
                    product={product}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onConfirm={handleConfirmModifiers}
                />
            )}
        </>
    );
}
