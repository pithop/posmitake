"use client";

import { CartItem, Payment } from '@/types';
import { formatPrice } from '@/lib/utils';
import { useSystemStore } from '@/store/useStore';

export interface ReceiptData {
    orderId: string;
    items: CartItem[];
    total: number;
    payments: Payment[];
    orderType: string;
    customerName: string;
    pickupTime: string;
    timestamp: number;
    deviceId: string;
}

interface ReceiptProps {
    data: ReceiptData | null;
}

export function Receipt({ data }: ReceiptProps) {
    const tvaRate = useSystemStore(state => state.tvaRate) || 20;
    const settings = useSystemStore(state => state.settings);

    if (!data) return null;

    const date = new Date(data.timestamp);
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
                    <span className="receipt-bold">{data.orderId}</span>
                </div>
                <div className="receipt-row">
                    <span>Date:</span>
                    <span>{dateStr} {timeStr}</span>
                </div>
                <div className="receipt-row">
                    <span>Type:</span>
                    <span className="receipt-bold">
                        {data.orderType === 'emporte' ? 'EMPORTÉ' : 'SUR PLACE'}
                    </span>
                </div>
                {data.customerName && (
                    <div className="receipt-row">
                        <span>Client:</span>
                        <span className="receipt-bold">{data.customerName}</span>
                    </div>
                )}
                {data.pickupTime && (
                    <div className="receipt-row">
                        <span>Heure retrait:</span>
                        <span className="receipt-bold">{data.pickupTime}</span>
                    </div>
                )}
                <div className="receipt-row">
                    <span>Caisse:</span>
                    <span>{data.deviceId}</span>
                </div>
            </div>

            <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>

            {/* Items */}
            <div className="receipt-items">
                {data.items.map((item, idx) => (
                    <div key={idx} className="receipt-item">
                        <div className="receipt-item-main">
                            <span>{item.quantity}x {item.menuItem.name}</span>
                            <span>{formatPrice(item.totalPrice)}</span>
                        </div>
                        {item.selectedModifiers.length > 0 && (
                            <div className="receipt-mods">
                                {item.selectedModifiers.map((m, mi) => (
                                    <div key={mi} className="receipt-mod">
                                        + {m.name}
                                        {m.priceAdjustment > 0 && ` (${formatPrice(m.priceAdjustment)})`}
                                    </div>
                                ))}
                            </div>
                        )}
                        {item.note && (
                            <div className="receipt-note">⚠ {item.note}</div>
                        )}
                    </div>
                ))}
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

            {/* Payments */}
            <div className="receipt-payments">
                {data.payments.map((p, i) => (
                    <div key={i} className="receipt-row">
                        <span>{p.method === 'card' ? 'CB' : p.method === 'cash' ? 'Espèces' : p.method.toUpperCase()}</span>
                        <span>{formatPrice(p.amount)}</span>
                    </div>
                ))}
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
