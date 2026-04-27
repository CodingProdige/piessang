"use client";

export type CheckoutShippingOption = {
  sellerId: string;
  sellerName: string;
  fulfillmentMode?: string | null;
  matchedSource: "local_delivery" | "shipping_zone";
  matchedRuleId: string;
  matchedRuleName: string;
  coverageMatchType: "postal_exact" | "postal_range" | "province" | "country";
  pricingMode: string;
  batchingMode: string;
  destination?: {
    countryCode?: string | null;
    province?: string | null;
    city?: string | null;
    postalCode?: string | null;
  } | null;
  baseShippingFee: number;
  finalShippingFee: number;
  estimatedDeliveryDays?: {
    min?: number | null;
    max?: number | null;
  } | null;
  items?: Array<Record<string, unknown>>;
  debug?: Record<string, unknown> | null;
};

export type CheckoutShippingError = {
  sellerId: string;
  sellerName?: string;
  code:
    | "SELLER_DOES_NOT_SHIP_TO_LOCATION"
    | "WEIGHT_REQUIRED_FOR_SHIPPING_MODE"
    | "INVALID_SHIPPING_SETTINGS"
    | string;
  message: string;
  reasons?: string[];
  debug?: Record<string, unknown> | null;
};

export type CheckoutShippingPreview = {
  options: CheckoutShippingOption[];
  errors: CheckoutShippingError[];
  shippingBaseTotal: number;
  shippingFinalTotal: number;
};

export async function fetchCheckoutShippingPreview({
  items,
  buyerDestination,
}: {
  items: Array<Record<string, unknown>>;
  buyerDestination: Record<string, unknown>;
}): Promise<CheckoutShippingPreview> {
  const response = await fetch("/api/checkout/shipping-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cartItems: items,
      buyerDestination,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || "We could not resolve shipping right now.");
  }
  const options = Array.isArray(payload?.options) ? payload.options : [];
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  return {
    options,
    errors,
    shippingBaseTotal: options.reduce((sum: number, option: any) => sum + Math.max(0, Number(option?.baseShippingFee || 0)), 0),
    shippingFinalTotal: options.reduce((sum: number, option: any) => sum + Math.max(0, Number(option?.finalShippingFee || 0)), 0),
  };
}
