export interface ModifierOption {
    id: string;
    name: string;
    priceAdjustment: number;
}

export interface ModifierGroup {
    id: string;
    title: string;
    required: boolean;
    multiSelect: boolean;
    options: ModifierOption[];
}

export interface Product {
    id: string;
    name: string;
    price: number;
    category: string;
    description?: string;
    image: string;
    available?: boolean;
    modifierGroups?: ModifierGroup[];
    tags?: string[];
}

export interface CartItem {
    instanceId: string;
    menuItem: Product;
    selectedModifiers: ModifierOption[];
    quantity: number;
    totalPrice: number;
}

export interface Order {
    id: string;
    items: CartItem[];
    total: number;
    timestamp: number;
    status: 'completed' | 'pending' | 'cancelled';
    payments?: Payment[];
}

export type PaymentMethodType =
    | 'cash'
    | 'card'
    | 'amex'
    | 'ticket_restaurant_paper'
    | 'ticket_restaurant_card'
    | 'cheque_vacances'
    | 'check'
    | 'mobile_payment'
    | 'gift_voucher'
    | 'other';

export interface Payment {
    method: PaymentMethodType;
    amount: number;
}
