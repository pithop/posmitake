"use client";

import { formatPrice } from '@/lib/utils';
import { useSystemStore } from '@/store/useStore';

export interface OrderReceiptData {
    id: string;
    total: number;
    order_type: string;
    customer_name?: string;
    pickup_time?: string;
    created_at: string;
    source_device?: string;
    items: any[]; // items_json from Supabase
    payments?: any[];
    isPending?: boolean; // true = "À PAYER" mode
}

interface Props {
    data: OrderReceiptData | null;
}

export function ReceiptFromOrder({ data }: Props) {
    const tvaRate = useSystemStore(state => state.tvaRate) || 20;
    const settings = useSystemStore(state => state.settings);

    if (!data) return null;

    const date = new Date(data.created_at);
    const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    return (
        <div id="receipt-print-area" className="receipt-container">
            {/* Header */}
            <div className="receipt-header">
                <div className="receipt-logo">{settings?.store_name || 'MITAKE RAMEN'}</div>
                <div className="receipt-sub">{settings?.subtitle || 'Japanese Kitchen'}</div>
            </div>

            <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>

            {/* Restaurant Info */}
            <div className="receipt-center receipt-small" style={{ marginBottom: '12px' }}>
                <div>{settings?.address || '569 Av. Henri Mauriat, 13100 Aix-en-Provence'}</div>
                <div>Tél: {settings?.phone || '09 72 21 38 99'}</div>
                {settings?.siret && <div>SIRET: {settings.siret}</div>}
            </div>

            {/* Order Info */}
            <div className="receipt-info">
                <div className="receipt-row">
                    <span>Commande:</span>
                    <span className="receipt-bold">{data.id}</span>
                </div>
                <div className="receipt-row">
                    <span>Date:</span>
                    <span>{dateStr} {timeStr}</span>
                </div>
                <div className="receipt-row">
                    <span>Type:</span>
                    <span className="receipt-bold">
                        {data.order_type === 'emporte' ? 'EMPORTÉ' : 'SUR PLACE'}
                    </span>
                </div>
                {data.customer_name && (
                    <div className="receipt-row">
                        <span>Client:</span>
                        <span className="receipt-bold">{data.customer_name}</span>
                    </div>
                )}
                {data.pickup_time && (
                    <div className="receipt-row">
                        <span>Heure retrait:</span>
                        <span className="receipt-bold">{data.pickup_time}</span>
                    </div>
                )}
                {data.source_device && (
                    <div className="receipt-row">
                        <span>Caisse:</span>
                        <span>{data.source_device}</span>
                    </div>
                )}
            </div>

            <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>

            {/* Items */}
            <div className="receipt-items">
                {data.items.map((item: any, idx: number) => {
                    let mods: any[] = [];
                    let note = '';
                    try {
                        const sm = item.selected_modifiers;
                        if (sm) {
                            const parsed = typeof sm === 'string' ? JSON.parse(sm) : sm;
                            if (Array.isArray(parsed)) {
                                mods = parsed;
                            } else {
                                mods = parsed.mods || [];
                                note = parsed.note || '';
                            }
                        }
                    } catch { }

                    return (
                        <div key={idx} className="receipt-item">
                            <div className="receipt-item-main">
                                <span>{item.quantity}x {item.product_name}</span>
                                <span>{formatPrice(item.total_price || item.unit_price * item.quantity)}</span>
                            </div>
                            {mods.length > 0 && (
                                <div className="receipt-mods">
                                    {mods.map((m: any, mi: number) => (
                                        <div key={mi} className="receipt-mod">
                                            + {m.quantity && m.quantity > 1 ? `${m.quantity}× ` : ''}{m.name}
                                            {m.priceAdjustment > 0 && ` (${formatPrice(m.priceAdjustment)})`}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {note && (
                                <div className="receipt-note">⚠ {note}</div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>

            {/* Totals */}
            <div className="receipt-totals">
                <div className="receipt-total-line">
                    <span className="receipt-bold receipt-large">TOTAL TTC</span>
                    <span className="receipt-bold receipt-large">{formatPrice(data.total)}</span>
                </div>
                <div className="receipt-row mt-1 text-zinc-600 text-sm">
                    <span>Total HT</span>
                    <span>{formatPrice(data.total / (1 + (tvaRate / 100)))}</span>
                </div>
                <div className="receipt-row text-zinc-600 text-sm mb-2">
                    <span>Dont TVA ({tvaRate}%)</span>
                    <span>{formatPrice(data.total - (data.total / (1 + (tvaRate / 100))))}</span>
                </div>
            </div>

            <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>

            {/* Payments or Pending */}
            <div className="receipt-payments">
                {data.isPending ? (
                    <div className="receipt-row">
                        <span className="receipt-bold" style={{ fontSize: '14px' }}>⏳ À PAYER</span>
                        <span className="receipt-bold">{formatPrice(data.total)}</span>
                    </div>
                ) : (
                    data.payments && data.payments.filter((p: any) => p.method && p.method !== 'unpaid').map((p: any, i: number) => (
                        <div key={i} className="receipt-row">
                            <span>{p.method === 'card' ? 'CB' : p.method === 'cash' ? 'Espèces' : p.method.toUpperCase()}</span>
                            <span>{formatPrice(p.amount)}</span>
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="receipt-footer">
                <div style={{ borderTop: '1px dashed #000', paddingTop: '8px', marginTop: '8px' }}></div>
                <div className="receipt-center">{settings?.footer_message_1 || 'Merci de votre visite !'}</div>
                <div className="receipt-center receipt-small mt-1">{settings?.footer_message_2 || 'À très bientôt.'}</div>
            </div>
        </div>
    );
}
