"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Product, ModifierOption } from '@/types';
import { ProductCard } from './ProductCard';
import { ModifierModal } from './ModifierModal';
import { useCartStore, useSystemStore } from '@/store/useStore';
import { useStockStatus } from '@/hooks/useStockStatus';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import { useQuery } from '@powersync/react';
import { seedDatabase } from '@/lib/seeder';

// Maps stock alert IDs to product name fragments for matching
const STOCK_ID_TO_NAME: Record<string, string[]> = {
    'ramen_chashu': ['cha-shu', 'chashu'],
    'ramen_classic': ['ramen tonkotsu classic'],
    'ramen_shoyu': ['shoyu'],
    'maze_men': ['mazé men', 'maze men'],
    'kara_age': ['kara age', 'karaage'],
    'ebi_fried': ['ebi fried'],
    'gyoza_6': ['gyoza par 6'],
    'gyoza_poulet': ['gyoza poulet'],
    'korokke': ['korokke'],
    'yakitori': ['yakitori'],
    'takoyaki': ['takoyaki'],
    'harumaki': ['harumaki'],
};

export function MenuGrid() {
    const addToCart = useCartStore((state) => state.addToCart);
    const deviceId = useSystemStore((state) => state.deviceId);
    const { outOfStock } = useStockStatus();

    // Check if a product name matches any out-of-stock item
    const isProductOutOfStock = useCallback((productName: string) => {
        const lowerName = productName.toLowerCase();
        for (const [stockId, fragments] of Object.entries(STOCK_ID_TO_NAME)) {
            if (outOfStock.has(stockId)) {
                if (fragments.some(f => lowerName.includes(f))) return true;
            }
        }
        return false;
    }, [outOfStock]);

    // PowerSync Integration
    const { data: productsData = [] } = useQuery('SELECT * FROM pos_products');

    const products: Product[] = useMemo(() => {
        return productsData.map((p: any) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            category: p.category,
            description: p.description,
            image: p.image,
            available: p.available === 1 || p.available === true,
            modifierGroups: p.modifier_groups ? JSON.parse(p.modifier_groups) : [],
            tags: p.tags ? JSON.parse(p.tags) : []
        }));
    }, [productsData]);

    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState('');
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Auto-seed to guarantee Shoyu and modifiers exist without user action
    useEffect(() => {
        seedDatabase().catch(console.error);
    }, []);

    const categories = useMemo(() => {
        const cats = Array.from(new Set(products.map((p) => p.category)));
        return ['All', ...cats];
    }, [products]);

    const [isMitakeMode, setIsMitakeMode] = useState(false);

    // --- Modifier Modal State (lifted from ProductCard for reliability) ---
    const [modalProduct, setModalProduct] = useState<Product | null>(null);

    const handleOpenModal = (product: Product) => {
        setModalProduct(product);
    };

    const handleModalClose = () => {
        setModalProduct(null);
    };

    const handleModalConfirm = (modifiers: ModifierOption[], note: string) => {
        if (modalProduct) {
            addToCart(modalProduct, modifiers, note);
        }
        setModalProduct(null);
    };

    const filteredProducts = useMemo(() => {
        let filtered = products;

        // 1. Tablet Strict Override
        if (deviceId === 'tablette') {
            const tabletAllowedNames = [
                'classic',
                'cha-shu',
                'maze men',
                'mazé men',
                'shoyu'
            ];
            filtered = filtered.filter(p => {
                const lowerName = p.name.toLowerCase();
                return tabletAllowedNames.some(allowed => lowerName.includes(allowed));
            });
            // Apply search but nothing else
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                filtered = filtered.filter((p) =>
                    p.name.toLowerCase().includes(query) ||
                    p.id.includes(query)
                );
            }
            return filtered;
        }

        // 2. Filter by Mitake Mode (Tags)
        if (isMitakeMode) {
            filtered = filtered.filter(p => p.tags && p.tags.includes('mitake'));
        }

        // 3. Filter by Category
        if (selectedCategory !== 'All') {
            filtered = filtered.filter((p) => p.category === selectedCategory);
        }

        // 4. Filter by Search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter((p) =>
                p.name.toLowerCase().includes(query) ||
                p.id.includes(query)
            );
        }

        return filtered;
    }, [products, selectedCategory, searchQuery, isMitakeMode]);

    return (
        <div className="flex flex-col h-full bg-gradient-to-b from-transparent to-black/20">
            {/* Header & Filters */}
            <div className="flex-none z-10 glass-strong border-b border-white/5 lg:bg-transparent lg:backdrop-blur-none lg:border-none lg:glass-none">

                {/* Search Bar */}
                <div className="px-6 pt-2 pb-4 lg:pt-0">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Search menu..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-secondary/50 border border-white/5 rounded-2xl py-3.5 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-secondary transition-all"
                        />
                    </div>
                </div>

                {/* Mitake Toggle (Hidden on Tablet) */}
                {deviceId !== 'tablette' && (
                    <div className="px-6 flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={() => setIsMitakeMode(!isMitakeMode)}
                                className={cn(
                                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-black",
                                    isMitakeMode ? "bg-primary" : "bg-zinc-700"
                                )}
                            >
                                <span
                                    className={cn(
                                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                        isMitakeMode ? "translate-x-6" : "translate-x-1"
                                    )}
                                />
                            </button>
                            <span className={cn("text-sm font-medium transition-colors", isMitakeMode ? "text-white" : "text-zinc-500")}>
                                Mode Mitake (Ramen)
                            </span>
                        </div>
                    </div>
                )}

                {/* Categories (Hidden on Tablet) */}
                {deviceId !== 'tablette' && (
                    <div
                        ref={scrollContainerRef}
                        className="flex space-x-2 overflow-x-auto px-6 pb-4 no-scrollbar scroll-smooth mask-linear-fade"
                    >
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={cn(
                                    "px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-300 border",
                                    selectedCategory === cat
                                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-105"
                                        : "bg-secondary/30 text-muted-foreground border-transparent hover:bg-secondary hover:text-foreground hover:border-white/10"
                                )}
                            >
                                {cat === 'All' ? 'All Items' : cat}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4 lg:p-6 no-scrollbar">
                {filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground animate-fade-in">
                        <Search size={48} strokeWidth={1} className="mb-4 opacity-20" />
                        <p className="font-medium">No products found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-32 lg:pb-24">
                        {filteredProducts.map((product, idx) => (
                            <div key={product.id} className="animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
                                <ProductCard
                                    product={product}
                                    onAdd={(p, m, n) => addToCart(p, m, n)}
                                    onOpenModal={handleOpenModal}
                                    isOutOfStock={isProductOutOfStock(product.name)}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Single ModifierModal instance at MenuGrid level — lifted from ProductCard */}
            {modalProduct && (
                <ModifierModal
                    product={modalProduct}
                    isOpen={true}
                    onClose={handleModalClose}
                    onConfirm={handleModalConfirm}
                />
            )}
        </div>
    );
}
