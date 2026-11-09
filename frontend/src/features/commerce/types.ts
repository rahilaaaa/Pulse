export type CommerceNavTab =
  | "overview"
  | "products"
  | "categories"
  | "price_lists"
  | "inventory"
  | "orders"
  | "customers"
  | "vendors"
  | "discounts"
  | "returns"
  | "reports"
  | "settings";

export type ProductStatus = "active" | "draft" | "archived";
export type ProductType = "simple" | "variant" | "service" | "digital";
export type OrderStatus =
  | "draft"
  | "placed"
  | "confirmed"
  | "processing"
  | "ready_for_shipment"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned";

export type PaymentStatus = "pending" | "partially_paid" | "paid" | "refunded" | "failed";
export type ReturnStatus = "requested" | "approved" | "received" | "completed" | "rejected" | "cancelled";
export type RefundStatus = "not_applicable" | "pending" | "refunded" | "rejected";

export interface ProductVariantItem {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  price_minor: number;
  cost_price_minor: number;
  stock_quantity: number;
  reserved_quantity: number;
  available_stock: number;
  attributes: Record<string, string>;
  status: ProductStatus;
}

export interface ProductItem {
  id: string;
  name: string;
  sku: string;
  description: string;
  category_id: string | null;
  category_name: string;
  vendor_id: string | null;
  vendor_name: string;
  image_url: string;
  product_type: ProductType;
  barcode: string;
  price_minor: number;
  cost_price_minor: number;
  tax_rate: string;
  tax_classification: string;
  uom: string;
  status: ProductStatus;
  stock_quantity: number;
  reserved_quantity: number;
  available_stock: number;
  low_stock_threshold: number;
  track_inventory: boolean;
  is_low_stock: boolean;
  attributes: Record<string, string>;
  variants_count: number;
  created_at: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  code: string;
  description: string;
  parent_id: string | null;
  parent_name: string | null;
  status: "active" | "inactive";
  display_order: number;
  product_count: number;
}

export interface PriceListItemRow {
  id: string;
  name: string;
  code: string;
  description: string;
  currency: string;
  is_default: boolean;
  customer_party_id: string | null;
  customer_name: string | null;
  party_kind: string;
  valid_from: string | null;
  valid_to: string | null;
  status: string;
  items_count: number;
}

export interface StockMovementItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  movement_type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  reference_type: string;
  reference_id: string;
  notes: string;
  created_at: string;
}

export interface OrderLineItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  variant_id: string | null;
  variant_name: string | null;
  quantity: number;
  unit_price_minor: number;
  discount_minor: number;
  tax_minor: number;
  total_minor: number;
  notes: string;
}

export interface OrderActivityItem {
  id: string;
  action: string;
  from_status: string;
  to_status: string;
  notes: string;
  actor_name: string;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_number: string;
  party: string;
  party_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  total_minor: number;
  currency: string;
  lines_count: number;
  created_at: string;
}

export interface OrderDetail extends OrderItem {
  shipping_address: string;
  billing_address: string;
  notes: string;
  discount_code?: string;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  party_details?: {
    id: string;
    display_name: string;
    kind: "person" | "organization";
    email: string;
    phone: string;
  };
  lines: OrderLineItem[];
  activities: OrderActivityItem[];
}

export interface CustomerItem {
  id: string;
  display_name: string;
  kind: "person" | "organization";
  email: string;
  phone: string;
  status: "active" | "inactive";
  orders_count: number;
  total_spent_minor: number;
  created_at: string;
}

export interface VendorItem {
  id: string;
  display_name: string;
  kind: "person" | "organization";
  email: string;
  phone: string;
  status: "active" | "inactive";
  supplied_products_count: number;
  created_at: string;
}

export interface DiscountItem {
  id: string;
  name: string;
  code: string;
  discount_type: "percentage" | "fixed_amount";
  value: string;
  min_order_amount_minor: number;
  max_discount_amount_minor: number | null;
  applies_to: string;
  usage_limit: number | null;
  usage_count: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

export interface ReturnItem {
  id: string;
  return_number: string;
  order_id: string;
  order_number: string;
  party_id: string;
  customer_name: string;
  status: ReturnStatus;
  refund_status: RefundStatus;
  refund_amount_minor: number;
  reason: string;
  notes: string;
  created_at: string;
}

export interface CommerceOverviewData {
  kpis: {
    total_sales_minor: number;
    total_orders: number;
    total_customers: number;
    total_products: number;
    pending_orders: number;
    low_stock_products: number;
    currency: string;
    currency_symbol: string;
  };
  sales_trend: Array<{
    date: string;
    sales_minor: number;
    orders: number;
  }>;
  orders_by_status: Record<string, number>;
  sales_by_category: Array<{
    category: string;
    total_minor: number;
    quantity: number;
  }>;
  top_selling_products: Array<{
    id: string;
    name: string;
    sku: string;
    units_sold: number;
    revenue_minor: number;
  }>;
  top_customers: Array<{
    id: string;
    name: string;
    kind: string;
    email: string;
    total_spent_minor: number;
    orders_count: number;
  }>;
  recent_orders: Array<{
    id: string;
    order_number: string;
    customer_name: string;
    party_id: string;
    status: OrderStatus;
    payment_status: PaymentStatus;
    total_minor: number;
    currency: string;
    created_at: string;
  }>;
  low_stock_alerts: Array<{
    id: string;
    name: string;
    sku: string;
    stock_quantity: number;
    reserved_quantity: number;
    available_stock: number;
    low_stock_threshold: number;
    uom: string;
  }>;
  pending_returns: Array<{
    id: string;
    return_number: string;
    order_number: string;
    customer_name: string;
    refund_amount_minor: number;
    reason: string;
    status: string;
    created_at: string;
  }>;
  date_filter: string;
}

export interface CommerceSettingsData {
  currency: string;
  currency_symbol: string;
  tax_rate: string;
  tax_included_in_price: boolean;
  default_tax_classification: string;
  order_number_prefix: string;
  order_number_next: number;
  return_number_prefix: string;
  return_number_next: number;
  default_low_stock_threshold: number;
  auto_deduct_inventory: boolean;
  allow_backorders: boolean;
  return_window_days: number;
  enable_customer_notes: boolean;
}

