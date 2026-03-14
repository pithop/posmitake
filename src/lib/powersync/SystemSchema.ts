import { Column, ColumnType, Schema, Table } from '@powersync/web';

export const PRODUCTS_TABLE = new Table({
    name: 'pos_products',
    columns: [
        new Column({ name: 'name', type: ColumnType.TEXT }),
        new Column({ name: 'price', type: ColumnType.REAL }),
        new Column({ name: 'category', type: ColumnType.TEXT }),
        new Column({ name: 'description', type: ColumnType.TEXT }),
        new Column({ name: 'image', type: ColumnType.TEXT }),
        new Column({ name: 'available', type: ColumnType.INTEGER }),
        new Column({ name: 'modifier_groups', type: ColumnType.TEXT }),
        new Column({ name: 'tags', type: ColumnType.TEXT })
    ]
});

export const ORDERS_TABLE = new Table({
    name: 'pos_orders',
    columns: [
        new Column({ name: 'total', type: ColumnType.REAL }),
        new Column({ name: 'status', type: ColumnType.TEXT }),
        new Column({ name: 'payment_method', type: ColumnType.TEXT }),
        new Column({ name: 'payment_details', type: ColumnType.TEXT }),
        new Column({ name: 'created_at', type: ColumnType.TEXT }),
        new Column({ name: 'source_device', type: ColumnType.TEXT }),
        new Column({ name: 'order_type', type: ColumnType.TEXT }),
        new Column({ name: 'customer_name', type: ColumnType.TEXT }),
        new Column({ name: 'pickup_time', type: ColumnType.TEXT }),
    ]
});

export const ORDER_ITEMS_TABLE = new Table({
    name: 'pos_order_items',
    columns: [
        new Column({ name: 'order_id', type: ColumnType.TEXT }),
        new Column({ name: 'product_id', type: ColumnType.TEXT }),
        new Column({ name: 'product_name', type: ColumnType.TEXT }),
        new Column({ name: 'quantity', type: ColumnType.INTEGER }),
        new Column({ name: 'unit_price', type: ColumnType.REAL }),
        new Column({ name: 'total_price', type: ColumnType.REAL }),
        new Column({ name: 'selected_modifiers', type: ColumnType.TEXT })
    ]
});

export const LOGS_TABLE = new Table({
    name: 'pos_logs',
    columns: [
        new Column({ name: 'session_id', type: ColumnType.TEXT }),
        new Column({ name: 'trace_id', type: ColumnType.TEXT }),
        new Column({ name: 'client_timestamp', type: ColumnType.INTEGER }),
        new Column({ name: 'server_timestamp', type: ColumnType.TEXT }),
        new Column({ name: 'level', type: ColumnType.TEXT }),
        new Column({ name: 'category', type: ColumnType.TEXT }),
        new Column({ name: 'event_name', type: ColumnType.TEXT }),
        new Column({ name: 'device_id', type: ColumnType.TEXT }),
        new Column({ name: 'user_id', type: ColumnType.TEXT }),
        new Column({ name: 'payload', type: ColumnType.TEXT })
    ]
});

export const AppSchema = new Schema({
    pos_products: PRODUCTS_TABLE,
    pos_orders: ORDERS_TABLE,
    pos_order_items: ORDER_ITEMS_TABLE,
    pos_logs: LOGS_TABLE
});

export type Database = (typeof AppSchema)['types'];
