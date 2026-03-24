export type MarketplaceFulfillmentMode = "platform" | "supplier" | "mixed";

export type MarketplaceOrderStatus =
  | "pending"
  | "confirmed"
  | "picking"
  | "ready_for_dispatch"
  | "in_transit"
  | "delivered"
  | "cancelled";

export type MarketplaceDeliveryMethod = "bevgo_delivery" | "supplier_delivery" | "collection";

export interface MarketplaceAddress {
  line1?: string;
  line2?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface MarketplaceMoney {
  excl: number;
  incl: number;
  vat: number;
  currency: string;
}

export interface MarketplaceSupplierRef {
  supplierId: string;
  supplierName: string;
  supplierSlug?: string | null;
}

export interface MarketplaceCartLine {
  lineKey?: string;
  productId: string;
  variantId: string;
  quantity: number;
  supplier: MarketplaceSupplierRef;
  fulfillmentMode: MarketplaceFulfillmentMode;
  deliveryMethod?: MarketplaceDeliveryMethod;
  lineTotals: MarketplaceMoney;
  productSnapshot?: Record<string, unknown>;
  variantSnapshot?: Record<string, unknown>;
}

export interface MarketplaceSplitOrderInput {
  cartId: string;
  customerId: string;
  deliveryAddress?: MarketplaceAddress | null;
  source?: "web" | "mobile" | "api";
  currency?: string;
  lines: MarketplaceCartLine[];
}

export interface MarketplaceSubOrderLine extends MarketplaceCartLine {
  supplierOrderKey: string;
}

export interface MarketplaceSubOrder {
  subOrderId: string;
  supplier: MarketplaceSupplierRef;
  fulfillmentMode: MarketplaceFulfillmentMode;
  deliveryMethod: MarketplaceDeliveryMethod;
  status: MarketplaceOrderStatus;
  lineCount: number;
  quantities: number;
  totals: MarketplaceMoney;
  lines: MarketplaceSubOrderLine[];
}

export interface MarketplaceParentOrder {
  orderId: string;
  cartId: string;
  customerId: string;
  source: "web" | "mobile" | "api";
  currency: string;
  subOrderCount: number;
  totals: MarketplaceMoney;
  deliveryAddress?: MarketplaceAddress | null;
}

export interface MarketplaceSplitOrderResult {
  parentOrder: MarketplaceParentOrder;
  subOrders: MarketplaceSubOrder[];
}
