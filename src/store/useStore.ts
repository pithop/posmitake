import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { CartItem, Product, ModifierOption, Payment, OrderType } from '@/types';
import { getPowerSyncDatabase } from '@/lib/powersync/PowerSyncDb';
import { supabase } from '@/lib/supabase';

interface CartState {
    items: CartItem[];
    addToCart: (product: Product, modifiers?: ModifierOption[], note?: string) => void;
    removeFromCart: (instanceId: string) => void;
    updateQuantity: (instanceId: string, delta: number) => void;
    clearCart: () => void;
    total: number;
}

interface SystemState {
    dailyRevenue: number;
    orderIdCounter: number;
    deviceId: string;
    uiZoomLevel: number;
    checkout: (payments: Payment[], orderType: OrderType, customerName: string, pickupTime: string) => Promise<void>;
    resetDaily: () => void;
    setDeviceId: (id: string) => void;
    setUiZoomLevel: (level: number) => void;
}

export const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            items: [],
            total: 0,
            addToCart: (product, modifiers = [], note = '') => {
                const items = get().items;
                // Check if identical item exists (including exact same modifiers, quantities, and note)
                const existingItemIndex = items.findIndex(
                    (item) =>
                        item.menuItem.id === product.id &&
                        (item.note || '') === note &&
                        JSON.stringify(item.selectedModifiers.map(m => ({ id: m.id, q: m.quantity || 1 })).sort((a, b) => a.id.localeCompare(b.id))) ===
                        JSON.stringify(modifiers.map(m => ({ id: m.id, q: m.quantity || 1 })).sort((a, b) => a.id.localeCompare(b.id)))
                );

                const modifiersCost = modifiers.reduce((acc, mod) => acc + (mod.priceAdjustment * (mod.quantity || 1)), 0);
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
                        note: note
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
            orderIdCounter: 1,
            deviceId: 'caisse_ordi',
            uiZoomLevel: 100,

            setDeviceId: (id) => set({ deviceId: id }),
            setUiZoomLevel: (level) => set({ uiZoomLevel: level }),

            checkout: async (payments: Payment[], orderType: OrderType, customerName: string, pickupTime: string) => {
                const cartState = useCartStore.getState();
                if (cartState.items.length === 0) return;

                const orderId = `#${String(get().orderIdCounter).padStart(3, '0')}`;
                const timestamp = Date.now();
                const total = cartState.total;
                const deviceId = get().deviceId;
                const createdAt = new Date(timestamp).toISOString();
                const paymentDetailsJson = JSON.stringify(payments);
                const itemsSnapshot = [...cartState.items];
                const orderTypeValue = orderType || 'sur_place';
                const custName = customerName || '';
                const pickTime = pickupTime || '';

                try {
                    const db = getPowerSyncDatabase();

                    // === WRITE 1: Local SQLite (PowerSync) — for local history & offline ===
                    await db.writeTransaction(async (tx) => {
                        await tx.execute(
                            `INSERT INTO pos_orders (id, total, status, payment_method, payment_details, created_at, source_device, order_type, customer_name, pickup_time)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [orderId, total, 'completed', payments[0].method, paymentDetailsJson, createdAt, deviceId, orderTypeValue, custName, pickTime]
                        );

                        for (const item of itemsSnapshot) {
                            const metadata = { mods: item.selectedModifiers, note: item.note };
                            await tx.execute(
                                `INSERT INTO pos_order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price, selected_modifiers)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    crypto.randomUUID(),
                                    orderId,
                                    null, // avoid FK constraint
                                    item.menuItem.name,
                                    item.quantity,
                                    item.totalPrice / item.quantity,
                                    item.totalPrice,
                                    JSON.stringify(metadata)
                                ]
                            );
                        }
                    });

                    // Update local state immediately so UI reflects the order
                    set((state) => ({
                        dailyRevenue: state.dailyRevenue + total,
                        orderIdCounter: state.orderIdCounter + 1,
                    }));
                    cartState.clearCart();

                    // === WRITE 2: Direct Supabase — for cross-device visibility & Realtime alerts ===
                    if (supabase) {
                        try {
                            // Build items JSON to embed in order row (instant alert data — no separate fetch needed)
                            const itemsForAlert = itemsSnapshot.map(item => ({
                                product_name: item.menuItem.name,
                                quantity: item.quantity,
                                unit_price: item.totalPrice / item.quantity,
                                total_price: item.totalPrice,
                                selected_modifiers: { mods: item.selectedModifiers, note: item.note },
                            }));

                            // Insert order row with embedded items — triggers Realtime INSERT
                            const { error: orderError } = await supabase.from('pos_orders').upsert({
                                id: orderId,
                                total,
                                status: 'completed',
                                payment_method: payments[0].method,
                                payment_details: payments,
                                created_at: createdAt,
                                source_device: deviceId,
                                order_type: orderTypeValue,
                                customer_name: custName,
                                pickup_time: pickTime,
                                items_json: itemsForAlert,
                            });

                            if (orderError) {
                                console.error('[Checkout] Supabase order write FAILED:', JSON.stringify(orderError));
                            } else {
                                console.log('[Checkout] Order+items written to Supabase:', orderId);

                                // Also insert into pos_order_items for relational queries / history detail
                                const supabaseItems = itemsSnapshot.map(item => ({
                                    id: crypto.randomUUID(),
                                    order_id: orderId,
                                    product_id: null,
                                    product_name: item.menuItem.name,
                                    quantity: item.quantity,
                                    unit_price: item.totalPrice / item.quantity,
                                    total_price: item.totalPrice,
                                    selected_modifiers: { mods: item.selectedModifiers, note: item.note },
                                }));

                                const { error: itemsError } = await supabase.from('pos_order_items').insert(supabaseItems);
                                if (itemsError) console.warn('[Checkout] pos_order_items insert failed (non-critical):', itemsError.message);
                            }
                        } catch (syncErr) {
                            console.error('[Checkout] Supabase sync exception:', syncErr);
                        }
                    } else {
                        console.warn('[Checkout] supabase client is null — check env vars');
                    }

                } catch (error) {
                    console.error("Checkout Transaction Failed:", error);
                    alert("Erreur lors de l'enregistrement de la commande. Veuillez réessayer.");
                }
            },

            resetDaily: () => set({ dailyRevenue: 0, orderIdCounter: 1 }),
        }),
        {
            name: 'mitake-system-storage-v2',
            storage: createJSONStorage(() => localStorage),
        }
    )
);
