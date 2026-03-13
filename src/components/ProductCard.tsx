"use client";

import Image from 'next/image';
import { Product, ModifierOption } from '@/types';
import { formatPrice } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { useState } from 'react';

interface ProductCardProps {
    product: Product;
    onAdd: (product: Product, modifiers?: ModifierOption[], note?: string) => void;
    // Callback to lift modal state to MenuGrid — avoids stacking context issues
    onOpenModal?: (product: Product) => void;
}

export function ProductCard({ product, onAdd, onOpenModal }: ProductCardProps) {
    const [isHovered, setIsHovered] = useState(false);

    const hasModifiers = product.modifierGroups && product.modifierGroups.length > 0;

    const handleClick = () => {
        if (hasModifiers && onOpenModal) {
            // Lift modal up to MenuGrid level
            onOpenModal(product);
        } else if (hasModifiers) {
            // Fallback: shouldn't happen if MenuGrid passes onOpenModal
            onAdd(product);
        } else {
            onAdd(product);
        }
    };

    return (
        <div
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="group relative flex flex-col overflow-hidden rounded-2xl bg-card border border-white/5 hover:border-primary/50 active:scale-[0.98] cursor-pointer touch-manipulation transition-all duration-300 shadow-lg shadow-black/20 hover:shadow-2xl hover:shadow-primary/10"
        >
            {/* Image Container */}
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary">
                {product.image ? (
                    <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        className={`object-cover transition-transform duration-700 ease-out ${isHovered ? 'scale-110' : 'scale-100'}`}
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground font-medium">
                        No Image
                    </div>
                )}

                {/* Overlay Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80" />

                {/* Price Tag (Floating) */}
                <div className="absolute top-3 right-3 glass px-3 py-1.5 rounded-full text-sm font-bold text-white shadow-lg backdrop-blur-md bg-black/40 border-white/10 group-hover:bg-primary group-hover:border-primary transition-colors">
                    {formatPrice(product.price)}
                </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col p-4 relative -mt-12">
                <h3 className="line-clamp-2 text-lg font-heading font-bold text-white leading-tight min-h-[3rem] drop-shadow-md">
                    {product.name}
                </h3>

                <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-secondary/50 px-2 py-1 rounded-md backdrop-blur-sm">
                        {product.category}
                    </span>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${isHovered ? 'bg-primary text-white scale-110' : 'bg-secondary text-muted-foreground group-hover:bg-white group-hover:text-black'}`}>
                        <Plus size={20} strokeWidth={3} />
                    </div>
                </div>
            </div>
        </div>
    );
}
