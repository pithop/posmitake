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
    delivery_address?: string; // Newly added
    customer_notes?: string;   // Newly added
    items: any[]; // items_json from Supabase
    payments?: any[];
    isPending?: boolean; // true = "À PAYER" mode
}

interface Props {
    data: OrderReceiptData | null;
    isInvoice?: boolean;
}

export function ReceiptFromOrder({ data, isInvoice }: Props) {
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
                {isInvoice ? (
                    <div className="receipt-logo" style={{ fontSize: '30px', marginBottom: '12px' }}>BON DE COMMANDE</div>
                ) : (
                    <>
                        <div className="receipt-logo">{settings?.store_name || 'MITAKE RAMEN'}</div>
                        <div className="receipt-sub">{settings?.subtitle || 'Japanese Kitchen'}</div>
                    </>
                )}
            </div>

            <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }}></div>

            {/* Restaurant Info */}
            <div className="receipt-center receipt-small" style={{ marginBottom: '6px' }}>
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
                        <span>Terminal:</span>
                        <span>{data.source_device}</span>
                    </div>
                )}
                {data.order_type === 'delivery' && data.delivery_address && (
                    <div className="receipt-row" style={{ marginTop: '6px' }}>
                        <span className="receipt-bold">LIVRER À:</span>
                        <span className="receipt-bold" style={{ textAlign: 'right', fontSize: '1.2em' }}>{data.delivery_address}</span>
                    </div>
                )}
                {data.customer_notes && (
                    <div className="receipt-row" style={{ marginTop: '6px' }}>
                        <span className="receipt-bold" style={{textDecoration: 'underline'}}>NOTES:</span>
                        <span className="receipt-bold" style={{ textAlign: 'right' }}>{data.customer_notes}</span>
                    </div>
                )}
            </div>

            <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }}></div>

            {/* Items */}
            <div className="receipt-items">
                {data.items.map((item: any, idx: number) => {
                    let mods: any[] = [];
                    let note = '';

                    try {
                        // Website Format
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

                    const itemName = item.product_name || item.name;
                    const itemPrice = item.total_price || (item.unit_price || item.price || 0) * (item.quantity || 1);

                    return (
                        <div key={idx} className="receipt-item">
                            <div className="receipt-item-main">
                                <span>{item.quantity}x {itemName}</span>
                            </div>
                            {mods.length > 0 && (
                                <div className="receipt-mods">
                                    {mods.map((m: any, mi: number) => (
                                        <div key={mi} className="receipt-mod">
                                            + {m.quantity && m.quantity > 1 ? `${m.quantity}× ` : ''}{m.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {note && (
                                <div className="receipt-note">* NOTE: {note}</div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div style={{ borderBottom: '1px dashed #000', margin: '4px 0' }}></div>

            {/* Note additionnelle si besoin */}
            <div className="receipt-footer">
                <div style={{ borderTop: '1px dashed #000', paddingTop: '8px', marginTop: '8px' }}></div>
                <div className="receipt-center">{settings?.footer_message_1 || 'Merci de votre visite !'}</div>
                <div className="receipt-center receipt-small mt-1">{settings?.footer_message_2 || 'À très bientôt.'}</div>
            </div>
        </div>
    );
}
