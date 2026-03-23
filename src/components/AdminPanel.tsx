import { useSystemStore, useCartStore } from '@/store/useStore';
import { formatPrice } from '@/lib/utils';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Settings, X, RotateCcw, LayoutDashboard, History, Package, Search, Save, Edit2, WifiOff, CloudUpload, SlidersHorizontal, Monitor, Smartphone, Clock, Printer, BellRing, Trash2, FileText } from 'lucide-react';
import { Product, Order } from '@/types';
import { cn } from '@/lib/utils';
import { useQuery, usePowerSync } from '@powersync/react';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { PaymentModal } from './PaymentModal';
import { PaymentCorrectionModal } from './PaymentCorrectionModal';
import { ReceiptFromOrder, OrderReceiptData } from './ReceiptFromOrder';
import { createPortal } from 'react-dom';

type Tab = 'dashboard' | 'onhold' | 'history' | 'products' | 'settings';

export function AdminPanel() {
    const { dailyRevenue, resetDaily, deviceId, setDeviceId, uiZoomLevel, setUiZoomLevel, printerName, setPrinterName, payOnHoldOrder, putOnHold, tvaRate, setTvaRate, settings, fetchSettings, updateSettings, resolveAck, registerPendingAck } = useSystemStore();
    const { items: cartItems, loadCart } = useCartStore();

    // PowerSync Data (local) — for products
    const { data: productsData = [] } = useQuery('SELECT * FROM pos_products');

    // Order history from SUPABASE (cross-device) instead of local-only SQLite
    const [supabaseOrders, setSupabaseOrders] = useState<any[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(false);

    const fetchOrdersFromSupabase = useCallback(async () => {
        if (!supabase) return;
        setOrdersLoading(true);
        try {
            const { data, error } = await supabase
                .from('pos_orders')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(200);
            if (!error && data) {
                setSupabaseOrders(data);
            }
        } catch (e) {
            console.error('[Admin] Failed to fetch orders from Supabase:', e);
        }
        setOrdersLoading(false);
    }, []);

    const orderHistory = useMemo(() => supabaseOrders.map((o: any) => {
        // Parse items_json for instant detail display
        let parsedItems: any[] = [];
        try {
            const raw = o.items_json;
            if (raw) {
                parsedItems = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
            }
        } catch { }

        return {
            id: o.id,
            total: o.total,
            status: o.status,
            timestamp: new Date(o.created_at).getTime(),
            items: parsedItems,
            paymentMethod: o.payment_method || 'card',
            sourceDevice: o.source_device || 'unknown',
            orderType: o.order_type || 'sur_place',
            customerName: o.customer_name || '',
            pickupTime: o.pickup_time || '',
            payments: o.payment_details ? (typeof o.payment_details === 'string' ? JSON.parse(o.payment_details) : o.payment_details) : [],
        };
    }), [supabaseOrders]);

    const products: Product[] = useMemo(() => productsData.map((p: any) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        category: p.category,
        description: p.description,
        image: p.image,
        available: p.available === 1 || p.available === true,
        modifierGroups: p.modifier_groups ? JSON.parse(p.modifier_groups).map((g: any) => ({
            id: g.id,
            title: g.name || g.title,
            required: g.required || false,
            multiSelect: g.type === 'multiSelect' || g.multiSelect === true,
            options: (g.options || []).map((o: any) => ({ id: o.id, name: o.name, priceAdjustment: o.priceAdjustment || 0 }))
        })) : [],
        tags: p.tags ? JSON.parse(p.tags) : []
    })), [productsData]);

    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [isClient, setIsClient] = useState(false);

    const handleEditPendingOrder = useCallback(async (order: any) => {
        // Auto-save current cart if it exists
        if (cartItems.length > 0) {
            const stashedId = await putOnHold('emporte', 'Panier Automatique', '', true);
            if (stashedId) {
                useCartStore.getState().stashCurrentCart(stashedId);
            }
        }

        // Reconstruct CartItems from the pending order
        const mappedItems = order.items.map((item: any) => {
            // Try to find the actual product from the local menu, if not create a fallback
            const productMatch = products.find((p: any) => p.name === (item.product_name || item.name)) || {
                id: item.product_id || 'unknown',
                name: item.product_name || item.name || 'Produit Inconnu',
                price: item.unit_price || item.price || 0,
                description: '',
                category_id: '',
                available: true,
                image: '',
                modifierGroups: [],
                tags: []
            };

            // Parse modifiers
            let mods: any[] = [];
            let note = '';
            try {
                if (item.options && Array.isArray(item.options)) {
                    mods = item.options.map((m: any) => ({
                        id: m.id || m.name,
                        name: m.name,
                        priceAdjustment: m.price || 0,
                        quantity: m.quantity || 1
                    }));
                    note = item.comment || '';
                } else {
                    const sm = item.selected_modifiers || item.modifiers;
                    if (sm) {
                        const parsed = typeof sm === 'string' ? JSON.parse(sm) : sm;
                        if (Array.isArray(parsed)) {
                            mods = parsed;
                        } else {
                            mods = parsed.mods || [];
                            note = parsed.note || '';
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to parse modifiers for item reconstruction", e);
            }

            return {
                instanceId: crypto.randomUUID(),
                menuItem: productMatch,
                selectedModifiers: mods,
                quantity: item.quantity,
                totalPrice: item.total_price || ((item.unit_price || item.price || 0) * item.quantity),
                note: note
            };
        });

        // Load into the cart
        loadCart(order.id, mappedItems, order.items);

        // Close AdminPanel and return to checkout
        setIsOpen(false);
    }, [cartItems, putOnHold, products, loadCart]);

    // Fetch settings on mount
    useEffect(() => {
        if (isOpen) {
            fetchSettings();
        }
    }, [isOpen, fetchSettings]);

    // Ticket settings local state
    const [localSettings, setLocalSettings] = useState<any>(null);

    useEffect(() => {
        if (settings && !localSettings) {
            setLocalSettings(settings);
        }
    }, [settings, localSettings]);

    // Product Management State
    const [productSearch, setProductSearch] = useState('');
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [expandedOrderItems, setExpandedOrderItems] = useState<any[]>([]);

    // On-hold / En Attente state
    const [onHoldPaymentOrder, setOnHoldPaymentOrder] = useState<any | null>(null);

    // Print state
    const [printReceipt, setPrintReceipt] = useState<OrderReceiptData | null>(null);
    const [printFacture, setPrintFacture] = useState<OrderReceiptData | null>(null);
    const [printSummary, setPrintSummary] = useState<any | null>(null);

    // Payment Correction state
    const [orderToCorrect, setOrderToCorrect] = useState<any | null>(null);

    const [selectedHistoryDate, setSelectedHistoryDate] = useState(() => {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    });
    const powersync = usePowerSync();

    // Fetch orders when panel opens or tab changes to history/onhold
    useEffect(() => {
        if (isOpen && (activeTab === 'history' || activeTab === 'onhold')) {
            fetchOrdersFromSupabase();
        }
    }, [isOpen, activeTab, fetchOrdersFromSupabase]);

    const filteredOrderHistory = useMemo(() => {
        if (!selectedHistoryDate) return orderHistory;
        return orderHistory.filter(o => {
            const orderDate = new Date(o.timestamp);
            const offset = orderDate.getTimezoneOffset() * 60000;
            const localDateStr = new Date(orderDate.getTime() - offset).toISOString().split('T')[0];
            return localDateStr === selectedHistoryDate && o.status !== 'pending';
        });
    }, [orderHistory, selectedHistoryDate]);

    const pendingOrders = useMemo(() => {
        const todayStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        return orderHistory.filter(o => {
            if (o.status !== 'pending') return false;
            const orderDate = new Date(o.timestamp);
            const offset = orderDate.getTimezoneOffset() * 60000;
            const localDateStr = new Date(orderDate.getTime() - offset).toISOString().split('T')[0];
            return localDateStr === todayStr;
        }).sort((a, b) => b.timestamp - a.timestamp);
    }, [orderHistory]);

    const todayMetrics = useMemo(() => {
        const todayStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const todaysOrders = orderHistory.filter(o => {
            const orderDate = new Date(o.timestamp);
            const offset = orderDate.getTimezoneOffset() * 60000;
            const localDateStr = new Date(orderDate.getTime() - offset).toISOString().split('T')[0];
            return localDateStr === todayStr && o.status !== 'pending' && o.status !== 'cancelled';
        });

        let revenue = 0;
        let count = todaysOrders.length;
        let byMethod = { carte: 0, espece: 0, ticket_resto: 0, cheque_vacance: 0 };

        todaysOrders.forEach(o => {
            revenue += o.total;
            const p = o.payments && o.payments.length > 0 ? o.payments[0].method : o.paymentMethod;
            const method = String(p || 'cash').toLowerCase();

            if (method.includes('card') || method.includes('amex') || method.includes('carte') || method.includes('mobile')) {
                byMethod.carte += o.total;
            } else if (method.includes('ticket')) {
                byMethod.ticket_resto += o.total;
            } else if (method.includes('cheque_vacances') || method.includes('vacance')) {
                byMethod.cheque_vacance += o.total;
            } else {
                byMethod.espece += o.total;
            }
        });

        return { revenue, count, byMethod, todaysOrders };
    }, [orderHistory]);

    const handleDeletePendingOrder = async (orderId: string) => {
        if (!confirm(`Voulez-vous vraiment supprimer la commande en attente ${orderId} ?`)) return;
        try {
            // Log the action before deleting
            logger.audit('ORDER', 'PENDING_ORDER_DELETED', { order_id: orderId });
            // Delete from SQLite
            await powersync.execute('DELETE FROM pos_orders WHERE id = ?', [orderId]);
            await powersync.execute('DELETE FROM pos_order_items WHERE order_id = ?', [orderId]);
            // Delete from Supabase
            if (supabase) {
                await supabase.from('pos_order_items').delete().eq('order_id', orderId);
                await supabase.from('pos_orders').delete().eq('id', orderId);
            }
            fetchOrdersFromSupabase();
        } catch (err) {
            console.error('[Delete] Erreur:', err);
            alert('Erreur lors de la suppression de la commande.');
        }
    };

    useEffect(() => {
        setIsClient(true);
    }, []);

    // Global listener for ACK_ORDER from kitchen tablet
    useEffect(() => {
        if (!supabase) return;
        const channel = supabase.channel('kitchen_alerts_ack')
            .on('broadcast', { event: 'ACK_ORDER' }, (payload: any) => {
                if (payload.payload?.traceId) {
                    resolveAck(payload.payload.traceId);
                }
            })
            .subscribe();

        return () => {
            if (supabase) supabase.removeChannel(channel);
        };
    }, [resolveAck]);

    useEffect(() => {
        if (expandedOrderId && supabase) {
            supabase.from('pos_order_items').select('*').eq('order_id', expandedOrderId)
                .then(({ data }) => setExpandedOrderItems(data || []));
        }
    }, [expandedOrderId]);

    const updateProduct = async (id: string, updates: Partial<Product>) => {
        // 1. Write to local PowerSync (instant UI update)
        await powersync.execute('UPDATE pos_products SET name = ?, price = ? WHERE id = ?',
            [updates.name, updates.price, id]);

        // 2. Write to Supabase (persistent, syncs to all devices)
        if (supabase) {
            const { error } = await supabase.from('pos_products').update({
                name: updates.name,
                price: updates.price,
            }).eq('id', id);

            if (error) {
                console.error('[Admin] Supabase product update failed:', error);
            } else {
                console.log('[Admin] Product updated in Supabase:', id, updates.name, updates.price);
            }
        }
    };

    if (!isClient) return null;

    const handleReset = () => {
        if (confirm('ATTENTION: Cela va effacer le chiffre d\'affaires local (affichage seulement). Continuer ?')) {
            resetDaily();
        }
    };

    const handlePrintDailySummary = () => {
        const { todaysOrders, revenue, byMethod, count } = todayMetrics;
        if (count === 0) {
            alert("Aucune commande aujourd'hui.");
            return;
        }
        logger.audit('PRINT', 'DAILY_SUMMARY_PRINTED', { revenue, count });
        setPrintSummary({
            date: new Date().toISOString(),
            revenue,
            count,
            byMethod
        });
        setTimeout(() => window.print(), 300);
    };

    const handleSaveProduct = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProduct) return;
        updateProduct(editingProduct.id, {
            name: editingProduct.name,
            price: Number(editingProduct.price),
        });
        setEditingProduct(null);
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.id.includes(productSearch)
    );


    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 left-6 px-5 py-3 bg-black/40 backdrop-blur-xl border border-white/10 text-white rounded-full hover:bg-white/10 hover:scale-105 active:scale-95 transition-all z-50 shadow-2xl flex items-center space-x-3 group"
            >
                <div className="p-1.5 bg-zinc-800 rounded-full group-hover:bg-red-600 transition-colors">
                    <Settings size={16} className="text-zinc-400 group-hover:text-white transition-colors" />
                </div>
                <span className="font-medium text-sm tracking-wide pr-1">ADMIN</span>
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-5xl h-[85vh] bg-[#09090b] border border-zinc-800 rounded-3xl shadow-2xl flex overflow-hidden">

                        {/* Sidebar */}
                        <div className="w-64 bg-zinc-900/50 border-r border-zinc-800 flex flex-col p-4">
                            <div className="mb-8 px-2">
                                <h2 className="text-xl font-bold text-white tracking-tight">Admin Panel</h2>
                                <p className="text-zinc-500 text-xs">Mitake POS v2.0</p>
                            </div>

                            <nav className="space-y-2 flex-1">
                                {(['dashboard', 'onhold', 'history', 'products', 'settings'] as Tab[]).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={cn(
                                            "w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium",
                                            activeTab === tab ? "bg-white text-black" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                                        )}
                                    >
                                        {tab === 'dashboard' && <LayoutDashboard size={18} />}
                                        {tab === 'onhold' && <Clock size={18} />}
                                        {tab === 'history' && <History size={18} />}
                                        {tab === 'products' && <Package size={18} />}
                                        {tab === 'settings' && <SlidersHorizontal size={18} />}
                                        <span className="capitalize">{tab === 'settings' ? 'paramètres' : tab === 'onhold' ? 'en attente' : tab}</span>
                                    </button>
                                ))}
                            </nav>

                            <div className="mt-auto pt-4 border-t border-zinc-800">
                                <button onClick={() => setIsOpen(false)} className="w-full flex items-center justify-center space-x-2 p-3 text-zinc-400 hover:text-white transition-colors">
                                    <X size={18} />
                                    <span>Fermer</span>
                                </button>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-hidden flex flex-col bg-black/20">

                            {/* Dashboard Tab */}
                            {activeTab === 'dashboard' && (
                                <div className="p-8 overflow-y-auto h-full">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-2xl font-bold text-white">Aperçu de la journée</h3>
                                        <button
                                            onClick={handlePrintDailySummary}
                                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition-colors font-bold shadow-lg shadow-blue-600/20"
                                        >
                                            <Printer size={18} /> Imprimer Bilan Journée
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                                            <p className="text-zinc-400 text-sm font-medium">Chiffre d'Affaires</p>
                                            <p className="text-4xl font-bold text-green-500 mt-2">{formatPrice(todayMetrics.revenue)}</p>
                                        </div>
                                        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                                            <p className="text-zinc-400 text-sm font-medium">Commandes</p>
                                            <p className="text-4xl font-bold text-white mt-2">{todayMetrics.count}</p>
                                        </div>
                                        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                                            <p className="text-zinc-400 text-sm font-medium">Panier Moyen</p>
                                            <p className="text-4xl font-bold text-blue-500 mt-2">
                                                {todayMetrics.count > 0 ? formatPrice(todayMetrics.revenue / todayMetrics.count) : formatPrice(0)}
                                            </p>
                                        </div>
                                    </div>

                                    <h4 className="text-xl font-bold text-white mb-4">Répartition des Paiements</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex justify-between items-center">
                                            <span className="text-zinc-400 font-medium">Carte Bancaire</span>
                                            <span className="text-white font-bold">{formatPrice(todayMetrics.byMethod.carte)}</span>
                                        </div>
                                        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex justify-between items-center">
                                            <span className="text-zinc-400 font-medium">Espèces</span>
                                            <span className="text-white font-bold">{formatPrice(todayMetrics.byMethod.espece)}</span>
                                        </div>
                                        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex justify-between items-center">
                                            <span className="text-zinc-400 font-medium">Ticket Resto</span>
                                            <span className="text-white font-bold">{formatPrice(todayMetrics.byMethod.ticket_resto)}</span>
                                        </div>
                                        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex justify-between items-center">
                                            <span className="text-zinc-400 font-medium">Chèque Vacances</span>
                                            <span className="text-white font-bold">{formatPrice(todayMetrics.byMethod.cheque_vacance)}</span>
                                        </div>
                                    </div>

                                    <div className="bg-red-950/10 border border-red-900/20 p-6 rounded-2xl">
                                        <h4 className="text-red-500 font-bold mb-2">Zone de Danger</h4>
                                        <p className="text-zinc-400 text-sm mb-4">Réinitialiser l'affichage locale.</p>
                                        <button
                                            onClick={handleReset}
                                            className="flex items-center space-x-2 bg-red-900/20 text-red-500 hover:bg-red-900/40 px-4 py-2 rounded-lg transition-colors border border-red-900/30"
                                        >
                                            <RotateCcw size={16} />
                                            <span>Reset Journée</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* En Attente (On Hold) Tab */}
                            {activeTab === 'onhold' && (
                                <div className="flex flex-col h-full">
                                    <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                                        <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                                            <Clock className="text-orange-500" /> Commandes en Attente
                                        </h3>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                        {pendingOrders.length === 0 ? (
                                            <div className="text-center text-zinc-500 py-10">Aucune commande en attente.</div>
                                        ) : (
                                            pendingOrders.map(order => {
                                                const alertCount = order.payments?.[0]?.alertCount || 1;
                                                return (
                                                    <div key={order.id} className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-between items-center transition-all hover:bg-zinc-800/30">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-3 mb-1 flex-wrap">
                                                                <span className="font-mono font-bold text-white bg-zinc-800 px-2 py-1 rounded">{order.id}</span>
                                                                <span className="text-zinc-400 text-sm font-mono">{new Date(order.timestamp).toLocaleTimeString()}</span>
                                                                <span className={cn(
                                                                    "text-xs font-bold px-2 py-1 rounded",
                                                                    order.orderType === 'emporte' ? "bg-sky-500/20 text-sky-400" : "bg-amber-500/20 text-amber-400"
                                                                )}>
                                                                    {order.orderType === 'emporte' ? '📦 Emporté' : '🍽️ Sur Place'}
                                                                </span>
                                                                {order.customerName && (
                                                                    <span className="text-xs font-bold text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded">👤 {order.customerName}</span>
                                                                )}
                                                            </div>
                                                            <div
                                                                className={`text-sm mt-2 cursor-pointer transition-all hover:text-zinc-300 ${expandedOrderId === order.id ? 'text-zinc-300 bg-zinc-800/50 p-3 rounded-lg' : 'text-zinc-400 line-clamp-2'}`}
                                                                onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                                                title={expandedOrderId === order.id ? "Réduire" : "Cliquer pour voir tous les détails"}
                                                            >
                                                                {expandedOrderId === order.id ? (
                                                                    <div className="flex flex-col gap-2">
                                                                        {order.items.map((item: any, i: number) => {
                                                                            let mods: string[] = [];
                                                                            try {
                                                                                if (item.options && Array.isArray(item.options)) {
                                                                                    mods = item.options.map((m: any) => m.name);
                                                                                } else {
                                                                                    const sm = item.selected_modifiers || item.modifiers;
                                                                                    if (sm) {
                                                                                        const parsed = typeof sm === 'string' ? JSON.parse(sm) : sm;
                                                                                        const mArr = Array.isArray(parsed) ? parsed : (parsed.mods || []);
                                                                                        mods = mArr.map((m: any) => m.name);
                                                                                    }
                                                                                }
                                                                            } catch { }
                                                                            const baseName = item.product_name || item.name;
                                                                            return (
                                                                                <div key={i} className="flex flex-col bg-zinc-900/50 p-3 rounded border border-zinc-800/50">
                                                                                    <span className="font-bold text-white text-lg">{item.quantity}x {baseName}</span>
                                                                                    {mods.length > 0 && <span className="text-sm font-medium text-sky-300 pl-6 mt-1.5 leading-relaxed">+ {mods.join(', ')}</span>}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                ) : (
                                                                    order.items.map((item: any, i: number) => {
                                                                        let mods: string[] = [];
                                                                        try {
                                                                            if (item.options && Array.isArray(item.options)) {
                                                                                mods = item.options.map((m: any) => m.name);
                                                                            } else {
                                                                                const sm = item.selected_modifiers || item.modifiers;
                                                                                if (sm) {
                                                                                    const parsed = typeof sm === 'string' ? JSON.parse(sm) : sm;
                                                                                    const mArr = Array.isArray(parsed) ? parsed : (parsed.mods || []);
                                                                                    mods = mArr.map((m: any) => m.name);
                                                                                }
                                                                            }
                                                                        } catch { }
                                                                        const baseName = item.product_name || item.name;
                                                                        const modStr = mods.length > 0 ? ` (+ ${mods.join(', ')})` : '';
                                                                        return <span key={item.id || baseName + i} className="text-base font-medium">{item.quantity}x {baseName}<span className="text-sky-400">{modStr}</span>{i < order.items.length - 1 ? ', ' : ''}</span>;
                                                                    })
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col md:items-end gap-3 w-full md:w-auto mt-2 md:mt-0">
                                                            <div className="font-bold text-3xl text-white font-mono">{formatPrice(order.total)}</div>
                                                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                                                {/* Print Ticket */}
                                                                <button
                                                                    onClick={() => {
                                                                        const rawData = supabaseOrders.find(o => o.id === order.id);
                                                                        if (rawData) {
                                                                            setPrintReceipt({
                                                                                id: rawData.id,
                                                                                total: rawData.total,
                                                                                order_type: rawData.order_type,
                                                                                customer_name: rawData.customer_name,
                                                                                pickup_time: rawData.pickup_time,
                                                                                created_at: rawData.created_at,
                                                                                source_device: rawData.source_device,
                                                                                items: rawData.items_json || [],
                                                                                isPending: true,
                                                                            });
                                                                            logger.audit('PRINT', 'MANUAL_REPRINT_REQUESTED', { order_id: rawData.id, is_pending: true });
                                                                            setTimeout(() => window.print(), 300);
                                                                        }
                                                                    }}
                                                                    className="flex items-center gap-1.5 bg-zinc-700 hover:bg-zinc-600 text-white font-bold px-4 py-2 rounded-xl transition-all active:scale-95 text-sm"
                                                                >
                                                                    <Printer size={16} /> Ticket
                                                                </button>
                                                                {/* Print Facture */}
                                                                <button
                                                                    onClick={() => {
                                                                        const rawData = supabaseOrders.find(o => o.id === order.id);
                                                                        if (rawData) {
                                                                            setPrintFacture({
                                                                                id: rawData.id,
                                                                                total: rawData.total,
                                                                                order_type: rawData.order_type,
                                                                                customer_name: rawData.customer_name,
                                                                                pickup_time: rawData.pickup_time,
                                                                                created_at: rawData.created_at,
                                                                                source_device: rawData.source_device,
                                                                                items: rawData.items_json || [],
                                                                                isPending: true,
                                                                            });
                                                                            logger.audit('PRINT', 'MANUAL_FACTURE_REQUESTED', { order_id: rawData.id, is_pending: true });
                                                                            setTimeout(() => window.print(), 300);
                                                                        }
                                                                    }}
                                                                    className="flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 font-bold px-4 py-2 rounded-xl transition-all active:scale-95 text-sm"
                                                                >
                                                                    <FileText size={16} /> Facture
                                                                </button>
                                                                {/* Modifier Pending */}
                                                                <button
                                                                    onClick={() => handleEditPendingOrder(order)}
                                                                    className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold px-3 py-2 rounded-xl transition-all active:scale-95 text-sm"
                                                                    title="Modifier la commande"
                                                                >
                                                                    <Edit2 size={16} /> Modifier
                                                                </button>
                                                                {/* Supprimer Pending */}
                                                                <button
                                                                    onClick={() => handleDeletePendingOrder(order.id)}
                                                                    className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 font-bold px-3 py-2 rounded-xl transition-all active:scale-95 text-sm"
                                                                    title="Supprimer la commande en attente"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                                {/* Send Rappel */}
                                                                <button
                                                                    disabled={alertCount >= 2}
                                                                    onClick={async () => {
                                                                        if (!supabase) return;
                                                                        const rawData = supabaseOrders.find(o => o.id === order.id);
                                                                        if (!rawData) return;
                                                                        try {
                                                                            // Update order with rappel_at timestamp — this triggers postgres_changes UPDATE on tablet
                                                                            const currentDetails = rawData.payment_details || [];
                                                                            const updatedDetails = Array.isArray(currentDetails)
                                                                                ? currentDetails.map((d: any) => ({ ...d, alertCount: 2 }))
                                                                                : [{ alertCount: 2 }];
                                                                            await supabase.from('pos_orders')
                                                                                .update({
                                                                                    payment_details: updatedDetails,
                                                                                    rappel_at: new Date().toISOString()
                                                                                })
                                                                                .eq('id', order.id);
                                                                            fetchOrdersFromSupabase(); // refresh

                                                                            // Register tracking for the rappel
                                                                            registerPendingAck(order.id);

                                                                            logger.audit('REALTIME', 'RAPPEL_BROADCAST_SENT', { order_id: order.id });
                                                                            alert('✅ Rappel envoyé en cuisine !');
                                                                        } catch (err) {
                                                                            console.error('[Rappel] Error:', err);
                                                                            logger.error('REALTIME', 'RAPPEL_BROADCAST_FAILED', { order_id: order.id, error: String(err) });
                                                                            alert('❌ Erreur lors de l\'envoi du rappel');
                                                                        }
                                                                    }}
                                                                    className={cn(
                                                                        "flex items-center gap-1.5 font-bold px-4 py-2 rounded-xl transition-all active:scale-95 text-sm",
                                                                        alertCount >= 2
                                                                            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                                                            : "bg-orange-500 hover:bg-orange-400 text-black shadow-lg shadow-orange-500/20"
                                                                    )}
                                                                >
                                                                    <BellRing size={16} />
                                                                    {alertCount >= 2 ? 'Rappel envoyé' : 'Rappel cuisine'}
                                                                </button>
                                                                {/* Encaisser */}
                                                                <button
                                                                    onClick={() => setOnHoldPaymentOrder(order)}
                                                                    className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-6 py-2.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                                                                >
                                                                    ENCAISSER
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* History Tab */}
                            {activeTab === 'history' && (
                                <div className="flex flex-col h-full">
                                    <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                                        <h3 className="text-2xl font-bold text-white">Historique des Commandes</h3>
                                        <div className="flex items-center gap-3">
                                            <span className="text-zinc-500 text-sm">Filtrer par date :</span>
                                            <input
                                                type="date"
                                                value={selectedHistoryDate}
                                                onChange={(e) => setSelectedHistoryDate(e.target.value)}
                                                className="bg-zinc-900 border border-zinc-800 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-zinc-700"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-6">
                                        <div className="space-y-4">
                                            {filteredOrderHistory.length === 0 ? (
                                                <div className="text-center text-zinc-500 py-10">Aucune commande pour cette date.</div>
                                            ) : (
                                                filteredOrderHistory.map((order) => (
                                                    <div key={order.id} className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden transition-all">
                                                        <div
                                                            onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                                            className="p-4 flex justify-between items-center cursor-pointer hover:bg-zinc-800/50 transition-colors"
                                                        >
                                                            <div>
                                                                <div className="flex items-center space-x-3">
                                                                    <span className="font-mono font-bold text-white bg-zinc-800 px-2 py-1 rounded">{order.id}</span>
                                                                    <span className="text-zinc-400 text-sm">
                                                                        {new Date(order.timestamp).toLocaleTimeString()}
                                                                    </span>
                                                                    <span className={cn(
                                                                        "text-xs font-bold px-2 py-0.5 rounded",
                                                                        order.orderType === 'emporte'
                                                                            ? "bg-sky-500/20 text-sky-400"
                                                                            : "bg-amber-500/20 text-amber-400"
                                                                    )}>
                                                                        {order.orderType === 'emporte' ? '📦 Emporté' : '🍽️ Sur Place'}
                                                                    </span>
                                                                    {order.customerName && (
                                                                        <span className="text-xs font-bold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded">
                                                                            👤 {order.customerName}
                                                                        </span>
                                                                    )}
                                                                    {order.pickupTime && (
                                                                        <span className="text-xs font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                                                                            🕐 {order.pickupTime}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="text-right flex items-center gap-3">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const rawData = supabaseOrders.find(o => o.id === order.id);
                                                                        if (rawData) {
                                                                            setPrintReceipt({
                                                                                id: rawData.id,
                                                                                total: rawData.total,
                                                                                order_type: rawData.order_type,
                                                                                customer_name: rawData.customer_name,
                                                                                pickup_time: rawData.pickup_time,
                                                                                created_at: rawData.created_at,
                                                                                source_device: rawData.source_device,
                                                                                items: rawData.items_json || [],
                                                                                payments: rawData.payment_details,
                                                                                isPending: false,
                                                                            });
                                                                            logger.audit('PRINT', 'MANUAL_REPRINT_REQUESTED', { order_id: rawData.id, is_pending: false });
                                                                            setTimeout(() => window.print(), 300);
                                                                        }
                                                                    }}
                                                                    className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-all active:scale-95 text-xs"
                                                                >
                                                                    <Printer size={14} />
                                                                </button>
                                                                {/* Facture History */}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const rawData = supabaseOrders.find(o => o.id === order.id);
                                                                        if (rawData) {
                                                                            setPrintFacture({
                                                                                id: rawData.id,
                                                                                total: rawData.total,
                                                                                order_type: rawData.order_type,
                                                                                customer_name: rawData.customer_name,
                                                                                pickup_time: rawData.pickup_time,
                                                                                created_at: rawData.created_at,
                                                                                source_device: rawData.source_device,
                                                                                items: rawData.items_json || [],
                                                                                payments: rawData.payment_details,
                                                                                isPending: false,
                                                                            });
                                                                            logger.audit('PRINT', 'MANUAL_FACTURE_REQUESTED', { order_id: rawData.id, is_pending: false });
                                                                            setTimeout(() => window.print(), 300);
                                                                        }
                                                                    }}
                                                                    className="flex items-center gap-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg transition-all active:scale-95 text-xs font-bold"
                                                                >
                                                                    <FileText size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setOrderToCorrect(order);
                                                                    }}
                                                                    className="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 hover:text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-all active:scale-95 text-xs font-bold"
                                                                >
                                                                    <Edit2 size={14} /> Corriger
                                                                </button>
                                                                <div>
                                                                    <p className="text-xl font-bold text-white">{formatPrice(order.total)}</p>
                                                                    <p className="text-green-500 text-xs font-medium">Payé ({order.paymentMethod})</p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Order Details */}
                                                        {expandedOrderId === order.id && (
                                                            <div className="bg-zinc-950/50 border-t border-zinc-800 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                                                                {/* Customer info banner */}
                                                                {(order.customerName || order.pickupTime) && (
                                                                    <div className="flex gap-3 mb-3 flex-wrap">
                                                                        {order.customerName && (
                                                                            <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-3 py-1.5 rounded-lg text-sm font-bold">
                                                                                👤 {order.customerName}
                                                                            </div>
                                                                        )}
                                                                        {order.pickupTime && (
                                                                            <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-1.5 rounded-lg text-sm font-bold">
                                                                                🕐 {order.pickupTime}
                                                                            </div>
                                                                        )}
                                                                        <div className={cn(
                                                                            "px-3 py-1.5 rounded-lg text-sm font-bold border",
                                                                            order.orderType === 'emporte'
                                                                                ? 'bg-sky-500/10 border-sky-500/20 text-sky-400'
                                                                                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                                                        )}>
                                                                            {order.orderType === 'emporte' ? '📦 Emporté' : '🍽️ Sur Place'}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Items — use embedded items_json (instant) or fallback to fetched items */}
                                                                {(() => {
                                                                    const items = order.items.length > 0 ? order.items : expandedOrderItems;
                                                                    if (items.length === 0) return <p className="text-zinc-400 text-sm italic">Chargement...</p>;
                                                                    return items.map((item: any, idx: number) => {
                                                                        let mods: any[] = [], note = '';
                                                                        try {
                                                                            // Website format
                                                                            if (item.options && Array.isArray(item.options)) {
                                                                                mods = item.options;
                                                                                note = item.comment || '';
                                                                            }
                                                                            // POS format
                                                                            else {
                                                                                const sm = item.selected_modifiers || item.modifiers;
                                                                                if (sm) {
                                                                                    const parsed = typeof sm === 'string' ? JSON.parse(sm) : sm;
                                                                                    if (Array.isArray(parsed)) {
                                                                                        mods = parsed;
                                                                                    } else {
                                                                                        mods = parsed.mods || [];
                                                                                        note = parsed.note || '';
                                                                                    }
                                                                                }
                                                                            }
                                                                        } catch { }

                                                                        return (
                                                                            <div key={idx} className="flex justify-between items-start text-base border-b border-zinc-800/30 pb-3 last:border-0 last:pb-0">
                                                                                <div className="flex space-x-4">
                                                                                    <span className="font-bold text-zinc-300 text-lg">{item.quantity}x</span>
                                                                                    <div>
                                                                                        <p className="text-zinc-100 font-bold text-lg">{item.product_name || item.name}</p>
                                                                                        {mods.length > 0 && (
                                                                                            <div className="text-blue-300 text-sm mt-1.5 space-y-1">
                                                                                                {mods.map((m: any, mi: number) => (
                                                                                                    <div key={mi} className="flex items-center gap-1.5">
                                                                                                        <span className="text-blue-500 font-bold">+</span>
                                                                                                        <span className="font-medium">{m.quantity && m.quantity > 1 ? `${m.quantity}× ` : ''}{m.name}</span>
                                                                                                        {m.price > 0 && <span className="text-zinc-400">({formatPrice(Number(m.price) || 0)})</span>}
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}
                                                                                        {note && (
                                                                                            <div className="text-yellow-400 text-sm mt-1 mb-1 italic bg-yellow-400/10 inline-block px-2 py-0.5 rounded">⚠️ {note}</div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                <span className="text-zinc-300 font-medium flex-shrink-0 text-lg">{formatPrice(item.total_price || (item.unit_price || item.price) * item.quantity)}</span>
                                                                            </div>
                                                                        );
                                                                    });
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Products Tab */}
                            {activeTab === 'products' && (
                                <div className="flex flex-col h-full">
                                    <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                                        <div className="flex items-center space-x-4">
                                            <div className="flex items-center space-x-2">
                                                <h3 className="text-2xl font-bold text-white">Gestion Produits</h3>
                                                <button
                                                    onClick={async () => {
                                                        if (confirm('ATTENTION: Cela va écraser/mettre à jour tous les produits dans le DB Local. Continuer ?')) {
                                                            const { seedDatabase } = await import('@/lib/seeder');
                                                            const result = await seedDatabase();

                                                            let message = 'Résultat de la synchronisation :\n';
                                                            if (result.success) {
                                                                message += `✅ Total Produits: ${result.count}\n`;
                                                                message += `🏷️ Dont Mitake: ${result.mitakeCount}\n`;
                                                            } else {
                                                                message += `❌ Erreur: ${result.error?.message || 'Inconnue'}\n`;
                                                            }

                                                            alert(message);
                                                            window.location.reload();
                                                        }
                                                    }}
                                                    className="text-xs bg-red-900/30 hover:bg-red-900/50 text-red-300 px-3 py-1.5 rounded-lg border border-red-800 transition-colors flex items-center space-x-1"
                                                >
                                                    <Save size={14} />
                                                    <span>Full Seed (JSON -&gt; DB)</span>
                                                </button>
                                            </div>
                                            <div className="relative w-64">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                                                <input
                                                    type="text"
                                                    placeholder="Rechercher..."
                                                    value={productSearch}
                                                    onChange={(e) => setProductSearch(e.target.value)}
                                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-zinc-700"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-6">
                                        <div className="grid grid-cols-1 gap-3">
                                            {filteredProducts.map((product) => (
                                                <div key={product.id} className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 flex justify-between items-center group hover:bg-zinc-900/50 transition-colors">
                                                    <div className="flex items-center space-x-4">
                                                        {product.image && (
                                                            <img src={product.image} alt="" className="w-10 h-10 rounded-lg object-cover bg-zinc-800" />
                                                        )}
                                                        <div>
                                                            <p className="font-medium text-white">{product.name}</p>
                                                            <p className="text-zinc-500 text-xs">{product.category}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center space-x-6">
                                                        <p className="font-bold text-white">{formatPrice(product.price)}</p>
                                                        <button
                                                            onClick={() => setEditingProduct(product)}
                                                            className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                                        >
                                                            <Edit2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Settings Tab */}
                            {activeTab === 'settings' && (
                                <div className="flex flex-col h-full overflow-y-auto">
                                    <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                                        <h3 className="text-2xl font-bold text-white">Paramètres Système</h3>
                                    </div>
                                    <div className="p-8 max-w-2xl space-y-12">

                                        {/* Device Identification */}
                                        <div className="space-y-4">
                                            <div>
                                                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                                                    <Monitor size={20} className="text-primary" />
                                                    Identification de l'Appareil
                                                </h4>
                                                <p className="text-zinc-400 text-sm mt-1">
                                                    Définit le rôle de cette machine sur le réseau. Les commandes passées sur l'ordinateur alerteront la tablette, et vice versa.
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <button
                                                    onClick={() => setDeviceId('caisse_ordi')}
                                                    className={cn(
                                                        "p-6 rounded-2xl border text-left transition-all",
                                                        deviceId === 'caisse_ordi'
                                                            ? "bg-primary/20 border-primary shadow-[0_0_30px_rgba(220,38,38,0.15)]"
                                                            : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                                                    )}
                                                >
                                                    <Monitor size={32} className={cn("mb-4", deviceId === 'caisse_ordi' ? "text-primary" : "text-zinc-500")} />
                                                    <div className={cn("font-bold text-lg", deviceId === 'caisse_ordi' ? "text-primary" : "text-white")}>
                                                        Caisse Principal
                                                    </div>
                                                    <div className="text-zinc-500 text-sm mt-1">Appareil maître. Reçoit toutes les catégories de produits.</div>
                                                </button>

                                                <button
                                                    onClick={() => setDeviceId('tablette')}
                                                    className={cn(
                                                        "p-6 rounded-2xl border text-left transition-all",
                                                        deviceId === 'tablette'
                                                            ? "bg-emerald-500/20 border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.15)]"
                                                            : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                                                    )}
                                                >
                                                    <Smartphone size={32} className={cn("mb-4", deviceId === 'tablette' ? "text-emerald-500" : "text-zinc-500")} />
                                                    <div className={cn("font-bold text-lg", deviceId === 'tablette' ? "text-emerald-500" : "text-white")}>
                                                        Tablette Ramen
                                                    </div>
                                                    <div className="text-zinc-500 text-sm mt-1">Affiche uniquement les 4 Ramens avec alertes de commandes.</div>
                                                </button>
                                            </div>
                                        </div>

                                        <hr className="border-white/5" />

                                        {/* UI Settings */}
                                        <div className="space-y-4">
                                            <div>
                                                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                                                    🖥️ Interface
                                                </h4>
                                                <p className="text-zinc-400 text-sm mt-1">
                                                    Personnalisez l'affichage de la caisse.
                                                </p>
                                            </div>

                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-medium text-white">Taux de TVA (%)</span>
                                                    <span className="text-orange-400 font-bold">{tvaRate}%</span>
                                                </div>
                                                <input
                                                    type="number"
                                                    value={tvaRate}
                                                    onChange={(e) => setTvaRate(Number(e.target.value))}
                                                    className="w-full bg-black border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-white/20"
                                                />
                                                <p className="text-xs text-zinc-500">S'applique sur les tickets imprimés (ex: 20, 10, 5.5).</p>
                                            </div>

                                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-medium text-white">Taille de l'interface (Zoom)</span>
                                                    <span className="text-blue-400 font-bold">{uiZoomLevel}%</span>
                                                </div>

                                                <input
                                                    type="range"
                                                    min="50"
                                                    max="150"
                                                    step="5"
                                                    value={uiZoomLevel}
                                                    onChange={(e) => setUiZoomLevel(Number(e.target.value))}
                                                    className="w-full h-3 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                />

                                                <div className="flex justify-between items-center text-xs text-zinc-500">
                                                    <span>Écritures Minuscules</span>
                                                    <button
                                                        onClick={() => setUiZoomLevel(100)}
                                                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
                                                    >
                                                        Réinitialiser (100%)
                                                    </button>
                                                    <span>Écritures Géantes</span>
                                                </div>
                                            </div>
                                        </div>

                                        <hr className="border-white/5" />

                                        {/* Ticket Information Settings */}
                                        <div className="space-y-4">
                                            <div>
                                                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                                                    📄 Informations du Ticket (Impression)
                                                </h4>
                                                <p className="text-zinc-400 text-sm mt-1">
                                                    Gérez les informations d'en-tête et de pied de page pour vos tickets imprimés.
                                                </p>
                                            </div>

                                            {localSettings && (
                                                <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <label className="block">
                                                            <span className="text-sm font-medium text-zinc-300">Nom du Restaurant</span>
                                                            <input
                                                                type="text"
                                                                value={localSettings.store_name}
                                                                onChange={(e) => setLocalSettings({ ...localSettings, store_name: e.target.value })}
                                                                className="mt-1 w-full bg-black/40 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/20"
                                                            />
                                                        </label>
                                                        <label className="block">
                                                            <span className="text-sm font-medium text-zinc-300">Sous-titre / Catégorie</span>
                                                            <input
                                                                type="text"
                                                                value={localSettings.subtitle}
                                                                onChange={(e) => setLocalSettings({ ...localSettings, subtitle: e.target.value })}
                                                                className="mt-1 w-full bg-black/40 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/20"
                                                            />
                                                        </label>
                                                        <label className="block md:col-span-2">
                                                            <span className="text-sm font-medium text-zinc-300">Adresse</span>
                                                            <input
                                                                type="text"
                                                                value={localSettings.address}
                                                                onChange={(e) => setLocalSettings({ ...localSettings, address: e.target.value })}
                                                                className="mt-1 w-full bg-black/40 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/20"
                                                            />
                                                        </label>
                                                        <label className="block">
                                                            <span className="text-sm font-medium text-zinc-300">Téléphone</span>
                                                            <input
                                                                type="text"
                                                                value={localSettings.phone}
                                                                onChange={(e) => setLocalSettings({ ...localSettings, phone: e.target.value })}
                                                                className="mt-1 w-full bg-black/40 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/20"
                                                            />
                                                        </label>
                                                        <label className="block">
                                                            <span className="text-sm font-medium text-zinc-300">SIRET</span>
                                                            <input
                                                                type="text"
                                                                value={localSettings.siret}
                                                                onChange={(e) => setLocalSettings({ ...localSettings, siret: e.target.value })}
                                                                className="mt-1 w-full bg-black/40 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/20"
                                                            />
                                                        </label>
                                                        <label className="block">
                                                            <span className="text-sm font-medium text-zinc-300">Message Pied de page 1</span>
                                                            <input
                                                                type="text"
                                                                value={localSettings.footer_message_1}
                                                                onChange={(e) => setLocalSettings({ ...localSettings, footer_message_1: e.target.value })}
                                                                className="mt-1 w-full bg-black/40 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/20"
                                                            />
                                                        </label>
                                                        <label className="block">
                                                            <span className="text-sm font-medium text-zinc-300">Message Pied de page 2</span>
                                                            <input
                                                                type="text"
                                                                value={localSettings.footer_message_2}
                                                                onChange={(e) => setLocalSettings({ ...localSettings, footer_message_2: e.target.value })}
                                                                className="mt-1 w-full bg-black/40 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/20"
                                                            />
                                                        </label>
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await updateSettings(localSettings);
                                                                alert('✅ Informations du ticket sauvegardées');
                                                            } catch (err) {
                                                                alert('❌ Erreur lors de la sauvegarde');
                                                            }
                                                        }}
                                                        className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                                                    >
                                                        <Save size={18} />
                                                        Sauvegarder les infos du ticket
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <hr className="border-white/5" />

                                        {/* Printer Settings */}
                                        <div className="space-y-4">
                                            <div>
                                                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                                                    🖨️ Paramètres Caisse (Impression)
                                                </h4>
                                                <p className="text-zinc-400 text-sm mt-1">
                                                    Configurez le nom de l&apos;imprimante pour l&apos;impression directe via QZ Tray. Laissez vide pour utiliser l&apos;imprimante par défaut.
                                                </p>
                                            </div>

                                            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-4">
                                                <label className="block">
                                                    <span className="text-sm font-bold text-zinc-300">Nom de l&apos;imprimante (QZ Tray)</span>
                                                    <input
                                                        type="text"
                                                        value={printerName}
                                                        onChange={(e) => setPrinterName(e.target.value)}
                                                        placeholder="Ex: EPSON TM-T20III"
                                                        className="mt-2 w-full bg-black/40 border border-zinc-700 rounded-xl px-4 py-3 text-white text-base font-mono font-medium placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                                                    />
                                                </label>
                                                <div className="text-xs text-zinc-500 space-y-1">
                                                    <p>💡 <strong>Navigateur (Kiosk)</strong> : Pas besoin de nom, utilise le dialogue d&apos;impression Chrome.</p>
                                                    <p>⚡ <strong>QZ Tray</strong> : Nécessite QZ Tray installé + le nom exact de l&apos;imprimante.</p>
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            )}

                        </div>
                    </div>

                    {/* Edit Product Modal */}
                    {editingProduct && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
                                <h3 className="text-xl font-bold text-white mb-4">Modifier Produit</h3>
                                <form onSubmit={handleSaveProduct} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-1">Nom</label>
                                        <input
                                            type="text"
                                            value={editingProduct.name}
                                            onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                                            className="w-full bg-black border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-white/20"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-1">Prix (€)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={editingProduct.price}
                                            onChange={(e) => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                                            className="w-full bg-black border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-white/20"
                                        />
                                    </div>
                                    <div className="flex space-x-3 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setEditingProduct(null)}
                                            className="flex-1 py-3 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 font-medium"
                                        >
                                            Annuler
                                        </button>
                                        <button
                                            type="submit"
                                            className="flex-1 py-3 rounded-xl bg-white text-black hover:bg-zinc-200 font-bold flex items-center justify-center space-x-2"
                                        >
                                            <Save size={18} />
                                            <span>Enregistrer</span>
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Payment Modal for On Hold Checkout */}
            {onHoldPaymentOrder && (
                <PaymentModal
                    isOpen={!!onHoldPaymentOrder}
                    totalAmount={onHoldPaymentOrder.total}
                    onClose={() => setOnHoldPaymentOrder(null)}
                    onConfirm={async (payments) => {
                        const rawData = supabaseOrders.find(o => o.id === onHoldPaymentOrder.id);
                        await payOnHoldOrder(onHoldPaymentOrder.id, payments, false, rawData);
                        setOnHoldPaymentOrder(null);
                        fetchOrdersFromSupabase(); // refresh
                    }}
                />
            )}

            {/* Receipt portal for printing from Admin */}
            {typeof document !== 'undefined' && printReceipt && createPortal(
                <ReceiptFromOrder data={printReceipt} />,
                document.body
            )}
            {/* Facture portal */}
            {typeof document !== 'undefined' && printFacture && createPortal(
                <ReceiptFromOrder data={printFacture} isInvoice={true} />,
                document.body
            )}
            {/* Z-Ticket portal */}
            {typeof document !== 'undefined' && printSummary && createPortal(
                <div id="receipt-print-area" className="receipt-container">
                    <div className="receipt-header">
                        <div className="receipt-logo">BILAN DE JOURNÉE</div>
                        <div className="receipt-sub">{new Date(printSummary.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                    <div style={{ borderBottom: '2px dashed #000', margin: '10px 0' }}></div>
                    <div className="receipt-totals">
                        <div className="receipt-total-line" style={{ fontSize: '32px' }}>
                            <span>Total CA</span>
                            <span>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(printSummary.revenue)}</span>
                        </div>
                        <div className="receipt-row mt-2" style={{ fontSize: '24px', fontWeight: 900 }}>
                            <span>Nb Commandes</span>
                            <span>{printSummary.count}</span>
                        </div>
                        <div className="receipt-row mt-1" style={{ fontSize: '22px', fontWeight: 900 }}>
                            <span>Panier Moyen</span>
                            <span>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(printSummary.revenue / printSummary.count)}</span>
                        </div>
                    </div>
                    <div style={{ borderBottom: '2px dashed #000', margin: '10px 0' }}></div>
                    <div className="receipt-info">
                        <div style={{ fontSize: '26px', fontWeight: 900, textAlign: 'center', marginBottom: '12px' }}>RÉPARTITION</div>
                        {printSummary.byMethod.carte > 0 && (
                            <div className="receipt-row" style={{ fontSize: '20px', fontWeight: 900 }}>
                                <span>Carte Bancaire</span>
                                <span>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(printSummary.byMethod.carte)}</span>
                            </div>
                        )}
                        {printSummary.byMethod.espece > 0 && (
                            <div className="receipt-row" style={{ fontSize: '20px', fontWeight: 900 }}>
                                <span>Espèces</span>
                                <span>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(printSummary.byMethod.espece)}</span>
                            </div>
                        )}
                        {printSummary.byMethod.ticket_resto > 0 && (
                            <div className="receipt-row" style={{ fontSize: '20px', fontWeight: 900 }}>
                                <span>Ticket Resto</span>
                                <span>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(printSummary.byMethod.ticket_resto)}</span>
                            </div>
                        )}
                        {printSummary.byMethod.cheque_vacance > 0 && (
                            <div className="receipt-row" style={{ fontSize: '20px', fontWeight: 900 }}>
                                <span>Chèque Vacances</span>
                                <span>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(printSummary.byMethod.cheque_vacance)}</span>
                            </div>
                        )}
                    </div>
                    <div style={{ borderBottom: '2px dashed #000', margin: '14px 0' }}></div>
                    <div className="receipt-center receipt-small" style={{ fontSize: '20px', marginTop: '15px', fontWeight: 900 }}>
                        Fin du rapport Z
                    </div>
                </div>,
                document.body
            )}
            {/* Payment Correction Modal */}
            {orderToCorrect && (
                <PaymentCorrectionModal
                    isOpen={!!orderToCorrect}
                    orderId={orderToCorrect.id}
                    totalAmount={orderToCorrect.total}
                    initialPayments={orderToCorrect.payment_details || []}
                    onClose={() => setOrderToCorrect(null)}
                    onSuccess={(newPayments) => {
                        // Optimistically update the UI list
                        setSupabaseOrders(prev => prev.map(o =>
                            o.id === orderToCorrect.id
                                ? { ...o, payment_method: newPayments[0]?.method || 'cash', payment_details: newPayments }
                                : o
                        ));
                        setOrderToCorrect(null);
                    }}
                />
            )}
        </>
    );
}
