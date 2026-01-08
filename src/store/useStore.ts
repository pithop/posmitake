import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { CartItem, Product, ModifierOption, Order } from '@/types';
import { supabase } from '@/lib/supabase';
import menuData from '@/data/menu_data.json';

// Cast JSON data to Product[]
const initialProducts: Product[] = menuData as unknown as Product[];

interface CartState {
    items: CartItem[];
    addToCart: (product: Product, modifiers?: ModifierOption[]) => void;
    removeFromCart: (instanceId: string) => void;
    updateQuantity: (instanceId: string, delta: number) => void;
    clearCart: () => void;
    total: number;
}

interface SystemState {
    dailyRevenue: number;
    orderHistory: Order[];
    orderIdCounter: number;
    products: Product[];
    isSyncing: boolean;
    checkout: () => Promise<void>;
    resetDaily: () => void;
    updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
    fetchProducts: () => Promise<void>;
    seedProducts: () => Promise<void>;
    initializeSync: () => void;
}

export const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            items: [],
            total: 0,
            addToCart: (product, modifiers = []) => {
                const items = get().items;
                // Check if identical item exists
                const existingItemIndex = items.findIndex(
                    (item) =>
                        item.menuItem.id === product.id &&
                        JSON.stringify(item.selectedModifiers.sort((a, b) => a.id.localeCompare(b.id))) ===
                        JSON.stringify(modifiers.sort((a, b) => a.id.localeCompare(b.id)))
                );

                const modifiersCost = modifiers.reduce((acc, mod) => acc + mod.priceAdjustment, 0);
                const unitPrice = product.price + modifiersCost;

                if (existingItemIndex > -1) {
                    const newItems = [...items];
                    newItems[existingItemIndex].quantity += 1;
                    newItems[existingItemIndex].totalPrice = newItems[existingItemIndex].quantity * unitPrice;
                    set({ items: newItems, total: get().total + unitPrice });
                } else {
                    const newItem: CartItem = {
                        instanceId: crypto.randomUUID(),
                        menuItem: product,
                        selectedModifiers: modifiers,
                        quantity: 1,
                        totalPrice: unitPrice,
                    };
                    set({ items: [...items, newItem], total: get().total + unitPrice });
                }
            },
            removeFromCart: (instanceId) => {
                const items = get().items;
                const itemToRemove = items.find((i) => i.instanceId === instanceId);
                if (!itemToRemove) return;
                set({
                    items: items.filter((i) => i.instanceId !== instanceId),
                    total: get().total - itemToRemove.totalPrice,
                });
            },
            updateQuantity: (instanceId, delta) => {
                const items = get().items;
                const index = items.findIndex((i) => i.instanceId === instanceId);
                if (index === -1) return;

                const item = items[index];
                const newQuantity = item.quantity + delta;

                if (newQuantity <= 0) {
                    // Remove item
                    get().removeFromCart(instanceId);
                } else {
                    const newItems = [...items];
                    const unitPrice = item.totalPrice / item.quantity;
                    newItems[index] = {
                        ...item,
                        quantity: newQuantity,
                        totalPrice: newQuantity * unitPrice,
                    };
                    // Recalculate total entirely to avoid drift
                    const newTotal = newItems.reduce((acc, i) => acc + i.totalPrice, 0);
                    set({ items: newItems, total: newTotal });
                }
            },
            clearCart: () => set({ items: [], total: 0 }),
        }),
        {
            name: 'mitake-cart-storage',
            storage: createJSONStorage(() => localStorage),
        }
    )
);

export const useSystemStore = create<SystemState>()(
    persist(
        (set, get) => ({
            dailyRevenue: 0,
            orderHistory: [],
            orderIdCounter: 1,
            products: initialProducts,
            isSyncing: false,

            checkout: async () => {
                const cartState = useCartStore.getState();
                if (cartState.items.length === 0) return;

                const orderId = `#${String(get().orderIdCounter).padStart(3, '0')}`;
                const newOrder: Order = {
                    id: orderId,
                    items: [...cartState.items],
                    total: cartState.total,
                    timestamp: Date.now(),
                };

                // Optimistic update (Local)
                set((state) => ({
                    dailyRevenue: state.dailyRevenue + cartState.total,
                    orderHistory: [newOrder, ...state.orderHistory],
                    orderIdCounter: state.orderIdCounter + 1,
                }));
                cartState.clearCart();

                // Sync to Supabase
                if (supabase) {
                    set({ isSyncing: true });
                    try {
                        const { error: orderError } = await supabase
                            .from('pos_orders')
                            .insert({
                                id: orderId,
                                total: newOrder.total,
                                status: 'completed',
                                created_at: new Date(newOrder.timestamp).toISOString()
                            });

                        if (orderError) throw orderError;

                        const orderItems = newOrder.items.map(item => ({
                            order_id: orderId,
                            product_id: item.menuItem.id,
                            product_name: item.menuItem.name,
                            quantity: item.quantity,
                            unit_price: item.totalPrice / item.quantity,
                            total_price: item.totalPrice,
                            selected_modifiers: item.selectedModifiers
                        }));

                        const { error: itemsError } = await supabase
                            .from('pos_order_items')
                            .insert(orderItems);

                        if (itemsError) throw itemsError;

                    } catch (error) {
                        console.error('Supabase Sync Error:', error);
                        // In a real app, we'd queue this for retry
                    } finally {
                        set({ isSyncing: false });
                    }
                }
            },

            resetDaily: () => set({ dailyRevenue: 0, orderHistory: [], orderIdCounter: 1 }),

            updateProduct: async (id, updates) => {
                // Optimistic update
                set((state) => ({
                    products: state.products.map((p) => (p.id === id ? { ...p, ...updates } : p)),
                }));

                if (supabase) {
                    set({ isSyncing: true });
                    try {
                        const { error } = await supabase
                            .from('pos_products')
                            .update(updates)
                            .eq('id', id);

                        if (error) throw error;
                    } catch (error) {
                        console.error('Supabase Product Update Error:', error);
                    } finally {
                        set({ isSyncing: false });
                    }
                }
            },

            fetchProducts: async () => {
                if (!supabase) return;

                set({ isSyncing: true });
                try {
                    const { data, error } = await supabase
                        .from('pos_products')
                        .select('*');

                    if (error) throw error;

                    if (data && data.length > 0) {
                        set({ products: data as unknown as Product[] });
                    }
                } catch (error) {
                    console.error('Supabase Fetch Error:', error);
                } finally {
                    set({ isSyncing: false });
                }
            },

            seedProducts: async () => {
                if (!supabase) return;
                set({ isSyncing: true });
                try {
                    // Use CURRENT state products instead of initialProducts to persist edits
                    const currentProducts = get().products;
                    const { error } = await supabase
                        .from('pos_products')
                        .upsert(currentProducts, { onConflict: 'id' });

                    if (error) throw error;
                    console.log('Products synced to DB successfully');
                    alert('Base de données synchronisée avec succès !');
                } catch (error) {
                    console.error('Supabase Seed Error:', error);
                    alert('Erreur lors de la synchronisation: ' + error.message);
                } finally {
                    set({ isSyncing: false });
                }
            },

            initializeSync: async () => {
                if (!supabase) return;

                // Initial fetch of Products
                get().fetchProducts();

                // Initial fetch of Orders (History)
                try {
                    const { data: orders, error: ordersError } = await supabase
                        .from('pos_orders')
                        .select('*')
                        .order('created_at', { ascending: false })
                        .limit(50); // Limit to last 50 orders for performance

                    if (ordersError) throw ordersError;

                    if (orders && orders.length > 0) {
                        // We need to fetch items for these orders
                        const orderIds = orders.map(o => o.id);
                        const { data: items, error: itemsError } = await supabase
                            .from('pos_order_items')
                            .select('*')
                            .in('order_id', orderIds);

                        if (itemsError) throw itemsError;

                        // Reconstruct Order objects
                        const reconstructedOrders: Order[] = orders.map(order => ({
                            id: order.id,
                            total: order.total,
                            timestamp: new Date(order.created_at).getTime(),
                            items: items
                                .filter(item => item.order_id === order.id)
                                .map(item => ({
                                    instanceId: crypto.randomUUID(), // Generate new instance ID for display
                                    menuItem: {
                                        id: item.product_id,
                                        name: item.product_name,
                                        price: item.unit_price, // Use stored unit price
                                        category: '', // Not strictly needed for history display
                                        description: '',
                                        image: '',
                                        available: true
                                    },
                                    quantity: item.quantity,
                                    selectedModifiers: item.selected_modifiers || [],
                                    totalPrice: item.total_price
                                }))
                        }));

                        set({ orderHistory: reconstructedOrders });
                    }
                } catch (error) {
                    console.error('Error fetching order history:', error);
                }

                // Real-time subscription for Products
                supabase
                    .channel('pos_products_changes')
                    .on(
                        'postgres_changes',
                        { event: 'UPDATE', schema: 'public', table: 'pos_products' },
                        (payload) => {
                            console.log('Real-time update received:', payload);
                            const updatedProduct = payload.new as Product;
                            set((state) => ({
                                products: state.products.map((p) =>
                                    p.id === updatedProduct.id ? { ...p, ...updatedProduct } : p
                                ),
                            }));
                        }
                    )
                    .subscribe();
            }
        }),
        {
            name: 'mitake-system-storage',
            storage: createJSONStorage(() => localStorage),
        }
    )
);
