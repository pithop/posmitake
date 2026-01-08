"use client";

import { useState, useMemo, useRef, useEffect } from 'react';
import { Product } from '@/types';
import { ProductCard } from './ProductCard';
import { useCartStore, useSystemStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

export function MenuGrid() {
    const addToCart = useCartStore((state) => state.addToCart);
    const products = useSystemStore((state) => state.products);
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState('');
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const categories = useMemo(() => {
        const cats = Array.from(new Set(products.map((p) => p.category)));
        return ['All', ...cats];
    }, [products]);

    const filteredProducts = useMemo(() => {
        let filtered = products;

        if (selectedCategory !== 'All') {
            filtered = filtered.filter((p) => p.category === selectedCategory);
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter((p) =>
                p.name.toLowerCase().includes(query) ||
                p.id.includes(query)
            );
        }

        return filtered;
    }, [products, selectedCategory, searchQuery]);

    return (
        <div className="flex flex-col h-full bg-black/20">
            {/* Header & Filters */}
            <div className="flex-none z-10 bg-black/40 backdrop-blur-md border-b border-white/5">

                {/* Search Bar (Visible on mobile/tablet mainly) */}
                <div className="px-6 pt-6 pb-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                        <input
                            type="text"
                            placeholder="Rechercher un produit..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
                        />
                    </div>
                </div>

                {/* Categories */}
                <div
                    ref={scrollContainerRef}
                    className="flex space-x-2 overflow-x-auto px-6 pb-4 no-scrollbar scroll-smooth"
                >
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={cn(
                                "px-5 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 border",
                                selectedCategory === cat
                                    ? "bg-white text-black border-white shadow-lg shadow-white/10 scale-105"
                                    : "bg-zinc-900/50 text-zinc-400 border-white/5 hover:bg-zinc-800 hover:text-white hover:border-white/20"
                            )}
                        >
                            {cat === 'All' ? 'Tout le menu' : cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-6">
                {filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
                        <p>Aucun produit trouvé</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-24">
                        {filteredProducts.map((product) => (
                            <ProductCard
                                key={product.id}
                                product={product}
                                onAdd={(p, m) => addToCart(p, m)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
