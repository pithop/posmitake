import { useSystemStore } from '@/store/useStore';
import { formatPrice } from '@/lib/utils';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Settings, X, RotateCcw, LayoutDashboard, History, Package, Search, Save, Edit2, WifiOff, CloudUpload, SlidersHorizontal, Monitor, Smartphone } from 'lucide-react';
import { Product, Order } from '@/types';
import { cn } from '@/lib/utils';
import { useQuery, usePowerSync } from '@powersync/react';
import { supabase } from '@/lib/supabase';

type Tab = 'dashboard' | 'history' | 'products' | 'settings';

export function AdminPanel() {
    const { dailyRevenue, resetDaily, deviceId, setDeviceId, uiZoomLevel, setUiZoomLevel } = useSystemStore();

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

    const orderHistory: Order[] = useMemo(() => supabaseOrders.map((o: any) => ({
        id: o.id,
        total: o.total,
        status: o.status,
        timestamp: new Date(o.created_at).getTime(),
        items: [],
        paymentMethod: o.payment_method || 'card',
        sourceDevice: o.source_device || 'unknown',
        orderType: o.order_type || 'sur_place',
        payments: o.payment_details ? (typeof o.payment_details === 'string' ? JSON.parse(o.payment_details) : o.payment_details) : [],
    })), [supabaseOrders]);

    const products: Product[] = useMemo(() => productsData.map((p: any) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        category: p.category,
        description: p.description,
        image: p.image,
        available: p.available === 1 || p.available === true,
        modifierGroups: p.modifier_groups ? JSON.parse(p.modifier_groups) : [],
        tags: p.tags ? JSON.parse(p.tags) : []
    })), [productsData]);

    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [isClient, setIsClient] = useState(false);

    // Product Management State
    const [productSearch, setProductSearch] = useState('');
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [expandedOrderItems, setExpandedOrderItems] = useState<any[]>([]);
    const [selectedHistoryDate, setSelectedHistoryDate] = useState(() => {
        const d = new Date();
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    });
    const powersync = usePowerSync();

    // Fetch orders when panel opens or tab changes to history
    useEffect(() => {
        if (isOpen && activeTab === 'history') {
            fetchOrdersFromSupabase();
        }
    }, [isOpen, activeTab, fetchOrdersFromSupabase]);

    const filteredOrderHistory = useMemo(() => {
        if (!selectedHistoryDate) return orderHistory;
        return orderHistory.filter(o => {
            const orderDate = new Date(o.timestamp);
            const offset = orderDate.getTimezoneOffset() * 60000;
            const localDateStr = new Date(orderDate.getTime() - offset).toISOString().split('T')[0];
            return localDateStr === selectedHistoryDate;
        });
    }, [orderHistory, selectedHistoryDate]);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (expandedOrderId && supabase) {
            supabase.from('pos_order_items').select('*').eq('order_id', expandedOrderId)
                .then(({ data }) => setExpandedOrderItems(data || []));
        }
    }, [expandedOrderId]);

    const updateProduct = async (id: string, updates: Partial<Product>) => {
        await powersync.execute('UPDATE pos_products SET name = ?, price = ? WHERE id = ?',
            [updates.name, updates.price, id]);
    };

    if (!isClient) return null;

    const handleReset = () => {
        if (confirm('ATTENTION: Cela va effacer le chiffre d\'affaires local (affichage seulement). Continuer ?')) {
            resetDaily();
        }
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
                                {(['dashboard', 'history', 'products', 'settings'] as Tab[]).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={cn(
                                            "w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium",
                                            activeTab === tab ? "bg-white text-black" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                                        )}
                                    >
                                        {tab === 'dashboard' && <LayoutDashboard size={18} />}
                                        {tab === 'history' && <History size={18} />}
                                        {tab === 'products' && <Package size={18} />}
                                        {tab === 'settings' && <SlidersHorizontal size={18} />}
                                        <span className="capitalize">{tab === 'settings' ? 'paramètres' : tab}</span>
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
                                    <h3 className="text-2xl font-bold text-white mb-6">Aperçu de la journée</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                                            <p className="text-zinc-400 text-sm font-medium">Chiffre d'Affaires</p>
                                            <p className="text-4xl font-bold text-green-500 mt-2">{formatPrice(dailyRevenue)}</p>
                                        </div>
                                        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                                            <p className="text-zinc-400 text-sm font-medium">Commandes</p>
                                            <p className="text-4xl font-bold text-white mt-2">{orderHistory.length}</p>
                                        </div>
                                        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                                            <p className="text-zinc-400 text-sm font-medium">Panier Moyen</p>
                                            <p className="text-4xl font-bold text-blue-500 mt-2">
                                                {orderHistory.length > 0 ? formatPrice(dailyRevenue / orderHistory.length) : formatPrice(0)}
                                            </p>
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
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-xl font-bold text-white">{formatPrice(order.total)}</p>
                                                                <p className="text-green-500 text-xs font-medium">Payé ({order.paymentMethod})</p>
                                                            </div>
                                                        </div>

                                                        {/* Order Details */}
                                                        {expandedOrderId === order.id && (
                                                            <div className="bg-zinc-950/50 border-t border-zinc-800 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                                                                {expandedOrderItems.length === 0 ? (
                                                                    <p className="text-zinc-400 text-sm italic">Chargement...</p>
                                                                ) : (
                                                                    expandedOrderItems.map((item, idx) => (
                                                                        <div key={idx} className="flex justify-between items-start text-sm">
                                                                            <div className="flex space-x-3">
                                                                                <span className="font-bold text-zinc-400">{item.quantity}x</span>
                                                                                <div>
                                                                                    <p className="text-zinc-200 font-medium">{item.product_name}</p>
                                                                                    {(() => {
                                                                                        if (!item.selected_modifiers || item.selected_modifiers === '[]') return null;
                                                                                        try {
                                                                                            const parsed = JSON.parse(item.selected_modifiers);
                                                                                            const modsList = Array.isArray(parsed) ? parsed : (parsed.mods || []);
                                                                                            const noteStr = !Array.isArray(parsed) && parsed.note ? parsed.note : '';

                                                                                            return (
                                                                                                <div className="text-zinc-500 text-xs mt-0.5 space-y-1">
                                                                                                    {modsList.length > 0 && <div>{modsList.map((m: any) => m.name).join(', ')}</div>}
                                                                                                    {noteStr && <div className="text-yellow-500/80 italic">Note: {noteStr}</div>}
                                                                                                </div>
                                                                                            );
                                                                                        } catch (e) {
                                                                                            return null;
                                                                                        }
                                                                                    })()}
                                                                                </div>
                                                                            </div>
                                                                            <span className="text-zinc-400">{formatPrice(item.total_price)}</span>
                                                                        </div>
                                                                    ))
                                                                )}
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

                                        {/* Global POS Zoom Scale */}
                                        <div className="space-y-6">
                                            <div>
                                                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                                                    <Search size={20} className="text-blue-500" />
                                                    Facteur de Zoom Global (Écran Tactile)
                                                </h4>
                                                <p className="text-zinc-400 text-sm mt-1">
                                                    Ajustez ce curseur si l'interface est paramétrée trop petite ou trop grande pour votre écran physique sans toucher au zoom du navigateur Chrome.
                                                </p>
                                            </div>

                                            <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-6">
                                                <div className="flex justify-between items-center text-white font-mono font-bold text-xl">
                                                    <span>- 50%</span>
                                                    <span className="text-3xl text-blue-400">{uiZoomLevel}%</span>
                                                    <span>+ 150%</span>
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
        </>
    );
}
