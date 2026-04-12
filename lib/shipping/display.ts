import { formatCurrency as formatDeliveryCurrency, resolveSellerDeliveryOption } from "@/lib/seller/delivery-profile";
import { buildShipmentParcelFromVariant } from "@/lib/shipping/contracts";

type ShopperDeliveryAreaLike = {
  city?: string | null;
  suburb?: string | null;
  province?: string | null;
  stateProvinceRegion?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type VariantLike = {
  logistics?: {
    parcel_preset?: string | null;
    shipping_class?: string | null;
    weight_kg?: number | null;
    length_cm?: number | null;
    width_cm?: number | null;
    height_cm?: number | null;
    volumetric_weight_kg?: number | null;
    billable_weight_kg?: number | null;
  } | null;
} | null;

type DeliveryProfileLike = Record<string, unknown> | null | undefined;

export type ShopperFacingDeliveryTone = "success" | "danger" | "warning" | "neutral";

export type ShopperFacingDeliveryPromise = {
  label: string;
  cutoffText: string | null;
};

export type ShopperFacingDeliveryMessage = {
  label: string;
  tone: ShopperFacingDeliveryTone;
};

function parseCutoffMinutes(cutoff?: string | null) {
  if (!cutoff) return null;
  const [hoursRaw, minutesRaw] = String(cutoff).split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function getZonedNow(offsetMinutes?: number | null) {
  const now = new Date();
  if (!Number.isFinite(Number(offsetMinutes))) return now;
  return new Date(now.getTime() + Number(offsetMinutes) * 60_000 + now.getTimezoneOffset() * 60_000);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function resolveShopperDelivery(
  profile: DeliveryProfileLike,
  sellerBaseLocation: string,
  shopperArea: ShopperDeliveryAreaLike | null,
  variant?: VariantLike,
) {
  if (!profile) return null;
  const parcel = buildShipmentParcelFromVariant(variant || null);
  return resolveSellerDeliveryOption({
    profile,
    sellerBaseLocation,
    shopperArea: shopperArea as any,
    parcels: parcel ? [parcel] : [],
  } as any);
}

function hasPreciseShopperArea(shopperArea: ShopperDeliveryAreaLike | null) {
  if (!shopperArea) return false;
  return Boolean(
    shopperArea.city ||
      shopperArea.suburb ||
      shopperArea.province ||
      shopperArea.stateProvinceRegion ||
      shopperArea.postalCode ||
      Number.isFinite(Number(shopperArea.latitude)) ||
      Number.isFinite(Number(shopperArea.longitude)),
  );
}

export function getShopperFacingDeliveryPromise({
  fulfillmentMode,
  profile,
  sellerBaseLocation,
  shopperArea,
  variant,
}: {
  fulfillmentMode?: string | null;
  profile?: DeliveryProfileLike;
  sellerBaseLocation?: string | null;
  shopperArea: ShopperDeliveryAreaLike | null;
  variant?: VariantLike;
}): ShopperFacingDeliveryPromise | null {
  if (String(fulfillmentMode ?? "").trim().toLowerCase() !== "seller") return null;
  const resolved = resolveShopperDelivery(profile, sellerBaseLocation || "", shopperArea, variant);
  if (!resolved?.available || typeof resolved.leadTimeDays !== "number") return null;

  const leadTimeDays = Number(resolved.leadTimeDays);
  if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0) return null;

  const now = getZonedNow((resolved as any)?.utcOffsetMinutes);
  const cutoffValue = (resolved as any)?.cutoffTime || null;
  const cutoffMinutes = parseCutoffMinutes(cutoffValue);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const afterCutoff = cutoffMinutes == null ? false : nowMinutes >= cutoffMinutes;
  const promisedDate = new Date(now);
  promisedDate.setDate(promisedDate.getDate() + leadTimeDays + (afterCutoff ? 1 : 0));
  const daysUntilDelivery = Math.max(
    0,
    Math.round((startOfDay(promisedDate).getTime() - startOfDay(now).getTime()) / 86_400_000),
  );

  const cutoffText = cutoffValue ? `Order by ${cutoffValue}` : null;
  const formatDate = new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  if (daysUntilDelivery <= 1) {
    return {
      label: daysUntilDelivery === 0 ? "Delivered today" : "Delivered tomorrow",
      cutoffText: afterCutoff ? null : cutoffText,
    };
  }

  return {
    label: `Get it by ${formatDate.format(promisedDate)}`,
    cutoffText: null,
  };
}

export function getShopperFacingDeliveryMessage({
  fulfillmentMode,
  profile,
  sellerBaseLocation,
  shopperArea,
  variant,
  platformLabel = "Piessang shipping available",
  missingProfileLabel,
}: {
  fulfillmentMode?: string | null;
  profile?: DeliveryProfileLike;
  sellerBaseLocation?: string | null;
  shopperArea: ShopperDeliveryAreaLike | null;
  variant?: VariantLike;
  platformLabel?: string;
  missingProfileLabel?: string;
}): ShopperFacingDeliveryMessage {
  const normalizedMode = String(fulfillmentMode ?? "").trim().toLowerCase();
  if (normalizedMode !== "seller") {
    return { label: platformLabel, tone: "neutral" };
  }

  if (!profile) {
    return {
      label: missingProfileLabel || (shopperArea ? "Check delivery with seller" : "Set your shipping location"),
      tone: "neutral",
    };
  }

  const resolved = resolveShopperDelivery(profile, sellerBaseLocation || "", shopperArea, variant);
  if (!resolved) {
    return { label: missingProfileLabel || "Check delivery with seller", tone: "neutral" };
  }

  if (resolved.kind === "collection") {
    return { label: "Collection available from seller", tone: "neutral" };
  }
  if (resolved.kind === "direct") {
    return {
      label:
        resolved.amountIncl > 0
          ? `Local delivery ${formatDeliveryCurrency(resolved.amountIncl)}`
          : shopperArea?.country
            ? `Local delivery in ${shopperArea.country}`
            : "Local delivery available",
      tone: "success",
    };
  }
  if (resolved.kind === "shipping") {
    return {
      label:
        resolved.amountIncl > 0
          ? `Shipping ${formatDeliveryCurrency(resolved.amountIncl)}`
          : shopperArea?.country
            ? `Ships to ${shopperArea.country}`
            : "Shipping available",
      tone: "success",
    };
  }

  if (shopperArea?.country && !hasPreciseShopperArea(shopperArea)) {
    return {
      label: "Delivery availability confirmed at checkout",
      tone: "warning",
    };
  }

  return {
    label: resolved.label,
    tone: shopperArea ? "danger" : "neutral",
  };
}
