import { ReceiptData } from '@/components/Receipt';
import { formatPrice } from '@/lib/utils';
import { logger } from './logger';

// ============================================================
// METHOD 1: Browser Print (window.print + @media print CSS)
// ============================================================
export function printBrowser(): void {
    if (typeof window === 'undefined') return;
    window.print();
}

// ============================================================
// METHOD 2: QZ Tray — Direct ESC/POS thermal printing
// ============================================================

// ESC/POS command constants
const ESC = '\x1B';
const GS = '\x1D';
const LF = '\x0A';

// Text formatting
const BOLD_ON = ESC + 'E1';
const BOLD_OFF = ESC + 'E0';
const ALIGN_CENTER = ESC + 'a1';
const ALIGN_LEFT = ESC + 'a0';
const ALIGN_RIGHT = ESC + 'a2';
const DOUBLE_HEIGHT = ESC + '!0';     // Normal
const DOUBLE_SIZE = ESC + '!\x30';    // Double width + height
const NORMAL_SIZE = ESC + '!\x00';

// Paper cut
const CUT_PAPER = GS + 'V' + '\x00';  // Full cut
// Cash drawer kick (pin 2, 25ms on, 250ms off)
const OPEN_DRAWER = ESC + 'p' + '\x00' + '\x19' + '\xFA';

function padRight(text: string, width: number): string {
    return text.length >= width ? text.substring(0, width) : text + ' '.repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
    return text.length >= width ? text.substring(0, width) : ' '.repeat(width - text.length) + text;
}

function lineItem(name: string, price: string, maxWidth = 32): string {
    const priceLen = price.length;
    const nameLen = maxWidth - priceLen - 1;
    return padRight(name, nameLen) + ' ' + price;
}

function buildEscPosData(data: ReceiptData): string {
    const lines: string[] = [];

    // Header
    lines.push(ALIGN_CENTER);
    lines.push(DOUBLE_SIZE + BOLD_ON);
    lines.push('MITAKE RAMEN' + LF);
    lines.push(NORMAL_SIZE + BOLD_OFF);
    lines.push('Japanese Kitchen' + LF);
    lines.push('================================' + LF);
    lines.push(ALIGN_LEFT);

    // Order info
    const date = new Date(data.timestamp);
    const dateStr = date.toLocaleDateString('fr-FR');
    const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    lines.push(lineItem('Commande:', data.orderId) + LF);
    lines.push(lineItem('Date:', `${dateStr} ${timeStr}`) + LF);
    lines.push(BOLD_ON);
    lines.push(lineItem('Type:', data.orderType === 'emporte' ? 'EMPORTE' : 'SUR PLACE') + LF);
    lines.push(BOLD_OFF);

    if (data.customerName) {
        lines.push(BOLD_ON);
        lines.push(lineItem('Client:', data.customerName) + LF);
        lines.push(BOLD_OFF);
    }
    if (data.pickupTime) {
        lines.push(lineItem('Heure:', data.pickupTime) + LF);
    }
    lines.push(lineItem('Caisse:', data.deviceId) + LF);
    lines.push('--------------------------------' + LF);

    // Items
    for (const item of data.items) {
        const priceStr = formatPrice(item.totalPrice);
        const itemName = `${item.quantity}x ${item.menuItem.name}`;
        lines.push(BOLD_ON + lineItem(itemName, priceStr) + BOLD_OFF + LF);

        for (const mod of item.selectedModifiers) {
            const modLine = `  + ${mod.name}`;
            if (mod.priceAdjustment > 0) {
                lines.push(lineItem(modLine, formatPrice(mod.priceAdjustment)) + LF);
            } else {
                lines.push(modLine + LF);
            }
        }

        if (item.note) {
            lines.push(`  ! ${item.note}` + LF);
        }
    }

    lines.push('--------------------------------' + LF);

    // Total
    lines.push(DOUBLE_SIZE + BOLD_ON + ALIGN_RIGHT);
    lines.push('TOTAL ' + formatPrice(data.total) + LF);
    lines.push(NORMAL_SIZE + BOLD_OFF + ALIGN_LEFT);
    lines.push('--------------------------------' + LF);

    // Payments
    for (const p of data.payments) {
        const methodName = p.method === 'card' ? 'CB' : p.method === 'cash' ? 'Especes' : p.method.toUpperCase();
        lines.push(lineItem(methodName, formatPrice(p.amount)) + LF);
    }

    // Footer
    lines.push('================================' + LF);
    lines.push(ALIGN_CENTER);
    lines.push('Merci de votre visite !' + LF);
    lines.push('MITAKE RAMEN' + LF);
    lines.push(ALIGN_LEFT);
    lines.push(LF + LF + LF);  // Feed paper

    // Cut + drawer
    lines.push(CUT_PAPER);
    lines.push(OPEN_DRAWER);

    return lines.join('');
}

declare global {
    interface Window {
        qz?: any;
    }
}

export async function printQzTray(data: ReceiptData, printerName: string): Promise<{ success: boolean; error?: string }> {
    if (typeof window === 'undefined' || !window.qz) {
        return { success: false, error: 'QZ Tray non détecté. Installez QZ Tray et rechargez la page.' };
    }

    const qz = window.qz;

    try {
        // Connect if needed
        if (!qz.websocket.isActive()) {
            await qz.websocket.connect();
        }

        // Find printer
        const printer = printerName
            ? await qz.printers.find(printerName)
            : await qz.printers.getDefault();

        if (!printer) {
            return { success: false, error: `Imprimante "${printerName}" introuvable.` };
        }

        // Build config
        const config = qz.configs.create(printer);

        // Build ESC/POS data
        const escPosData = buildEscPosData(data);

        // Print
        await qz.print(config, [{ type: 'raw', format: 'plain', data: escPosData }]);

        logger.info('PRINT', 'PRINT_QZ_SUCCESS', { printer: printerName });
        return { success: true };
    } catch (err: any) {
        console.error('[QZ Tray] Print error:', err);
        logger.error('PRINT', 'PRINT_QZ_FAILED', { error: err?.message || 'Unknown', printer: printerName });
        return { success: false, error: err?.message || 'Erreur impression QZ Tray' };
    }
}
