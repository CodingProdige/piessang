export type DeliveryMethodKind =
  | "collection"
  | "local_delivery"
  | "country_shipping"
  | "courier_live_rate"
  | "unavailable";

export type ShipmentAddress = {
  country: string;
  region?: string | null;
  city?: string | null;
  suburb?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type ShipmentParcel = {
  actualWeightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  volumetricWeightKg: number | null;
  billableWeightKg: number | null;
  parcelPreset?: string | null;
  shippingClass?: string | null;
  fragile?: boolean;
  hazmat?: boolean;
  temperatureControlled?: boolean;
};

export type ParcelPresetKey =
  | "courier_bag"
  | "fashion_satchel"
  | "small_box"
  | "medium_box"
  | "large_box"
  | "shoe_box"
  | "small_accessory"
  | "standard_box"
  | "bulky_box";

export type SellerCountryShippingRule = {
  id: string;
  country: string;
  flatFee: number;
  freeAboveOrderValue: number | null;
  leadTimeDays: number;
  cutoffTime: string | null;
  isActive: boolean;
};

export type SellerShippingProfile = {
  origin: {
    country: string;
    region: string;
    city: string;
    suburb: string;
    postalCode: string;
    latitude: number | null;
    longitude: number | null;
    utcOffsetMinutes: number | null;
  };
  localDelivery: {
    enabled: boolean;
    radiusKm: number;
    flatFee: number;
    freeAboveOrderValue: number | null;
    leadTimeDays: number;
    cutoffTime: string | null;
  };
  countryShipping: SellerCountryShippingRule[];
  collection: {
    enabled: boolean;
    leadTimeDays: number;
  };
  notes: string;
};

export type VariantShippingProfile = {
  parcelPreset: string | null;
  actualWeightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  volumetricWeightKg: number | null;
  billableWeightKg: number | null;
  shippingClass: string | null;
  fragile: boolean;
  hazmat: boolean;
  temperatureControlled: boolean;
};

export type VariantMerchandisingProfile = {
  size: string | null;
  condition: string | null;
};

export type ShippingRateQuote = {
  method: DeliveryMethodKind;
  carrier: string | null;
  service: string | null;
  amountIncl: number;
  currency: string;
  leadTimeDays: number | null;
  cutoffTime: string | null;
  available: boolean;
  reasonCode: string | null;
  reasons: string[];
  metadata?: Record<string, unknown>;
};

export type CourierRateRequest = {
  sellerId: string;
  sellerShippingProfile: SellerShippingProfile;
  origin: ShipmentAddress;
  destination: ShipmentAddress;
  parcels: ShipmentParcel[];
  subtotalIncl: number;
  currency: string;
};

export type CourierShipmentRequest = {
  sellerId: string;
  orderId: string;
  origin: ShipmentAddress;
  destination: ShipmentAddress;
  parcels: ShipmentParcel[];
  serviceCode?: string | null;
  metadata?: Record<string, unknown>;
};

export type CourierTrackingEvent = {
  code: string;
  label: string;
  occurredAt: string | null;
  location?: string | null;
  detail?: string | null;
};

export type CourierShipmentResult = {
  shipmentId: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  status: string;
  metadata?: Record<string, unknown>;
};

export interface CourierAdapter {
  key: string;
  label: string;
  getRates(request: CourierRateRequest): Promise<ShippingRateQuote[]>;
  createShipment(request: CourierShipmentRequest): Promise<CourierShipmentResult>;
  trackShipment(input: { shipmentId?: string | null; trackingNumber?: string | null }): Promise<CourierTrackingEvent[]>;
  cancelShipment(input: { shipmentId?: string | null; trackingNumber?: string | null }): Promise<{ ok: boolean; message?: string | null }>;
}

function roundMetric(value: number, digits = 3) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

export function sanitizePositiveNumber(value: unknown, fallback: number | null = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

export function computeVolumetricWeightKg({
  lengthCm,
  widthCm,
  heightCm,
  divisor = 5000,
}: {
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  divisor?: number;
}) {
  const safeLength = sanitizePositiveNumber(lengthCm, null);
  const safeWidth = sanitizePositiveNumber(widthCm, null);
  const safeHeight = sanitizePositiveNumber(heightCm, null);
  if (safeLength == null || safeWidth == null || safeHeight == null || divisor <= 0) return null;
  return roundMetric((safeLength * safeWidth * safeHeight) / divisor);
}

export function computeBillableWeightKg({
  actualWeightKg,
  volumetricWeightKg,
}: {
  actualWeightKg?: number | null;
  volumetricWeightKg?: number | null;
}) {
  const actual = sanitizePositiveNumber(actualWeightKg, null);
  const volumetric = sanitizePositiveNumber(volumetricWeightKg, null);
  if (actual == null && volumetric == null) return null;
  return roundMetric(Math.max(actual || 0, volumetric || 0));
}

export function normalizePresetKey(value: unknown): ParcelPresetKey | null {
  const input = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    input === "courier_bag" ||
    input === "fashion_satchel" ||
    input === "small_box" ||
    input === "medium_box" ||
    input === "large_box" ||
    input === "shoe_box" ||
    input === "small_accessory"
  ) {
    return input;
  }
  if (input === "standard_box") return "medium_box";
  if (input === "bulky_box") return "large_box";
  return null;
}

export function getParcelPresetDefaults(preset: ParcelPresetKey | null): Partial<VariantShippingProfile> {
  switch (preset) {
    case "courier_bag":
      return { lengthCm: 28, widthCm: 22, heightCm: 3, actualWeightKg: 0.2, shippingClass: "courier_bag" };
    case "fashion_satchel":
      return { lengthCm: 35, widthCm: 28, heightCm: 4, actualWeightKg: 0.35, shippingClass: "fashion_satchel" };
    case "small_box":
      return { lengthCm: 22, widthCm: 16, heightCm: 8, actualWeightKg: 0.8, shippingClass: "small_box" };
    case "medium_box":
      return { lengthCm: 30, widthCm: 24, heightCm: 18, actualWeightKg: 2.5, shippingClass: "medium_box" };
    case "large_box":
      return { lengthCm: 60, widthCm: 45, heightCm: 40, actualWeightKg: 10, shippingClass: "large_box" };
    case "shoe_box":
      return { lengthCm: 34, widthCm: 22, heightCm: 13, actualWeightKg: 1.2, shippingClass: "small_parcel" };
    case "small_accessory":
      return { lengthCm: 18, widthCm: 12, heightCm: 6, actualWeightKg: 0.25, shippingClass: "small_parcel" };
    case "standard_box":
      return { lengthCm: 30, widthCm: 24, heightCm: 18, actualWeightKg: 2.5, shippingClass: "medium_box" };
    case "bulky_box":
      return { lengthCm: 60, widthCm: 45, heightCm: 40, actualWeightKg: 10, shippingClass: "large_box" };
    default:
      return {};
  }
}

export function buildVariantShippingProfile(input: Partial<VariantShippingProfile> = {}): VariantShippingProfile {
  const normalizedPreset = normalizePresetKey(input.parcelPreset);
  const presetDefaults = getParcelPresetDefaults(normalizedPreset);
  const volumetricWeightKg =
    sanitizePositiveNumber(input.volumetricWeightKg, null) ??
    computeVolumetricWeightKg({
      lengthCm: sanitizePositiveNumber(input.lengthCm, null) ?? sanitizePositiveNumber(presetDefaults.lengthCm, null),
      widthCm: sanitizePositiveNumber(input.widthCm, null) ?? sanitizePositiveNumber(presetDefaults.widthCm, null),
      heightCm: sanitizePositiveNumber(input.heightCm, null) ?? sanitizePositiveNumber(presetDefaults.heightCm, null),
    });
  const actualWeightKg =
    sanitizePositiveNumber(input.actualWeightKg, null) ?? sanitizePositiveNumber(presetDefaults.actualWeightKg, null);
  return {
    parcelPreset: normalizedPreset,
    actualWeightKg,
    lengthCm: sanitizePositiveNumber(input.lengthCm, null) ?? sanitizePositiveNumber(presetDefaults.lengthCm, null),
    widthCm: sanitizePositiveNumber(input.widthCm, null) ?? sanitizePositiveNumber(presetDefaults.widthCm, null),
    heightCm: sanitizePositiveNumber(input.heightCm, null) ?? sanitizePositiveNumber(presetDefaults.heightCm, null),
    volumetricWeightKg,
    billableWeightKg: computeBillableWeightKg({ actualWeightKg, volumetricWeightKg }),
    shippingClass:
      (input.shippingClass ? String(input.shippingClass).trim() : null) ??
      (presetDefaults.shippingClass ? String(presetDefaults.shippingClass).trim() : null),
    fragile: input.fragile === true,
    hazmat: input.hazmat === true,
    temperatureControlled: input.temperatureControlled === true,
  };
}

export function inferRecommendedParcelPreset({
  category,
  subCategory,
  size,
  condition,
}: {
  category?: string | null;
  subCategory?: string | null;
  size?: string | null;
  condition?: string | null;
}): ParcelPresetKey | null {
  const categoryText = typeof category === "string" ? category.trim().toLowerCase() : "";
  const subCategoryText = typeof subCategory === "string" ? subCategory.trim().toLowerCase() : "";
  const sizeText = typeof size === "string" ? size.trim().toLowerCase() : "";
  const conditionText = typeof condition === "string" ? condition.trim().toLowerCase() : "";

  if (categoryText.includes("pre-loved") || categoryText.includes("preloved")) {
    if (subCategoryText.includes("shoes") || subCategoryText.includes("sneakers")) return "shoe_box";
    if (sizeText) return "fashion_satchel";
    if (conditionText) return "small_accessory";
  }

  if (
    categoryText.includes("fashion") ||
    categoryText.includes("clothing") ||
    subCategoryText.includes("shirt") ||
    subCategoryText.includes("dress") ||
    subCategoryText.includes("jacket") ||
    subCategoryText.includes("pants")
  ) {
    return "fashion_satchel";
  }

  if (subCategoryText.includes("shoes") || subCategoryText.includes("sneakers")) return "shoe_box";
  if (subCategoryText.includes("jewellery") || subCategoryText.includes("accessory")) return "small_accessory";
  return null;
}

export function buildShipmentParcel(input: Partial<ShipmentParcel> = {}): ShipmentParcel {
  const volumetricWeightKg =
    sanitizePositiveNumber(input.volumetricWeightKg, null) ??
    computeVolumetricWeightKg({
      lengthCm: sanitizePositiveNumber(input.lengthCm, null),
      widthCm: sanitizePositiveNumber(input.widthCm, null),
      heightCm: sanitizePositiveNumber(input.heightCm, null),
    });
  const actualWeightKg = sanitizePositiveNumber(input.actualWeightKg, null);
  return {
    actualWeightKg,
    lengthCm: sanitizePositiveNumber(input.lengthCm, null),
    widthCm: sanitizePositiveNumber(input.widthCm, null),
    heightCm: sanitizePositiveNumber(input.heightCm, null),
    volumetricWeightKg,
    billableWeightKg: computeBillableWeightKg({ actualWeightKg, volumetricWeightKg }),
    parcelPreset: input.parcelPreset ? String(input.parcelPreset).trim() : null,
    shippingClass: input.shippingClass ? String(input.shippingClass).trim() : null,
    fragile: input.fragile === true,
    hazmat: input.hazmat === true,
    temperatureControlled: input.temperatureControlled === true,
  };
}

export function buildShipmentParcelFromVariant(input: Record<string, unknown> | null | undefined): ShipmentParcel | null {
  const source = (input || {}) as Record<string, unknown>;
  const logistics = (source.logistics && typeof source.logistics === "object" ? source.logistics : source) as Record<string, unknown>;
  const actualWeightKg = sanitizePositiveNumber(
    logistics.actualWeightKg ?? logistics.actual_weight_kg ?? logistics.weightKg ?? logistics.weight_kg,
    null,
  );
  const lengthCm = sanitizePositiveNumber(logistics.lengthCm ?? logistics.length_cm, null);
  const widthCm = sanitizePositiveNumber(logistics.widthCm ?? logistics.width_cm, null);
  const heightCm = sanitizePositiveNumber(logistics.heightCm ?? logistics.height_cm, null);
  const parcelPreset = logistics.parcelPreset ?? logistics.parcel_preset;
  const shippingClass = logistics.shippingClass ?? logistics.shipping_class;
  const volumetricWeightKg = sanitizePositiveNumber(
    logistics.volumetricWeightKg ?? logistics.volumetric_weight_kg,
    null,
  );
  const billableWeightKg = sanitizePositiveNumber(
    logistics.billableWeightKg ?? logistics.billable_weight_kg,
    null,
  );

  if (
    actualWeightKg == null &&
    lengthCm == null &&
    widthCm == null &&
    heightCm == null &&
    !parcelPreset &&
    !shippingClass &&
    volumetricWeightKg == null &&
    billableWeightKg == null
  ) {
    return null;
  }

  return buildShipmentParcel({
    actualWeightKg,
    lengthCm,
    widthCm,
    heightCm,
    volumetricWeightKg,
    billableWeightKg,
    parcelPreset: parcelPreset ? String(parcelPreset).trim() : null,
    shippingClass: shippingClass ? String(shippingClass).trim() : null,
  });
}

export function summarizeShipmentParcels(parcels: ShipmentParcel[] = []) {
  return parcels.reduce(
    (summary, parcel) => {
      summary.parcelCount += 1;
      summary.actualWeightKg = roundMetric(summary.actualWeightKg + (sanitizePositiveNumber(parcel.actualWeightKg, 0) || 0));
      summary.billableWeightKg = roundMetric(summary.billableWeightKg + (sanitizePositiveNumber(parcel.billableWeightKg, 0) || 0));
      return summary;
    },
    { parcelCount: 0, actualWeightKg: 0, billableWeightKg: 0 },
  );
}

export function createEmptySellerShippingProfile(): SellerShippingProfile {
  return {
    origin: {
      country: "",
      region: "",
      city: "",
      suburb: "",
      postalCode: "",
      latitude: null,
      longitude: null,
      utcOffsetMinutes: null,
    },
    localDelivery: {
      enabled: false,
      radiusKm: 0,
      flatFee: 0,
      freeAboveOrderValue: null,
      leadTimeDays: 1,
      cutoffTime: null,
    },
    countryShipping: [],
    collection: {
      enabled: false,
      leadTimeDays: 0,
    },
    notes: "",
  };
}
