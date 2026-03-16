import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { CartItem, Product, ModifierOption, Payment, OrderType } from '@/types';
import { getPowerSyncDatabase } from '@/lib/powersync/PowerSyncDb';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const pendingAcksMap = new Map<string, NodeJS.Timeout>();

export interface PosSettings {
    store_name: string;
    subtitle: string;
    address: string;
    phone: string;
    siret: string;
    footer_message_1: string;
    footer_message_2: string;
}

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
    printerName: string;
    tvaRate: number;
    settings: PosSettings | null;
    fetchSettings: () => Promise<void>;
    updateSettings: (newSettings: PosSettings) => Promise<void>;
    checkout: (payments: Payment[], orderType: OrderType, customerName: string, pickupTime: string) => Promise<void>;
    resetDaily: () => void;
    setDeviceId: (id: string) => void;
    setUiZoomLevel: (level: number) => void;
    setPrinterName: (name: string) => void;
    setTvaRate: (rate: number) => void;
    putOnHold: (orderType: OrderType, customerName: string, pickupTime: string) => Promise<void>;
    payOnHoldOrder: (orderId: string, payments: Payment[], sendSecondAlert: boolean, fullOrderData: any) => Promise<void>;
    registerPendingAck: (traceId: string) => void;
    resolveAck: (traceId: string) => void;
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

                logger.info('ORDER', 'CART_ITEM_ADDED', {
                    product_id: product.id,
                    product_name: product.name,
                    quantity: existingItemIndex > -1 ? (get().items[existingItemIndex]?.quantity || 1) + 1 : 1, // approximate log qty 
                    unit_price: unitPrice,
                    cart_total: get().total
                });
            },
            removeFromCart: (instanceId) => {
                const items = get().items;
                const itemToRemove = items.find((i) => i.instanceId === instanceId);
                if (!itemToRemove) return;
                set({
                    items: items.filter((i) => i.instanceId !== instanceId),
                    total: get().total - itemToRemove.totalPrice,
                });

                logger.info('ORDER', 'CART_ITEM_REMOVED', {
                    product_id: itemToRemove.menuItem.id,
                    product_name: itemToRemove.menuItem.name,
                    cart_total: get().total
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
            clearCart: () => {
                if (get().items.length > 0) {
                    logger.info('ORDER', 'CART_CLEARED', { previous_total: get().total });
                }
                set({ items: [], total: 0 });
            },
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
            printerName: '',
            tvaRate: 20,
            settings: null,

            setDeviceId: (id) => {
                logger.setDeviceId(id);
                set({ deviceId: id });
            },
            setUiZoomLevel: (level) => set({ uiZoomLevel: level }),
            setPrinterName: (name) => set({ printerName: name }),
            setTvaRate: (rate) => set({ tvaRate: rate }),

            registerPendingAck: (traceId: string) => {
                logger.audit('REALTIME', 'BROADCAST_SENT', { trace_id: traceId });
                const timeout = setTimeout(() => {
                    if (pendingAcksMap.has(traceId)) {
                        logger.error('REALTIME', 'ACK_TIMEOUT', { trace_id: traceId });
                        // alert removed to prevent bothering the cashier
                        pendingAcksMap.delete(traceId);
                    }
                }, 5000);
                pendingAcksMap.set(traceId, timeout);
            },

            resolveAck: (traceId: string) => {
                if (pendingAcksMap.has(traceId)) {
                    clearTimeout(pendingAcksMap.get(traceId));
                    pendingAcksMap.delete(traceId);
                    logger.info('REALTIME', 'BROADCAST_ACKED', { trace_id: traceId });
                }
            },

            fetchSettings: async () => {
                if (!supabase) return;
                try {
                    const { data, error } = await supabase
                        .from('pos_settings')
                        .select('*')
                        .eq('id', 1)
                        .single();

                    if (!error && data) {
                        set({ settings: data });
                    }
                } catch (e) {
                    console.error('[Admin] Failed to fetch settings:', e);
                }
            },

            updateSettings: async (newSettings: PosSettings) => {
                if (!supabase) return;
                try {
                    // Optimistic update
                    set({ settings: newSettings });

                    const { error } = await supabase
                        .from('pos_settings')
                        .update({
                            store_name: newSettings.store_name,
                            subtitle: newSettings.subtitle,
                            address: newSettings.address,
                            phone: newSettings.phone,
                            siret: newSettings.siret,
                            footer_message_1: newSettings.footer_message_1,
                            footer_message_2: newSettings.footer_message_2,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', 1);

                    if (error) throw error;

                    logger.audit('SYSTEM', 'SETTINGS_CHANGED', newSettings);
                } catch (e) {
                    console.error('[Admin] Failed to update settings:', e);
                    logger.error('SYSTEM', 'SETTINGS_CHANGE_FAILED', { error: e });
                    // Could revert here or just refetch
                    get().fetchSettings();
                }
            },

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
                                logger.error('ORDER', 'SYNC_ORDER_FAILED', { error: orderError, order_id: orderId });
                            } else {
                                console.log('[Checkout] Order+items written to Supabase:', orderId);
                                logger.info('ORDER', 'ORDER_COMPLETED', { order_id: orderId, total });

                                // Register ACK tracking for the Realtime broadcast that this INSERT triggers
                                get().registerPendingAck(orderId);

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

            putOnHold: async (orderType: OrderType, customerName: string, pickupTime: string) => {
                const cartState = useCartStore.getState();
                if (cartState.items.length === 0) return;

                const orderId = `#${String(get().orderIdCounter).padStart(3, '0')}`;
                const timestamp = Date.now();
                const total = cartState.total;
                const deviceId = get().deviceId;
                const createdAt = new Date(timestamp).toISOString();
                const itemsSnapshot = [...cartState.items];
                const orderTypeValue = orderType || 'sur_place';
                const custName = customerName || '';
                const pickTime = pickupTime || '';

                // Create a special payment details payload for on-hold
                const holdDetails = [{ method: 'unpaid', amount: total, alertCount: 1, isHold: true }];
                const paymentDetailsJson = JSON.stringify(holdDetails);

                try {
                    const db = getPowerSyncDatabase();

                    // === WRITE 1: Local SQLite ===
                    await db.writeTransaction(async (tx) => {
                        await tx.execute(
                            `INSERT INTO pos_orders (id, total, status, payment_method, payment_details, created_at, source_device, order_type, customer_name, pickup_time)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [orderId, total, 'pending', 'unpaid', paymentDetailsJson, createdAt, deviceId, orderTypeValue, custName, pickTime]
                        );

                        for (const item of itemsSnapshot) {
                            const metadata = { mods: item.selectedModifiers, note: item.note };
                            await tx.execute(
                                `INSERT INTO pos_order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price, selected_modifiers)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    crypto.randomUUID(),
                                    orderId,
                                    null,
                                    item.menuItem.name,
                                    item.quantity,
                                    item.totalPrice / item.quantity,
                                    item.totalPrice,
                                    JSON.stringify(metadata)
                                ]
                            );
                        }
                    });

                    // Update UI immediately
                    set((state) => ({ orderIdCounter: state.orderIdCounter + 1 }));
                    cartState.clearCart();

                    // === WRITE 2: Supabase (this will trigger the 1st kitchen alert) ===
                    if (supabase) {
                        try {
                            const itemsForAlert = itemsSnapshot.map(item => ({
                                product_name: item.menuItem.name,
                                quantity: item.quantity,
                                unit_price: item.totalPrice / item.quantity,
                                total_price: item.totalPrice,
                                selected_modifiers: { mods: item.selectedModifiers, note: item.note },
                            }));

                            await supabase.from('pos_orders').upsert({
                                id: orderId,
                                total,
                                status: 'pending',
                                payment_method: 'unpaid',
                                payment_details: holdDetails,
                                created_at: createdAt,
                                source_device: deviceId,
                                order_type: orderTypeValue,
                                customer_name: custName,
                                pickup_time: pickTime,
                                items_json: itemsForAlert,
                            });

                            logger.info('ORDER', 'ORDER_HELD', {
                                order_id: orderId,
                                total,
                                order_type: orderTypeValue,
                                customer_name: custName
                            });

                            // Register ACK tracking for this new held order
                            get().registerPendingAck(orderId);

                            // Insert items history
                            const supabaseItems = itemsSnapshot.map(item => ({
                                id: crypto.randomUUID(),
                                order_id: orderId,
                                product_name: item.menuItem.name,
                                quantity: item.quantity,
                                unit_price: item.totalPrice / item.quantity,
                                total_price: item.totalPrice,
                                selected_modifiers: { mods: item.selectedModifiers, note: item.note },
                            }));
                            await supabase.from('pos_order_items').insert(supabaseItems);

                        } catch (syncErr) {
                            console.error('[PutOnHold] Supabase sync err:', syncErr);
                        }
                    }
                } catch (error) {
                    console.error("Put On Hold Failed:", error);
                    alert("Erreur lors de la mise en attente.");
                }
            },

            payOnHoldOrder: async (orderId: string, payments: Payment[], sendSecondAlert: boolean, fullOrderData: any) => {
                const paymentMethod = payments[0]?.method || 'cash';
                const newDetails = [...payments, { alertCount: sendSecondAlert ? 2 : 1, isHold: false }];

                try {
                    const db = getPowerSyncDatabase();

                    // === UPDATE Local SQLite ===
                    await db.writeTransaction(async (tx) => {
                        await tx.execute(
                            `UPDATE pos_orders SET status = ?, payment_method = ?, payment_details = ? WHERE id = ?`,
                            ['completed', paymentMethod, JSON.stringify(newDetails), orderId]
                        );
                    });

                    // Update daily revenue logic in store
                    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
                    set((state) => ({ dailyRevenue: state.dailyRevenue + totalPaid }));

                    logger.info('ORDER', 'ORDER_PAID', {
                        order_id: orderId,
                        total_paid: totalPaid,
                        payment_method: paymentMethod,
                        sent_rappel: sendSecondAlert
                    });

                    // === UPDATE Supabase ===
                    if (supabase) {
                        await supabase.from('pos_orders')
                            .update({
                                status: 'completed',
                                payment_method: paymentMethod,
                                payment_details: newDetails
                            })
                            .eq('id', orderId);

                        // If user requested a second alert, send a specific broadcast so kitchen gets a RAPPEL
                        if (sendSecondAlert && fullOrderData) {
                            // Update rappel_at to trigger postgres_changes UPDATE on tablet
                            await supabase.from('pos_orders')
                                .update({ rappel_at: new Date().toISOString() })
                                .eq('id', orderId);
                            // Register ACK tracking for the rappel
                            get().registerPendingAck(orderId);
                        }
                    }

                } catch (error) {
                    console.error("Pay On Hold Failed:", error);
                    alert("Erreur lors de l'encaissement de la commande en attente.");
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
