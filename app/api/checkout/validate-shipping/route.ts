import { NextRequest, NextResponse } from "next/server";
import { resolveShippingForSellerGroup } from "@/lib/shipping/resolve";
import { findSellerOwnerByCode, findSellerOwnerBySlug } from "@/lib/seller/team-admin";
import { getAdminDb } from "@/lib/firebase/admin";

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
  return normalized || "Selected shipping option is no longer valid.";
}

async function loadPlatformShippingConfig() {
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection("system_settings").doc("platform_delivery").get();
  const data = snap.exists ? snap.data() || {} : {};
  return data?.piessangFulfillmentShipping || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sellerGroups = Array.isArray(body?.sellerGroups) ? body.sellerGroups : [];
  const buyerDestination = body?.buyerDestination && typeof body.buyerDestination === "object" ? body.buyerDestination : null;
  if (!buyerDestination) return err(400, "Missing Destination", "buyerDestination is required.");

  const piessangFulfillmentShipping = await loadPlatformShippingConfig();
  const validations = [];
  const errors = [];

  for (const group of sellerGroups) {
    const sellerId = toStr(group?.sellerId || group?.sellerCode || group?.sellerSlug);
    const selectedZoneId = toStr(group?.zoneId);
    const owner =
      (sellerId ? await findSellerOwnerByCode(sellerId) : null) ??
      (sellerId ? await findSellerOwnerBySlug(sellerId) : null);
    const seller = owner?.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
    const resolved = await resolveShippingForSellerGroup({
      seller,
      items: Array.isArray(group?.items) ? group.items : [],
      buyerDestination,
      piessangFulfillmentShipping,
    });
    if (!resolved.ok || (selectedZoneId && selectedZoneId !== toStr(resolved.zone?.id))) {
      errors.push({
        sellerId,
        code: resolved.ok ? "INVALID_SELECTION" : resolved.error,
        message: resolved.ok ? "Selected shipping option is no longer valid." : toShippingErrorMessage(resolved.error),
        debug: resolved.debug || null,
      });
      continue;
    }
    validations.push({
      sellerId,
      valid: true,
      zoneId: resolved.zone?.id || null,
      finalShippingFee: resolved.finalShippingFee,
      pricingMode: resolved.pricingMode,
      batchingMode: resolved.batchingMode,
    });
  }

  if (errors.length) {
    return err(400, "Shipping Validation Failed", "One or more seller shipping selections are no longer valid.", {
      errors,
      validations,
    });
  }

  return ok({
    validations,
    count: validations.length,
    total: validations.length,
  });
}
