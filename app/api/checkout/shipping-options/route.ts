import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { loadPlatformShippingSettings } from "@/lib/platform/shipping-settings";
import { findSellerOwnerByCode, findSellerOwnerBySlug } from "@/lib/seller/team-admin";
import { resolveShippingForSellerGroup } from "@/lib/shipping/resolve";

const ok = (payload: Record<string, unknown> = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status: number, title: string, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value).trim();
}

function toShippingErrorMessage(code: unknown) {
  const normalized = toStr(code);
  if (normalized === "SELLER_DOES_NOT_SHIP_TO_LOCATION") return "This seller does not ship to the selected destination.";
  if (normalized === "WEIGHT_REQUIRED_FOR_SHIPPING_MODE") return "This seller needs product weight details before this shipping rule can be used.";
  return normalized || "Shipping could not be resolved for this seller.";
}

function getSellerIdentity(item: any) {
  return {
    sellerCode: toStr(item?.product_snapshot?.product?.sellerCode || item?.product_snapshot?.seller?.sellerCode || item?.product?.product?.sellerCode || item?.product?.seller?.sellerCode || ""),
    sellerSlug: toStr(item?.product_snapshot?.product?.sellerSlug || item?.product_snapshot?.seller?.sellerSlug || item?.product?.product?.sellerSlug || item?.product?.seller?.sellerSlug || ""),
    sellerName: toStr(item?.product_snapshot?.seller?.vendorName || item?.product_snapshot?.product?.vendorName || item?.product?.seller?.vendorName || "Seller"),
  };
}

async function loadPlatformShippingConfig() {
  const settings = await loadPlatformShippingSettings();
  return settings || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body?.cartItems || body?.items) ? body.cartItems || body.items : [];
  const buyerDestination = body?.buyerDestination && typeof body.buyerDestination === "object" ? body.buyerDestination : null;
  if (!buyerDestination) {
    return err(400, "Missing Destination", "buyerDestination is required.");
  }

  const groups = new Map<string, { sellerCode: string; sellerSlug: string; sellerName: string; items: any[] }>();
  for (const item of items) {
    const identity = getSellerIdentity(item);
    const key = identity.sellerCode || identity.sellerSlug;
    if (!key) continue;
    const existing = groups.get(key) || { ...identity, items: [] };
    existing.items.push(item);
    groups.set(key, existing);
  }

  const platformShipping = await loadPlatformShippingConfig();
  const options = [];
  const errors = [];
  for (const group of groups.values()) {
    const owner =
      (group.sellerCode ? await findSellerOwnerByCode(group.sellerCode) : null) ??
      (group.sellerSlug ? await findSellerOwnerBySlug(group.sellerSlug) : null);
    const seller = owner?.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
    const resolved = await resolveShippingForSellerGroup({
      seller,
      items: group.items,
      buyerDestination,
      piessangFulfillmentShipping: platformShipping?.piessangFulfillmentShipping || null,
      platformShippingMarkup: platformShipping?.platformShippingMarkup || null,
    });

    if (!resolved.ok) {
      errors.push({
        sellerId: group.sellerCode || group.sellerSlug,
        sellerName: group.sellerName,
        code: resolved.code,
        message: resolved.message || toShippingErrorMessage(resolved.code),
        reasons: resolved.errors || [],
        debug: resolved.debug || null,
      });
      continue;
    }

    options.push({
      sellerId: group.sellerCode || group.sellerSlug,
      sellerName: group.sellerName,
      fulfillmentMode: resolved.fulfillmentMode,
      matchedSource: resolved.matchedSource,
      matchedRuleId: resolved.matchedRuleId,
      matchedRuleName: resolved.matchedRuleName,
      coverageMatchType: resolved.matchType,
      pricingMode: resolved.pricingMode,
      batchingMode: resolved.batchingMode,
      destination: resolved.destination,
      baseShippingFee: resolved.baseShippingFee,
      finalShippingFee: resolved.finalShippingFee,
      estimatedDeliveryDays: resolved.estimatedDeliveryDays,
      items: resolved.items,
      debug: resolved.debug || null,
    });
  }

  return ok({
    options,
    errors,
    count: options.length,
    total: options.length,
  });
}
