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
}
