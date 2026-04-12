export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { resolvePlatformDeliveryOption } from "@/lib/platform/delivery-settings";
import { resolveDeliveryQuote } from "@/lib/shipping/rating";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function buildShopperArea(address = {}) {
  return {
    city: toStr(address?.city || address?.suburb),
    suburb: toStr(address?.suburb),
    province: toStr(address?.province || address?.stateProvinceRegion || address?.region),
    stateProvinceRegion: toStr(address?.stateProvinceRegion || address?.province || address?.region),
    postalCode: toStr(address?.postalCode),
    country: toStr(address?.country || "South Africa"),
    latitude: address?.latitude == null ? null : Number(address.latitude),
    longitude: address?.longitude == null ? null : Number(address.longitude),
  };
}

function formatReason(kind) {
  if (kind === "direct") return "platform_direct_delivery";
  if (kind === "shipping") return "platform_shipping";
  if (kind === "collection") return "platform_collection";
  return "platform_delivery_unavailable";
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const address = body?.address && typeof body.address === "object" ? body.address : null;
    const subtotalIncl = Number(body?.subtotalIncl || 0);

    if (!address) {
      return err(400, "Missing Address", "address is required.");
    }

    const shopperArea = buildShopperArea(address);
    const profile = body?.deliveryProfile && typeof body.deliveryProfile === "object" ? body.deliveryProfile : null;
    const sellerBaseLocation = toStr(body?.sellerBaseLocation || body?.baseLocation || "");
    const parcels = Array.isArray(body?.parcels) ? body.parcels : [];
    const resolved = profile
      ? await resolveDeliveryQuote({
          profile,
          sellerBaseLocation,
          shopperArea,
          subtotalIncl,
          parcels,
          currency: "ZAR",
        })
      : await resolvePlatformDeliveryOption({ shopperArea, subtotalIncl });

    if (!resolved?.available) {
      return err(400, "Delivery Area Not Supported", "Delivery is not available for this address.", {
        supported: false,
        canPlaceOrder: false,
        reasonCode: "OUTSIDE_SERVICE_AREA",
      });
    }

    return ok({
      supported: true,
      canPlaceOrder: true,
      fee: {
        amount: Number(resolved?.amountIncl || 0),
        currency: "ZAR",
        band: resolved?.matchedRule?.label || resolved?.kind || null,
        reason: formatReason(resolved?.kind),
      },
      deliveryType: resolved?.kind || null,
      leadTimeDays: resolved?.leadTimeDays ?? null,
      cutoffTime: resolved?.cutoffTime || null,
      matchedRule: resolved?.matchedRule || null,
      distanceKm: resolved?.distanceKm ?? null,
      shipmentSummary: resolved?.shipmentSummary || null,
      metadata: resolved?.metadata || null,
    });
  } catch (e) {
    return err(500, "Delivery Fee Error", e?.message || "Unexpected error.");
  }
}
