"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { decode } from "blurhash";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { useAuth } from "@/components/auth/auth-provider";
import { BlurhashImage } from "@/components/shared/blurhash-image";
import { GoogleAdminRegionSelect } from "@/components/shared/google-admin-region-select";
import { GooglePlacePickerModal } from "@/components/shared/google-place-picker-modal";
import { PhoneInput, combinePhoneNumber, sanitizePhoneLocalNumber, splitPhoneNumber } from "@/components/shared/phone-input";
import { AppSnackbar } from "@/components/ui/app-snackbar";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { PlatformPopover, PopoverHintTrigger } from "@/components/ui/platform-popover";
import { SHOPPER_COUNTRY_OPTIONS } from "@/components/products/delivery-area-gate";
import { getFlagEmoji } from "@/lib/currency/display-currency";
import { clientStorage } from "@/lib/firebase";
import { prepareImageAsset } from "@/lib/client/image-prep";
import { COUNTRY_CATALOG, normalizeCountryCode } from "@/lib/marketplace/country-config";
import { SUPPORTED_PAYOUT_COUNTRIES, getDefaultPayoutCurrency } from "@/lib/seller/payout-config";
import { normalizeShippingSettings } from "@/lib/shipping/settings";

type SellerBranding = {
  bannerImageUrl: string;
  bannerBlurHashUrl: string;
  bannerAltText: string;
  bannerObjectPosition: string;
  logoImageUrl: string;
  logoBlurHashUrl: string;
  logoAltText: string;
  logoObjectPosition: string;
};

type PricingRule = {
  id: string;
  label: string;
  minDistanceKm: string;
  maxDistanceKm: string;
  minOrderValue: string;
  maxOrderValue: string;
  fee: string;
  freeAboveOrderValue: string;
  pricingBasis?: string;
};

type ShippingZone = {
  id: string;
  label: string;
  scopeType: string;
  country: string;
  region: string;
  city: string;
  postalCodes: string;
  leadTimeDays: string;
  cutoffTime: string;
  rateMode: string;
  pricingBasis: string;
  courierKey: string;
  courierServiceLabel: string;
  pricingRules: PricingRule[];
  isFallback: boolean;
};

type SellerDeliveryProfile = {
  origin: {
    streetAddress: string;
    addressLine2: string;
    country: string;
    region: string;
    city: string;
    suburb: string;
    postalCode: string;
    utcOffsetMinutes: string;
    latitude: string;
    longitude: string;
  };
  directDelivery: {
    enabled: boolean;
    leadTimeDays: string;
    cutoffTime: string;
    pricingRules: PricingRule[];
  };
  shippingZones: ShippingZone[];
  pickup: {
    enabled: boolean;
    leadTimeDays: string;
  };
  notes: string;
};

type SellerCourierProfile = {
  enabled: boolean;
  handoverMode: "pickup" | "dropoff";
  allowedCouriers: string[];
};

type SellerShippingRateDraft = {
  pricingMode: "flat" | "weight_based" | "order_value_based" | "tiered" | "free_over_threshold";
  flatRate: string;
  weightBased: {
    baseRate: string;
    includedKg: string;
    additionalRatePerKg: string;
    roundUpToNextKg: boolean;
  };
  orderValueBased: Array<{ minOrderValue: string; maxOrderValue: string; rate: string }>;
  tiered: Array<{ minWeightKg: string; maxWeightKg: string; rate: string }>;
  freeOverThreshold: {
    threshold: string;
    fallbackRate: string;
  };
};

type SellerShippingZoneDraft = {
  id: string;
  name: string;
  enabled: boolean;
  countryCode: string;
  coverageType: "country" | "province" | "postal_code_group";
  provinces: Array<{
    province: string;
    placeId?: string;
    enabled: boolean;
    rateOverrideEnabled: boolean;
    rateOverride: SellerShippingRateDraft;
    batching: {
      enabled: boolean;
      mode: "single_shipping_fee" | "highest_item_shipping" | "combine_weight" | "per_item";
      maxBatchLimit: string;
    };
    estimatedDeliveryDays: {
      min: string;
      max: string;
    };
  }>;
  postalCodeGroups: Array<{
    name: string;
    coverageMode?: "exact" | "range";
    postalCodes: string;
    rangeFrom: string;
    rangeTo: string;
    rateOverrideEnabled: boolean;
    rateOverride: SellerShippingRateDraft;
    batching: {
      enabled: boolean;
      mode: "single_shipping_fee" | "highest_item_shipping" | "combine_weight" | "per_item";
      maxBatchLimit: string;
    };
    estimatedDeliveryDays: {
      min: string;
      max: string;
    };
  }>;
  defaultRate: SellerShippingRateDraft;
  batching: {
    enabled: boolean;
    mode: "single_shipping_fee" | "highest_item_shipping" | "combine_weight" | "per_item";
    maxBatchLimit: string;
  };
  estimatedDeliveryDays: {
    min: string;
    max: string;
  };
  currency: string;
};

type SellerShippingSettings = {
  shipsFrom: {
    countryCode: string;
    province: string;
    city: string;
    postalCode: string;
    streetAddress: string;
    addressLine2: string;
    suburb: string;
    utcOffsetMinutes: number | null;
    latitude: number | null;
    longitude: number | null;
  };
  localDelivery: {
    enabled: boolean;
    mode: "province" | "postal_code_group";
  provinces: Array<{
    province: string;
    placeId?: string;
    enabled: boolean;
    rateOverrideEnabled: boolean;
    rateOverride: SellerShippingRateDraft;
    batching: {
      enabled: boolean;
      mode: "single_shipping_fee" | "highest_item_shipping" | "combine_weight" | "per_item";
      maxBatchLimit: string;
    };
    estimatedDeliveryDays: {
      min: string;
      max: string;
    };
  }>;
    postalCodeGroups: Array<{
      name: string;
      coverageMode?: "exact" | "range";
      postalCodes: string;
      rangeFrom: string;
      rangeTo: string;
      rateOverrideEnabled: boolean;
      rateOverride: SellerShippingRateDraft;
      batching: {
        enabled: boolean;
        mode: "single_shipping_fee" | "highest_item_shipping" | "combine_weight" | "per_item";
        maxBatchLimit: string;
      };
      estimatedDeliveryDays: {
        min: string;
        max: string;
      };
    }>;
    defaultRate: SellerShippingRateDraft;
    batching: {
      enabled: boolean;
      mode: "single_shipping_fee" | "highest_item_shipping" | "combine_weight" | "per_item";
      maxBatchLimit: string;
    };
    estimatedDeliveryDays: {
      min: string;
      max: string;
    };
    currency: string;
  };
  zones: SellerShippingZoneDraft[];
};

type SellerPayoutProfile = {
  provider: string;
  payoutMethod: string;
  accountHolderName: string;
  bankName: string;
  bankCountry: string;
  bankAddress: string;
  branchCode: string;
  accountNumber: string;
  iban: string;
  swiftBic: string;
  routingNumber: string;
  accountType: string;
  country: string;
  currency: string;
  beneficiaryReference: string;
  beneficiaryAddressLine1: string;
  beneficiaryAddressLine2: string;
  beneficiaryCity: string;
  beneficiaryRegion: string;
  beneficiaryPostalCode: string;
  beneficiaryCountry: string;
  verificationStatus: string;
  verificationNotes: string;
  stripeRecipientAccountId: string;
  stripeRecipientEntityType: string;
  stripeRecipientCountry: string;
  stripeLastAccountLinkCreatedAt: string;
  wiseProfileId: string;
  wiseRecipientId: string;
  wiseRecipientStatus: string;
  wiseRequirementType: string;
  wiseRequirements: Array<{
    key: string;
    label: string;
    required: boolean;
    refreshRequirementsOnChange?: boolean;
    values?: Array<{ value: string; label: string }>;
  }>;
  wiseDetails: Record<string, string>;
  onboardingStatus: string;
  payoutMethodEnabled: boolean;
  lastCollectionLinkSentAt: string;
  recipientEmail: string;
  lastVerifiedAt: string;
};

type SellerBusinessDetails = {
  companyName: string;
  registrationNumber: string;
  vatNumber: string;
  email: string;
  phoneNumber: string;
  addressText: string;
};

type SellerSettingsWorkspaceProps = {
  sellerSlug: string;
  vendorName: string;
  sellerRole: string;
  isSystemAdmin?: boolean;
  visibleSections?: SellerSettingsSectionKey[];
  showDangerZone?: boolean;
  onSettingsSaved?: () => void;
};

export type SellerSettingsSectionKey = "profile" | "branding" | "shipping" | "business" | "payouts";

const EMPTY_BRANDING: SellerBranding = {
  bannerImageUrl: "",
  bannerBlurHashUrl: "",
  bannerAltText: "",
  bannerObjectPosition: "center center",
  logoImageUrl: "",
  logoBlurHashUrl: "",
  logoAltText: "",
  logoObjectPosition: "center center",
};

const EMPTY_DELIVERY_PROFILE: SellerDeliveryProfile = {
  origin: {
    streetAddress: "",
    addressLine2: "",
    country: "",
    region: "",
    city: "",
    suburb: "",
    postalCode: "",
    utcOffsetMinutes: "",
    latitude: "",
    longitude: "",
  },
  directDelivery: {
    enabled: false,
    leadTimeDays: "1",
    cutoffTime: "",
    pricingRules: [],
  },
  shippingZones: [],
  pickup: {
    enabled: false,
    leadTimeDays: "0",
  },
  notes: "",
};

const EMPTY_COURIER_PROFILE: SellerCourierProfile = {
  enabled: false,
  handoverMode: "pickup",
  allowedCouriers: [],
};

function makeShippingRateDraft(): SellerShippingRateDraft {
  return {
    pricingMode: "flat",
    flatRate: "",
    weightBased: {
      baseRate: "",
      includedKg: "",
      additionalRatePerKg: "",
      roundUpToNextKg: true,
    },
    orderValueBased: [{ minOrderValue: "", maxOrderValue: "", rate: "" }],
    tiered: [{ minWeightKg: "", maxWeightKg: "", rate: "" }],
    freeOverThreshold: {
      threshold: "",
      fallbackRate: "",
    },
  };
}

function makeShippingZoneDraft(seed = Date.now()): SellerShippingZoneDraft {
  return {
    id: `zone_${seed}`,
    name: "",
    enabled: true,
    countryCode: "ZA",
    coverageType: "country",
    provinces: [],
    postalCodeGroups: [],
    defaultRate: makeShippingRateDraft(),
    batching: {
      enabled: true,
      mode: "single_shipping_fee",
      maxBatchLimit: "",
    },
    estimatedDeliveryDays: {
      min: "2",
      max: "5",
    },
    currency: "ZAR",
  };
}

const EMPTY_SHIPPING_SETTINGS: SellerShippingSettings = {
  shipsFrom: {
    countryCode: "ZA",
    province: "",
    city: "",
    postalCode: "",
    streetAddress: "",
    addressLine2: "",
    suburb: "",
    utcOffsetMinutes: null,
    latitude: null,
    longitude: null,
  },
  localDelivery: {
    enabled: false,
    mode: "province",
    provinces: [],
    postalCodeGroups: [],
    defaultRate: makeShippingRateDraft(),
    batching: {
      enabled: true,
      mode: "single_shipping_fee",
      maxBatchLimit: "",
    },
    estimatedDeliveryDays: {
      min: "1",
      max: "3",
    },
    currency: "ZAR",
  },
  zones: [],
};

const EMPTY_PAYOUT_PROFILE: SellerPayoutProfile = {
  provider: "wise",
  payoutMethod: "other_country_bank",
  accountHolderName: "",
  bankName: "",
  bankCountry: "ZA",
  bankAddress: "",
  branchCode: "",
  accountNumber: "",
  iban: "",
  swiftBic: "",
  routingNumber: "",
  accountType: "business_cheque",
  country: "ZA",
  currency: "ZAR",
  beneficiaryReference: "",
  beneficiaryAddressLine1: "",
  beneficiaryAddressLine2: "",
  beneficiaryCity: "",
  beneficiaryRegion: "",
  beneficiaryPostalCode: "",
  beneficiaryCountry: "ZA",
  verificationStatus: "not_submitted",
  verificationNotes: "",
  stripeRecipientAccountId: "",
  stripeRecipientEntityType: "",
  stripeRecipientCountry: "",
  stripeLastAccountLinkCreatedAt: "",
  wiseProfileId: "",
  wiseRecipientId: "",
  wiseRecipientStatus: "",
  wiseRequirementType: "",
  wiseRequirements: [],
  wiseDetails: {},
  onboardingStatus: "created",
  payoutMethodEnabled: false,
  lastCollectionLinkSentAt: "",
  recipientEmail: "",
  lastVerifiedAt: "",
};

const EMPTY_BUSINESS_DETAILS: SellerBusinessDetails = {
  companyName: "",
  registrationNumber: "",
  vatNumber: "",
  email: "",
  phoneNumber: "",
  addressText: "",
};

function normalizePayoutMethodValue(value: unknown) {
  const candidate = toStr(value || "same_country_bank").toLowerCase();
  if (candidate === "other_country_bank" || candidate === "international_bank") return "other_country_bank";
  return "same_country_bank";
}

function resolvePayoutMethodForCountry(value: unknown, country: unknown) {
  const payoutCountry = toStr(country || "ZA").toUpperCase();
  if (payoutCountry) return "other_country_bank";
  return normalizePayoutMethodValue(value);
}

function sanitizeLegacyPayoutNotice(value: unknown) {
  const note = toStr(value);
  if (!note) return "";
  if (note.toLowerCase().includes("stripe")) {
    return "Save your payout details and connect your payout destination to start receiving seller payouts.";
  }
  return note;
}

function normalizeWiseFieldKey(value: unknown) {
  return toStr(value).replace(/\//g, ".").trim();
}

function getWiseDetailFallback(payoutProfile: SellerPayoutProfile, key: string) {
  const normalized = normalizeWiseFieldKey(key);
  const direct = toStr(payoutProfile.wiseDetails?.[normalized]);
  if (direct) return direct;
  switch (normalized) {
    case "details.accountNumber":
      return toStr(payoutProfile.accountNumber);
    case "details.iban":
      return toStr(payoutProfile.iban);
    case "details.swiftCode":
      return toStr(payoutProfile.swiftBic);
    case "details.routingNumber":
      return toStr(payoutProfile.routingNumber);
    case "details.bankCode":
    case "details.branchCode":
      return toStr(payoutProfile.branchCode);
    case "address.country":
      return toStr(payoutProfile.beneficiaryCountry || payoutProfile.bankCountry || payoutProfile.country);
    case "address.firstLine":
      return toStr(payoutProfile.beneficiaryAddressLine1);
    case "address.secondLine":
      return toStr(payoutProfile.beneficiaryAddressLine2);
    case "address.city":
      return toStr(payoutProfile.beneficiaryCity);
    case "address.state":
      return toStr(payoutProfile.beneficiaryRegion);
    case "address.postCode":
      return toStr(payoutProfile.beneficiaryPostalCode);
    case "accountHolderName":
      return toStr(payoutProfile.accountHolderName);
    case "email":
      return toStr(payoutProfile.recipientEmail);
    case "currency":
      return toStr(payoutProfile.currency);
    case "zarIdentificationNumber":
    case "details.zarIdentificationNumber":
      return toStr(payoutProfile.wiseDetails?.zarIdentificationNumber || payoutProfile.wiseDetails?.["details.zarIdentificationNumber"]);
    default:
      return "";
  }
}

function guessWiseFieldInputMode(field: { key?: string; label?: string; values?: Array<{ value: string; label: string }> }) {
  const key = normalizeWiseFieldKey(field?.key);
  const fallback = toStr(field?.label || key).toLowerCase();
  if (Array.isArray(field?.values) && field.values.length) return "select";
  if (key.includes("wire") || fallback.includes("wire transfer")) return "boolean";
  if (key.includes("accounttype") || key.endsWith(".accountType") || fallback === "account type") return "account_type";
  if (key.includes("email")) return "email";
  if (key.includes("dateofbirth") || key.endsWith(".dob") || key.includes("birthdate") || key.includes("date")) return "date";
  if (key.includes("iban")) return "iban";
  if (key.includes("swift")) return "swift";
  if (key.includes("postcode") || key.includes("accountnumber") || key.includes("routingnumber") || key.includes("bankcode") || key.includes("branchcode")) return "text";
  return "text";
}

function getFriendlyWiseFieldLabel(field: { key?: string; label?: string }) {
  const key = normalizeWiseFieldKey(field?.key);
  const fallback = toStr(field?.label || key);
  const labelMap: Record<string, string> = {
    zarIdentificationNumber: "South African ID or registration number",
    "details.zarIdentificationNumber": "South African ID or registration number",
    "address.firstLine": "Street address",
    "address.secondLine": "Address line 2",
    "address.city": "City",
    "address.state": "Province / State",
    "address.postCode": "Postal code",
    "details.accountNumber": "Account number",
    "details.bankName": "Bank name",
    "details.dateOfBirth": "Date of birth",
    "details.iban": "IBAN",
    "details.swiftCode": "SWIFT / BIC",
    "details.routingNumber": "Routing number",
    "details.bankCode": "Branch code",
    "details.ifscCode": "IFSC code",
    "details.abartn": "Routing number",
    "details.clabe": "CLABE",
    "details.email": "Recipient email",
    accountHolderName: "Account holder name",
    email: "Recipient email",
    currency: "Payout currency",
  };
  if (labelMap[key]) return labelMap[key];

  if (fallback.toLowerCase() === "firstline") return "Street address";
  if (fallback.toLowerCase() === "secondline") return "Address line 2";
  if (fallback.toLowerCase() === "postcode") return "Postal code";
  if (fallback.toLowerCase() === "swiftcode") return "SWIFT / BIC";
  if (fallback.toLowerCase() === "bankcode") return "Branch code";
  if (fallback.toLowerCase() === "bankname") return "Bank name";
  if (fallback.toLowerCase() === "accountnumber") return "Account number";
  if (fallback.toLowerCase() === "dateofbirth") return "Date of birth";
  if (fallback.toLowerCase().includes("bankname")) return "Bank name";
  if (fallback.toLowerCase().includes("send as a wire transfer only")) return "Use wire transfer only";

  return fallback
    .replace(/\//g, " ")
    .replace(/\./g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function getWiseFieldHelpText(field: { key?: string; label?: string }) {
  const key = normalizeWiseFieldKey(field?.key);
  const fallback = toStr(field?.label || key).toLowerCase();

  if (key.includes("wire") || fallback.includes("send as a wire transfer only")) {
    return "Leave this off for a normal US bank account. Only use it if your bank says this account can receive wire transfers only.";
  }

  return "";
}

function getWiseBooleanOptions(field: { key?: string; label?: string }) {
  const key = normalizeWiseFieldKey(field?.key);
  const fallback = toStr(field?.label || key).toLowerCase();
  if (key.includes("wire") || fallback.includes("send as a wire transfer only") || fallback.includes("wire transfer")) {
    return [
      { value: "false", label: "No" },
      { value: "true", label: "Yes" },
    ];
  }
  return [];
}

function getWiseAccountTypeOptions(field: { key?: string; label?: string }) {
  const key = normalizeWiseFieldKey(field?.key);
  const fallback = toStr(field?.label || key).toLowerCase();
  if (key.includes("accounttype") || key.endsWith(".accountType") || fallback === "account type") {
    return [
      { value: "CHECKING", label: "Checking" },
      { value: "SAVINGS", label: "Savings" },
    ];
  }
  return [];
}

function getWiseFieldGroupTitle(fieldKey: unknown) {
  const key = normalizeWiseFieldKey(fieldKey);
  if (key.startsWith("address.")) return "Address details";
  if (key.startsWith("details.")) return "Bank details";
  return "Additional details";
}

function makePricingRule(seed = Date.now()) {
  return {
    id: `pricing-${seed}`,
    label: "Standard shipping",
    minDistanceKm: "",
    maxDistanceKm: "",
    minOrderValue: "",
    maxOrderValue: "",
    fee: "",
    freeAboveOrderValue: "",
  };
}

function makeShippingZone(seed = Date.now()) {
  return {
    id: `zone-${seed}`,
    label: "",
    scopeType: "country",
    country: "",
    region: "",
    city: "",
    postalCodes: "",
    leadTimeDays: "2",
    cutoffTime: "",
    rateMode: "flat",
    pricingBasis: "per_order",
    courierKey: "",
    courierServiceLabel: "",
    pricingRules: [makePricingRule(seed + 1)],
    isFallback: false,
  };
}

function normalizeCountryKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function getUnusedShippingZoneCountry(defaultCountry: string, zones: ShippingZone[], currentIndex = -1) {
  const used = new Set(
    zones
      .map((zone, index) => (index === currentIndex ? "" : normalizeCountryKey(zone.country)))
      .filter(Boolean),
  );
  return (
    SHOPPER_COUNTRY_OPTIONS.find((option) => !used.has(normalizeCountryKey(option.label)))?.label ||
    defaultCountry ||
    ""
  );
}

function ensureFlatDirectDeliveryRule(profile: SellerDeliveryProfile) {
  const existing = Array.isArray(profile.directDelivery.pricingRules) ? profile.directDelivery.pricingRules[0] : null;
  return {
    ...profile,
    directDelivery: {
      ...profile.directDelivery,
      pricingRules: [
        existing || {
          ...makePricingRule(Date.now()),
          id: "direct-flat",
          label: "Direct delivery",
        },
      ],
    },
  };
}

function getDirectDeliveryRule(profile: SellerDeliveryProfile) {
  return Array.isArray(profile.directDelivery.pricingRules) && profile.directDelivery.pricingRules.length
    ? profile.directDelivery.pricingRules[0]
    : {
        ...makePricingRule(Date.now()),
        id: "direct-flat",
        label: "Direct delivery",
      };
}

function mapShippingRateDraft(rate: any): SellerShippingRateDraft {
  const source = rate && typeof rate === "object" ? rate : {};
  return {
    pricingMode: ["weight_based", "order_value_based", "tiered", "free_over_threshold"].includes(toStr(source.pricingMode))
      ? source.pricingMode
      : "flat",
    flatRate: toStr(source.flatRate),
    weightBased: {
      baseRate: toStr(source.weightBased?.baseRate),
      includedKg: toStr(source.weightBased?.includedKg),
      additionalRatePerKg: toStr(source.weightBased?.additionalRatePerKg),
      roundUpToNextKg: source.weightBased?.roundUpToNextKg !== false,
    },
    orderValueBased: Array.isArray(source.orderValueBased) && source.orderValueBased.length
      ? source.orderValueBased.map((entry: any) => ({
          minOrderValue: toStr(entry?.minOrderValue),
          maxOrderValue: toStr(entry?.maxOrderValue),
          rate: toStr(entry?.rate),
        }))
      : [{ minOrderValue: "", maxOrderValue: "", rate: "" }],
    tiered: Array.isArray(source.tiered) && source.tiered.length
      ? source.tiered.map((entry: any) => ({
          minWeightKg: toStr(entry?.minWeightKg),
          maxWeightKg: toStr(entry?.maxWeightKg),
          rate: toStr(entry?.rate),
        }))
      : [{ minWeightKg: "", maxWeightKg: "", rate: "" }],
    freeOverThreshold: {
      threshold: toStr(source.freeOverThreshold?.threshold),
      fallbackRate: toStr(source.freeOverThreshold?.fallbackRate),
    },
  };
}

function mapShippingSettings(settings: any): SellerShippingSettings {
  const normalized = normalizeShippingSettings(settings && typeof settings === "object" ? settings : {});
  return {
    shipsFrom: {
      countryCode: toStr(normalized.shipsFrom?.countryCode || "ZA"),
      province: toStr(normalized.shipsFrom?.province),
      city: toStr(normalized.shipsFrom?.city),
      postalCode: toStr(normalized.shipsFrom?.postalCode),
      streetAddress: toStr(normalized.shipsFrom?.streetAddress),
      addressLine2: toStr(normalized.shipsFrom?.addressLine2),
      suburb: toStr(normalized.shipsFrom?.suburb),
      utcOffsetMinutes: normalized.shipsFrom?.utcOffsetMinutes ?? null,
      latitude: normalized.shipsFrom?.latitude ?? null,
      longitude: normalized.shipsFrom?.longitude ?? null,
    },
    localDelivery: {
      enabled: normalized.localDelivery?.enabled === true,
      mode: toStr(normalized.localDelivery?.mode) === "postal_code_group" ? "postal_code_group" : "province",
      provinces: Array.isArray(normalized.localDelivery?.provinces)
        ? normalized.localDelivery.provinces.map((entry: any) => ({
            province: toStr(entry?.province),
            placeId: toStr(entry?.placeId || entry?.googlePlaceId || entry?.provincePlaceId),
            enabled: entry?.enabled !== false,
            rateOverrideEnabled: !!entry?.rateOverride,
            rateOverride: mapShippingRateDraft(entry?.rateOverride),
            batching: {
              enabled: entry?.batching?.enabled !== false,
              mode: ["highest_item_shipping", "combine_weight", "per_item"].includes(toStr(entry?.batching?.mode))
                ? entry.batching.mode
                : "single_shipping_fee",
              maxBatchLimit: toStr(entry?.batching?.maxBatchLimit),
            },
            estimatedDeliveryDays: {
              min: toStr(entry?.estimatedDeliveryDays?.min),
              max: toStr(entry?.estimatedDeliveryDays?.max),
            },
          }))
        : [],
      postalCodeGroups: Array.isArray(normalized.localDelivery?.postalCodeGroups)
        ? normalized.localDelivery.postalCodeGroups.map((entry: any) => ({
            name: toStr(entry?.name),
            coverageMode: Array.isArray(entry?.postalCodes) && entry.postalCodes.length > 0 ? "exact" : toStr(entry?.postalCodeRanges?.[0]?.from) || toStr(entry?.postalCodeRanges?.[0]?.to) ? "range" : "exact",
            postalCodes: Array.isArray(entry?.postalCodes) ? entry.postalCodes.join(", ") : "",
            rangeFrom: toStr(entry?.postalCodeRanges?.[0]?.from),
            rangeTo: toStr(entry?.postalCodeRanges?.[0]?.to),
            rateOverrideEnabled: !!entry?.rateOverride,
            rateOverride: mapShippingRateDraft(entry?.rateOverride),
            batching: {
              enabled: entry?.batching?.enabled !== false,
              mode: ["highest_item_shipping", "combine_weight", "per_item"].includes(toStr(entry?.batching?.mode))
                ? entry.batching.mode
                : "single_shipping_fee",
              maxBatchLimit: toStr(entry?.batching?.maxBatchLimit),
            },
            estimatedDeliveryDays: {
              min: toStr(entry?.estimatedDeliveryDays?.min),
              max: toStr(entry?.estimatedDeliveryDays?.max),
            },
          }))
        : [],
      defaultRate: mapShippingRateDraft(normalized.localDelivery?.defaultRate),
      batching: {
        enabled: normalized.localDelivery?.batching?.enabled !== false,
        mode: ["highest_item_shipping", "combine_weight", "per_item"].includes(toStr(normalized.localDelivery?.batching?.mode))
          ? normalized.localDelivery.batching.mode
          : "single_shipping_fee",
        maxBatchLimit: toStr(normalized.localDelivery?.batching?.maxBatchLimit),
      },
      estimatedDeliveryDays: {
        min: toStr(normalized.localDelivery?.estimatedDeliveryDays?.min),
        max: toStr(normalized.localDelivery?.estimatedDeliveryDays?.max),
      },
      currency: toStr(normalized.localDelivery?.currency || "ZAR"),
    },
    zones: Array.isArray(normalized.zones)
      ? normalized.zones.map((zone: any) => ({
          id: toStr(zone.id),
          name: toStr(zone.name),
          enabled: zone.enabled !== false,
          countryCode: toStr(zone.countryCode || "ZA"),
          coverageType: ["province", "postal_code_group"].includes(toStr(zone.coverageType)) ? zone.coverageType as "province" | "postal_code_group" : "country",
          provinces: Array.isArray(zone.provinces)
            ? zone.provinces.map((entry: any) => ({
                province: toStr(entry?.province),
                placeId: toStr(entry?.placeId || entry?.googlePlaceId || entry?.provincePlaceId),
                enabled: entry?.enabled !== false,
                rateOverrideEnabled: !!entry?.rateOverride,
                rateOverride: mapShippingRateDraft(entry?.rateOverride),
                batching: {
                  enabled: entry?.batching?.enabled !== false,
                  mode: ["highest_item_shipping", "combine_weight", "per_item"].includes(toStr(entry?.batching?.mode))
                    ? entry.batching.mode
                    : "single_shipping_fee",
                  maxBatchLimit: toStr(entry?.batching?.maxBatchLimit),
                },
                estimatedDeliveryDays: {
                  min: toStr(entry?.estimatedDeliveryDays?.min),
                  max: toStr(entry?.estimatedDeliveryDays?.max),
                },
              }))
            : [],
          postalCodeGroups: Array.isArray(zone.postalCodeGroups)
            ? zone.postalCodeGroups.map((entry: any) => ({
                name: toStr(entry?.name),
                coverageMode: Array.isArray(entry?.postalCodes) && entry.postalCodes.length > 0 ? "exact" : toStr(entry?.postalCodeRanges?.[0]?.from) || toStr(entry?.postalCodeRanges?.[0]?.to) ? "range" : "exact",
                postalCodes: Array.isArray(entry?.postalCodes) ? entry.postalCodes.join(", ") : "",
                rangeFrom: toStr(entry?.postalCodeRanges?.[0]?.from),
                rangeTo: toStr(entry?.postalCodeRanges?.[0]?.to),
                rateOverrideEnabled: !!entry?.rateOverride,
                rateOverride: mapShippingRateDraft(entry?.rateOverride),
                batching: {
                  enabled: entry?.batching?.enabled !== false,
                  mode: ["highest_item_shipping", "combine_weight", "per_item"].includes(toStr(entry?.batching?.mode))
                    ? entry.batching.mode
                    : "single_shipping_fee",
                  maxBatchLimit: toStr(entry?.batching?.maxBatchLimit),
                },
                estimatedDeliveryDays: {
                  min: toStr(entry?.estimatedDeliveryDays?.min),
                  max: toStr(entry?.estimatedDeliveryDays?.max),
                },
              }))
            : [],
          defaultRate: mapShippingRateDraft(zone.defaultRate),
          batching: {
            enabled: zone.batching?.enabled !== false,
            mode: ["highest_item_shipping", "combine_weight", "per_item"].includes(toStr(zone.batching?.mode))
              ? zone.batching.mode
              : "single_shipping_fee",
            maxBatchLimit: toStr(zone.batching?.maxBatchLimit),
          },
          estimatedDeliveryDays: {
            min: toStr(zone.estimatedDeliveryDays?.min),
            max: toStr(zone.estimatedDeliveryDays?.max),
          },
          currency: "ZAR",
        }))
      : [],
  };
}

function serializeShippingRateDraft(rate: SellerShippingRateDraft) {
  return {
    pricingMode: rate.pricingMode,
    flatRate: Number(rate.flatRate || 0),
    weightBased: {
      baseRate: Number(rate.weightBased.baseRate || 0),
      includedKg: Number(rate.weightBased.includedKg || 0),
      additionalRatePerKg: Number(rate.weightBased.additionalRatePerKg || 0),
      roundUpToNextKg: rate.weightBased.roundUpToNextKg,
    },
    orderValueBased: rate.orderValueBased
      .filter((entry) => entry.minOrderValue || entry.maxOrderValue || entry.rate)
      .map((entry) => ({
        minOrderValue: Number(entry.minOrderValue || 0),
        maxOrderValue: entry.maxOrderValue === "" ? null : Number(entry.maxOrderValue || 0),
        rate: Number(entry.rate || 0),
      })),
    tiered: rate.tiered
      .filter((entry) => entry.minWeightKg || entry.maxWeightKg || entry.rate)
      .map((entry) => ({
        minWeightKg: Number(entry.minWeightKg || 0),
        maxWeightKg: entry.maxWeightKg === "" ? null : Number(entry.maxWeightKg || 0),
        rate: Number(entry.rate || 0),
      })),
    freeOverThreshold: {
      threshold: Number(rate.freeOverThreshold.threshold || 0),
      fallbackRate: Number(rate.freeOverThreshold.fallbackRate || 0),
    },
  };
}

function serializeShippingSettings(settings: SellerShippingSettings) {
  const localProvinceRules =
    settings.localDelivery.mode === "province"
      ? settings.localDelivery.provinces
          .filter((entry) => entry.province)
          .map((entry) => ({
            province: entry.province,
            placeId: toStr(entry.placeId),
            enabled: entry.enabled,
            rateOverride: entry.rateOverrideEnabled ? serializeShippingRateDraft(entry.rateOverride) : null,
            batching: {
              enabled: entry.batching.enabled,
              mode: entry.batching.mode,
              maxBatchLimit: entry.batching.maxBatchLimit === "" ? null : Number(entry.batching.maxBatchLimit),
            },
            estimatedDeliveryDays: {
              min: entry.estimatedDeliveryDays.min === "" ? null : Number(entry.estimatedDeliveryDays.min),
              max: entry.estimatedDeliveryDays.max === "" ? null : Number(entry.estimatedDeliveryDays.max),
            },
          }))
      : [];
  const localPostalCodeGroups =
    settings.localDelivery.mode === "postal_code_group"
      ? settings.localDelivery.postalCodeGroups
          .filter((entry) => entry.name || entry.postalCodes || entry.rangeFrom || entry.rangeTo)
          .map((entry) => ({
            name: entry.name,
            postalCodes: entry.postalCodes.split(",").map((value) => value.trim()).filter(Boolean),
            postalCodeRanges: entry.rangeFrom && entry.rangeTo ? [{ from: entry.rangeFrom.trim(), to: entry.rangeTo.trim() }] : [],
            rateOverride: entry.rateOverrideEnabled ? serializeShippingRateDraft(entry.rateOverride) : null,
            batching: {
              enabled: entry.batching.enabled,
              mode: entry.batching.mode,
              maxBatchLimit: entry.batching.maxBatchLimit === "" ? null : Number(entry.batching.maxBatchLimit),
            },
            estimatedDeliveryDays: {
              min: entry.estimatedDeliveryDays.min === "" ? null : Number(entry.estimatedDeliveryDays.min),
              max: entry.estimatedDeliveryDays.max === "" ? null : Number(entry.estimatedDeliveryDays.max),
            },
          }))
      : [];
  return {
    shipsFrom: {
      countryCode: settings.shipsFrom.countryCode,
      province: settings.shipsFrom.province,
      city: settings.shipsFrom.city,
      postalCode: settings.shipsFrom.postalCode,
      streetAddress: settings.shipsFrom.streetAddress,
      addressLine2: settings.shipsFrom.addressLine2,
      suburb: settings.shipsFrom.suburb,
      utcOffsetMinutes: settings.shipsFrom.utcOffsetMinutes,
      latitude: settings.shipsFrom.latitude,
      longitude: settings.shipsFrom.longitude,
    },
    localDelivery: {
      enabled: settings.localDelivery.enabled,
      mode: settings.localDelivery.mode,
      provinces: localProvinceRules,
      postalCodeGroups: localPostalCodeGroups,
      defaultRate: serializeShippingRateDraft(settings.localDelivery.defaultRate),
      batching: {
        enabled: settings.localDelivery.batching.enabled,
        mode: settings.localDelivery.batching.mode,
        maxBatchLimit: settings.localDelivery.batching.maxBatchLimit === "" ? null : Number(settings.localDelivery.batching.maxBatchLimit),
      },
      estimatedDeliveryDays: {
        min: settings.localDelivery.estimatedDeliveryDays.min === "" ? null : Number(settings.localDelivery.estimatedDeliveryDays.min),
        max: settings.localDelivery.estimatedDeliveryDays.max === "" ? null : Number(settings.localDelivery.estimatedDeliveryDays.max),
      },
      currency: settings.localDelivery.currency || "ZAR",
    },
    zones: settings.zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      enabled: zone.enabled,
      countryCode: zone.countryCode,
      coverageType: zone.coverageType,
      provinces: zone.provinces
        .filter((entry) => entry.province)
        .map((entry) => ({
          province: entry.province,
          placeId: toStr(entry.placeId),
          enabled: entry.enabled,
          rateOverride: entry.rateOverrideEnabled ? serializeShippingRateDraft(entry.rateOverride) : null,
          batching: {
            enabled: entry.batching.enabled,
            mode: entry.batching.mode,
            maxBatchLimit: entry.batching.maxBatchLimit === "" ? null : Number(entry.batching.maxBatchLimit),
          },
          estimatedDeliveryDays: {
            min: entry.estimatedDeliveryDays.min === "" ? null : Number(entry.estimatedDeliveryDays.min),
            max: entry.estimatedDeliveryDays.max === "" ? null : Number(entry.estimatedDeliveryDays.max),
          },
        })),
      postalCodeGroups: zone.postalCodeGroups
        .filter((entry) => entry.name || entry.postalCodes || entry.rangeFrom || entry.rangeTo)
        .map((entry) => ({
          name: entry.name,
          postalCodes: entry.postalCodes.split(",").map((value) => value.trim()).filter(Boolean),
          postalCodeRanges: entry.rangeFrom && entry.rangeTo ? [{ from: entry.rangeFrom.trim(), to: entry.rangeTo.trim() }] : [],
          rateOverride: entry.rateOverrideEnabled ? serializeShippingRateDraft(entry.rateOverride) : null,
          batching: {
            enabled: entry.batching.enabled,
            mode: entry.batching.mode,
            maxBatchLimit: entry.batching.maxBatchLimit === "" ? null : Number(entry.batching.maxBatchLimit),
          },
          estimatedDeliveryDays: {
            min: entry.estimatedDeliveryDays.min === "" ? null : Number(entry.estimatedDeliveryDays.min),
            max: entry.estimatedDeliveryDays.max === "" ? null : Number(entry.estimatedDeliveryDays.max),
          },
        })),
      defaultRate: serializeShippingRateDraft(zone.defaultRate),
      batching: {
        enabled: zone.batching.enabled,
        mode: zone.batching.mode,
        maxBatchLimit: zone.batching.maxBatchLimit === "" ? null : Number(zone.batching.maxBatchLimit),
      },
      estimatedDeliveryDays: {
        min: zone.estimatedDeliveryDays.min === "" ? null : Number(zone.estimatedDeliveryDays.min),
        max: zone.estimatedDeliveryDays.max === "" ? null : Number(zone.estimatedDeliveryDays.max),
      },
      currency: zone.currency || "ZAR",
    })),
  };
}

const BANNER_RATIOS = ["3:1", "16:9", "2:1"];
const LOGO_RATIOS = ["1:1", "4:3"];

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function sanitizeVendorName(value: unknown) {
  return toStr(value).replace(/\s+/g, " ").trim().slice(0, 30);
}

function sanitizeFileName(value: string) {
  return toStr(value)
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizePlacement(value: unknown) {
  const candidate = toStr(value, "center center").toLowerCase();
  const percentageMatch = candidate.match(/^(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/);
  if (percentageMatch) {
    const x = clampNumber(Number.parseFloat(percentageMatch[1]), 0, 100);
    const y = clampNumber(Number.parseFloat(percentageMatch[2]), 0, 100);
    return `${x.toFixed(1)}% ${y.toFixed(1)}%`;
  }
  const allowed = new Set(["left center", "center top", "center center", "center bottom", "right center"]);
  return allowed.has(candidate) ? candidate : "center center";
}

function parsePlacement(value: string) {
  const match = normalizePlacement(value).match(/^(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/);
  if (match) {
    return {
      x: clampNumber(Number.parseFloat(match[1]), 0, 100),
      y: clampNumber(Number.parseFloat(match[2]), 0, 100),
    };
  }

  switch (normalizePlacement(value)) {
    case "left center":
      return { x: 0, y: 50 };
    case "center top":
      return { x: 50, y: 0 };
    case "center bottom":
      return { x: 50, y: 100 };
    case "right center":
      return { x: 100, y: 50 };
    case "center center":
    default:
      return { x: 50, y: 50 };
  }
}

function placementToString(x: number, y: number) {
  return `${clampNumber(x, 0, 100).toFixed(1)}% ${clampNumber(y, 0, 100).toFixed(1)}%`;
}

function useSellerAccessLabel(role: string) {
  return useMemo(() => {
    const value = String(role ?? "").trim().toLowerCase();
    if (value === "owner") return "Seller account owner";
    if (value === "admin") return "Seller dashboard admin";
    if (value === "manager") return "Manager";
    if (value === "catalogue") return "Catalogue";
    if (value === "orders") return "Orders";
    if (value === "analytics") return "Analytics";
    return value || "Seller role";
  }, [role]);
}

function buildSettingsSnapshot(input: {
  branding: SellerBranding;
  shippingSettings: SellerShippingSettings;
  payoutProfile: SellerPayoutProfile;
  businessDetails: SellerBusinessDetails;
  vendorNameValue: string;
  vendorDescriptionValue: string;
}) {
  const payoutProfileSnapshot = {
    provider: input.payoutProfile.provider,
    payoutMethod: input.payoutProfile.payoutMethod,
    accountHolderName: input.payoutProfile.accountHolderName,
    bankName: input.payoutProfile.bankName,
    bankCountry: input.payoutProfile.bankCountry,
    bankAddress: input.payoutProfile.bankAddress,
    branchCode: input.payoutProfile.branchCode,
    accountNumber: input.payoutProfile.accountNumber,
    iban: input.payoutProfile.iban,
    swiftBic: input.payoutProfile.swiftBic,
    routingNumber: input.payoutProfile.routingNumber,
    accountType: input.payoutProfile.accountType,
    country: input.payoutProfile.country,
    currency: input.payoutProfile.currency,
    beneficiaryReference: input.payoutProfile.beneficiaryReference,
    beneficiaryAddressLine1: input.payoutProfile.beneficiaryAddressLine1,
    beneficiaryAddressLine2: input.payoutProfile.beneficiaryAddressLine2,
    beneficiaryCity: input.payoutProfile.beneficiaryCity,
    beneficiaryRegion: input.payoutProfile.beneficiaryRegion,
    beneficiaryPostalCode: input.payoutProfile.beneficiaryPostalCode,
    beneficiaryCountry: input.payoutProfile.beneficiaryCountry,
    recipientEmail: input.payoutProfile.recipientEmail,
    wiseDetails: input.payoutProfile.wiseDetails,
  };

  return JSON.stringify({
    branding: input.branding,
    shippingSettings: input.shippingSettings,
    payoutProfile: payoutProfileSnapshot,
    businessDetails: input.businessDetails,
    vendorNameValue: sanitizeVendorName(input.vendorNameValue),
    vendorDescriptionValue: toStr(input.vendorDescriptionValue).slice(0, 500),
  });
}

function formatSellerOriginSummary(origin: SellerShippingSettings["shipsFrom"]) {
  return [origin.streetAddress, origin.addressLine2, origin.suburb, origin.city, origin.province, origin.countryCode].filter(Boolean).join(", ");
}

function formatShipsFromSummary(origin: SellerShippingSettings["shipsFrom"]) {
  return [origin.city, origin.province, origin.countryCode].filter(Boolean).join(", ");
}

function getDefaultRateLabel(pricingMode: SellerShippingRateDraft["pricingMode"]) {
  if (pricingMode === "flat") return "Fallback / flat rate";
  if (pricingMode === "free_over_threshold") return "Fallback rate";
  if (pricingMode === "order_value_based") return "Fallback base rate";
  if (pricingMode === "weight_based") return "Fallback base rate";
  if (pricingMode === "tiered") return "Fallback base rate";
  return "Fallback rate";
}

function getBatchingOptionLabel(mode: "single_shipping_fee" | "highest_item_shipping" | "combine_weight" | "per_item") {
  if (mode === "single_shipping_fee") return "Per order";
  if (mode === "highest_item_shipping") return "Highest item shipping";
  if (mode === "combine_weight") return "Combine weight";
  return "Per item";
}

function getBatchLimitLabel(mode: "single_shipping_fee" | "highest_item_shipping" | "combine_weight" | "per_item") {
  if (mode === "combine_weight") return "Max batch weight (kg)";
  if (mode === "per_item") return "Max items per batch";
  if (mode === "highest_item_shipping") return "Max items in batch";
  return "Max orders in batch";
}

function getBatchLimitPlaceholder(mode: "single_shipping_fee" | "highest_item_shipping" | "combine_weight" | "per_item") {
  if (mode === "combine_weight") return "Optional kg limit";
  if (mode === "per_item") return "Optional item limit";
  if (mode === "highest_item_shipping") return "Optional item limit";
  return "Optional order limit";
}

function getPostalGroupCoverageMode(group: { coverageMode?: "exact" | "range"; postalCodes?: string; rangeFrom?: string; rangeTo?: string }): "exact" | "range" {
  if (group.coverageMode === "exact" || group.coverageMode === "range") return group.coverageMode;
  if (toStr(group.rangeFrom) || toStr(group.rangeTo)) return "range";
  return "exact";
}

function clampEtaDaysRange(current: { min: string; max: string }, next: Partial<{ min: string; max: string }>) {
  const minRaw = (next.min ?? current.min).replace(/[^\d]/g, "").slice(0, 2);
  const maxRaw = (next.max ?? current.max).replace(/[^\d]/g, "").slice(0, 2);

  let minValue = minRaw === "" ? null : Number(minRaw);
  let maxValue = maxRaw === "" ? null : Number(maxRaw);

  if (minValue !== null && maxValue !== null) {
    if (next.min !== undefined && minValue > maxValue) {
      maxValue = minValue;
    } else if (next.max !== undefined && maxValue < minValue) {
      minValue = maxValue;
    }
  }

  return {
    min: minValue === null ? "" : String(minValue),
    max: maxValue === null ? "" : String(maxValue),
  };
}

const SELLER_SHIPPING_COUNTRY_OPTIONS = COUNTRY_CATALOG.map((entry) => ({
  code: entry.code,
  label: entry.label,
  flag: getFlagEmoji(entry.code),
  displayLabel: `${getFlagEmoji(entry.code)} ${entry.label}`.trim(),
}));

function FieldHelpLabel({
  label,
  help,
  className = "",
}: {
  label: string;
  help: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`relative inline-flex items-center gap-2 ${className}`.trim()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="block text-[12px] font-semibold text-[#202020]">{label}</span>
      <PopoverHintTrigger active={open} className="h-5 w-5 justify-center rounded-full border-0 bg-[#f1f3f5] pb-0 text-[11px] font-semibold text-[#6b7280] hover:bg-[#e7eaee] hover:text-[#374151]">
        ?
      </PopoverHintTrigger>
      {open ? (
        <PlatformPopover className="left-0 right-auto top-6 z-20 mt-2 w-[min(280px,calc(100vw-64px))] px-4 py-3">
          <p className="text-[12px] leading-[1.6] text-[#4b5563]">{help}</p>
        </PlatformPopover>
      ) : null}
    </div>
  );
}

function getFallbackRateHelpText(pricingMode: SellerShippingRateDraft["pricingMode"]) {
  if (pricingMode === "flat") return "Used as the main shipping fee for this rule.";
  if (pricingMode === "free_over_threshold") return "Used when the order does not qualify for free shipping.";
  if (pricingMode === "order_value_based") return "Used only if none of the order-value bands apply.";
  if (pricingMode === "weight_based") return "Used as the base amount before extra weight charges are added.";
  if (pricingMode === "tiered") return "Used only if none of the weight bands apply.";
  return "";
}

function getOverrideRateLabel(pricingMode: SellerShippingRateDraft["pricingMode"]) {
  if (pricingMode === "flat") return "Override flat rate";
  if (pricingMode === "free_over_threshold") return "Override fallback rate";
  if (pricingMode === "order_value_based") return "Override fallback base rate";
  if (pricingMode === "weight_based") return "Override base rate";
  if (pricingMode === "tiered") return "Override fallback base rate";
  return "Override rate";
}

function formatDateTime(value?: string | null) {
  const input = toStr(value);
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function SettingsSection({
  eyebrow,
  title,
  description,
  expanded,
  onToggle,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[8px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left"
        aria-expanded={expanded}
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">{eyebrow}</p>
          <h4 className="mt-1 text-[18px] font-semibold text-[#202020]">{title}</h4>
          <p className="mt-1 text-[12px] text-[#57636c]">{description}</p>
        </div>
        <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 bg-[rgba(32,32,32,0.02)] text-[#202020]">
          <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}>
            <path
              d="M6.5 9.5 12 15l5.5-5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {expanded ? <div className="border-t border-black/5 px-5 py-5">{children}</div> : null}
    </div>
  );
}

export function SellerSettingsWorkspace({
  sellerSlug,
  vendorName,
  sellerRole,
  isSystemAdmin = false,
  visibleSections,
  showDangerZone = true,
  onSettingsSaved,
}: SellerSettingsWorkspaceProps) {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [branding, setBranding] = useState<SellerBranding>(EMPTY_BRANDING);
  const [shippingSettings, setShippingSettings] = useState<SellerShippingSettings>(EMPTY_SHIPPING_SETTINGS);
  const [payoutProfile, setPayoutProfile] = useState<SellerPayoutProfile>(EMPTY_PAYOUT_PROFILE);
  const [businessDetails, setBusinessDetails] = useState<SellerBusinessDetails>(EMPTY_BUSINESS_DETAILS);
  const [vendorNameValue, setVendorNameValue] = useState(vendorName);
  const [vendorDescriptionValue, setVendorDescriptionValue] = useState("");
  const [sellerCodeValue, setSellerCodeValue] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [bannerDragging, setBannerDragging] = useState(false);
  const [sellerCodeCopied, setSellerCodeCopied] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; tone?: "success" | "error" } | null>(null);
  const [payoutConnectBusy, setPayoutConnectBusy] = useState(false);
  const [payoutStatusLoading, setPayoutStatusLoading] = useState(false);
  const [payoutStatus, setPayoutStatus] = useState<any | null>(null);
  const [wiseRequirementOptions, setWiseRequirementOptions] = useState<Array<{ type: string; title: string; fields: SellerPayoutProfile["wiseRequirements"] }>>([]);
  const [wiseRequirementsLoading, setWiseRequirementsLoading] = useState(false);
  const [wiseRequirementsError, setWiseRequirementsError] = useState<string | null>(null);
  const [businessPhoneCountryCode, setBusinessPhoneCountryCode] = useState("27");
  const [businessPhoneLocalNumber, setBusinessPhoneLocalNumber] = useState("");
  const [sectionOpen, setSectionOpen] = useState({
    branding: true,
    shipping: true,
    business: true,
    payouts: true,
  });
  const [sellerNameCheck, setSellerNameCheck] = useState<{
    checking: boolean;
    unique: boolean | null;
    current: boolean;
    suggestions: string[];
  }>({
    checking: false,
    unique: null,
    current: false,
    suggestions: [],
  });
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const bannerStageRef = useRef<HTMLDivElement | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const snackbarTimeoutRef = useRef<number | null>(null);
  const [originPickerOpen, setOriginPickerOpen] = useState(false);
  const canEditSettings = Boolean(isSystemAdmin || ["owner", "admin"].includes(String(sellerRole ?? "").trim().toLowerCase()));
  const canDeleteSeller = Boolean(isSystemAdmin || String(sellerRole ?? "").trim().toLowerCase() === "owner");
  const visibleSectionSet = useMemo(
    () => new Set<SellerSettingsSectionKey>(Array.isArray(visibleSections) && visibleSections.length ? visibleSections : ["profile", "branding", "shipping", "business", "payouts"]),
    [visibleSections],
  );
  const standaloneSection = Array.isArray(visibleSections) && visibleSections.length === 1 ? visibleSections[0] : null;
  const publicVendorIdentifier = sellerCodeValue || profile?.sellerCode || sellerSlug;
  const publicVendorHref = publicVendorIdentifier ? `/vendors/${encodeURIComponent(publicVendorIdentifier)}` : "/products";

  const renderLoadingSkeleton = () => (
    <section className="space-y-4">
      <div className="flex justify-end">
        <div className="h-4 w-28 animate-pulse rounded-[8px] bg-black/5" />
      </div>

      <div className="rounded-[8px] border border-black/5 bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="animate-pulse space-y-4">
          <div className="space-y-2">
            <div className="h-4 w-28 rounded-[8px] bg-black/5" />
            <div className="h-7 w-56 max-w-full rounded-[8px] bg-black/5" />
            <div className="h-4 w-80 max-w-full rounded-[8px] bg-black/5" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-24 rounded-[8px] bg-black/5" />
            <div className="h-24 rounded-[8px] bg-black/5" />
          </div>
        </div>
      </div>

      <div className="rounded-[8px] border border-black/5 bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="animate-pulse space-y-4">
          <div className="space-y-2">
            <div className="h-4 w-24 rounded-[8px] bg-black/5" />
            <div className="h-7 w-52 max-w-full rounded-[8px] bg-black/5" />
            <div className="h-4 w-72 max-w-full rounded-[8px] bg-black/5" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-20 rounded-[8px] bg-black/5" />
            <div className="h-20 rounded-[8px] bg-black/5" />
            <div className="h-20 rounded-[8px] bg-black/5 md:col-span-2" />
          </div>
        </div>
      </div>

      <div className="rounded-[8px] border border-black/5 bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="animate-pulse space-y-4">
          <div className="space-y-2">
            <div className="h-4 w-24 rounded-[8px] bg-black/5" />
            <div className="h-7 w-60 max-w-full rounded-[8px] bg-black/5" />
            <div className="h-4 w-80 max-w-full rounded-[8px] bg-black/5" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-24 rounded-[8px] bg-black/5" />
            <div className="h-24 rounded-[8px] bg-black/5" />
            <div className="h-24 rounded-[8px] bg-black/5" />
            <div className="h-24 rounded-[8px] bg-black/5" />
          </div>
        </div>
      </div>
    </section>
  );

  const bannerPosition = useMemo(
    () => parsePlacement(branding.bannerObjectPosition || "50% 50%"),
    [branding.bannerObjectPosition],
  );
  const hasUnsavedChanges = useMemo(
    () =>
      savedSnapshot !== "" &&
      buildSettingsSnapshot({
        branding,
        shippingSettings,
        payoutProfile,
        businessDetails,
        vendorNameValue,
        vendorDescriptionValue,
      }) !== savedSnapshot,
    [branding, businessDetails, payoutProfile, savedSnapshot, shippingSettings, vendorDescriptionValue, vendorNameValue],
  );
  
  function showSnackbar(message: string, tone: "success" | "error" = "success") {
    setSnackbar({ message, tone });
    if (snackbarTimeoutRef.current) window.clearTimeout(snackbarTimeoutRef.current);
    snackbarTimeoutRef.current = window.setTimeout(() => setSnackbar(null), 1800);
  }

  useEffect(() => {
    const fallbackSellerCode = toStr(profile?.sellerCode);
    if (!sellerCodeValue && fallbackSellerCode) {
      setSellerCodeValue(fallbackSellerCode);
    }
  }, [profile?.sellerCode, sellerCodeValue]);

  useEffect(() => {
    if (!canEditSettings) return;

    const nextVendorName = sanitizeVendorName(vendorNameValue || vendorName);
    const currentVendorName = sanitizeVendorName(vendorName);
    if (!nextVendorName || nextVendorName.length < 3) {
      setSellerNameCheck({ checking: false, unique: null, current: false, suggestions: [] });
      return;
    }

    if (currentVendorName && nextVendorName.toLowerCase() === currentVendorName.toLowerCase()) {
      setSellerNameCheck({ checking: false, unique: null, current: true, suggestions: [] });
      return;
    }

    const controller = new AbortController();
    let requestStarted = false;
    const timeout = window.setTimeout(async () => {
      if (controller.signal.aborted) return;
      setSellerNameCheck((current) => ({ ...current, checking: true }));

      try {
        requestStarted = true;
        const response = await fetch("/api/client/v1/accounts/seller/check-vendor-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: profile?.uid,
            sellerSlug,
            vendorName: nextVendorName,
          }),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to validate vendor name.");
        }

        setSellerNameCheck({
          checking: false,
          unique: payload?.unique === true,
          current: false,
          suggestions: Array.isArray(payload?.suggestions) ? payload.suggestions : [],
        });
      } catch {
        if (!controller.signal.aborted) {
          setSellerNameCheck({ checking: false, unique: null, current: false, suggestions: [] });
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      if (requestStarted && !controller.signal.aborted) {
        controller.abort();
      }
    };
  }, [canEditSettings, profile?.uid, sellerSlug, vendorName, vendorNameValue]);

  useEffect(() => {
    const parsed = splitPhoneNumber(businessDetails.phoneNumber || "", "27");
    setBusinessPhoneCountryCode(parsed.countryCode || "27");
    setBusinessPhoneLocalNumber(parsed.localNumber || "");
  }, [businessDetails.phoneNumber]);

  useEffect(() => {
    let cancelled = false;

    async function loadBranding() {
      if (!sellerSlug) {
        if (!cancelled) setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/client/v1/accounts/seller/settings/get?sellerSlug=${encodeURIComponent(sellerSlug)}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load seller settings.");
        }

        const sellerRecord = payload?.seller && typeof payload.seller === "object" ? payload.seller : null;
        const nextBranding = payload?.branding && typeof payload.branding === "object" ? payload.branding : {};
        const nextShippingSettings = normalizeShippingSettings(
          payload?.shippingSettings && typeof payload.shippingSettings === "object" ? payload.shippingSettings : {},
        );
        const nextPayoutProfile = payload?.payoutProfile && typeof payload.payoutProfile === "object" ? payload.payoutProfile : {};
        const nextBusinessDetails = payload?.businessDetails && typeof payload.businessDetails === "object" ? payload.businessDetails : {};
        if (!cancelled && sellerRecord) {
          const nextVendorName = sanitizeVendorName(
            sellerRecord.vendorName || sellerRecord.groupVendorName || vendorName,
          );
          const nextVendorDescription = toStr(
            sellerRecord.vendorDescription || sellerRecord.description || "",
          ).slice(0, 500);
          setBranding({
            bannerImageUrl: toStr(nextBranding?.bannerImageUrl || nextBranding?.bannerUrl),
            bannerBlurHashUrl: toStr(nextBranding?.bannerBlurHashUrl || nextBranding?.bannerBlurHash),
            bannerAltText: toStr(nextBranding?.bannerAltText || nextBranding?.bannerAlt || `${nextVendorName || vendorName} banner`),
            bannerObjectPosition: normalizePlacement(nextBranding?.bannerObjectPosition),
            logoImageUrl: toStr(nextBranding?.logoImageUrl || nextBranding?.logoUrl),
            logoBlurHashUrl: toStr(nextBranding?.logoBlurHashUrl || nextBranding?.logoBlurHash),
            logoAltText: toStr(nextBranding?.logoAltText || nextBranding?.logoAlt || `${nextVendorName || vendorName} logo`),
            logoObjectPosition: normalizePlacement(nextBranding?.logoObjectPosition),
          });
          setVendorNameValue(nextVendorName || vendorName);
          setVendorDescriptionValue(nextVendorDescription);
          setShippingSettings(mapShippingSettings(nextShippingSettings));
          setPayoutProfile({
            provider: toStr(nextPayoutProfile?.provider || sellerRecord?.payoutProvider || "wise"),
            payoutMethod: resolvePayoutMethodForCountry(nextPayoutProfile?.payoutMethod, nextPayoutProfile?.country || nextPayoutProfile?.bankCountry),
            accountHolderName: toStr(nextPayoutProfile?.accountHolderName),
            bankName: toStr(nextPayoutProfile?.bankName),
            bankCountry: toStr(nextPayoutProfile?.bankCountry || "ZA"),
            bankAddress: toStr(nextPayoutProfile?.bankAddress),
            branchCode: toStr(nextPayoutProfile?.branchCode),
            accountNumber: toStr(nextPayoutProfile?.accountNumber),
            iban: toStr(nextPayoutProfile?.iban),
            swiftBic: toStr(nextPayoutProfile?.swiftBic),
            routingNumber: toStr(nextPayoutProfile?.routingNumber),
            accountType: toStr(nextPayoutProfile?.accountType || "business_cheque"),
            country: toStr(nextPayoutProfile?.country || "ZA"),
            currency: toStr(nextPayoutProfile?.currency || "ZAR"),
            beneficiaryReference: toStr(nextPayoutProfile?.beneficiaryReference),
            beneficiaryAddressLine1: toStr(nextPayoutProfile?.beneficiaryAddressLine1),
            beneficiaryAddressLine2: toStr(nextPayoutProfile?.beneficiaryAddressLine2),
            beneficiaryCity: toStr(nextPayoutProfile?.beneficiaryCity),
            beneficiaryRegion: toStr(nextPayoutProfile?.beneficiaryRegion),
            beneficiaryPostalCode: toStr(nextPayoutProfile?.beneficiaryPostalCode),
            beneficiaryCountry: toStr(nextPayoutProfile?.beneficiaryCountry || "ZA"),
            verificationStatus: toStr(nextPayoutProfile?.verificationStatus || "not_submitted"),
            verificationNotes: toStr(nextPayoutProfile?.verificationNotes),
            stripeRecipientAccountId: toStr(nextPayoutProfile?.stripeRecipientAccountId),
            stripeRecipientEntityType: toStr(nextPayoutProfile?.stripeRecipientEntityType),
            stripeRecipientCountry: toStr(nextPayoutProfile?.stripeRecipientCountry),
            stripeLastAccountLinkCreatedAt: toStr(nextPayoutProfile?.stripeLastAccountLinkCreatedAt),
            wiseProfileId: toStr(nextPayoutProfile?.wiseProfileId),
            wiseRecipientId: toStr(nextPayoutProfile?.wiseRecipientId),
            wiseRecipientStatus: toStr(nextPayoutProfile?.wiseRecipientStatus),
            wiseRequirementType: toStr(nextPayoutProfile?.wiseRequirementType),
            wiseRequirements: Array.isArray(nextPayoutProfile?.wiseRequirements) ? nextPayoutProfile.wiseRequirements : [],
            wiseDetails: nextPayoutProfile?.wiseDetails && typeof nextPayoutProfile.wiseDetails === "object" ? nextPayoutProfile.wiseDetails : {},
            onboardingStatus: toStr(nextPayoutProfile?.onboardingStatus || "created"),
            payoutMethodEnabled: nextPayoutProfile?.payoutMethodEnabled === true,
            lastCollectionLinkSentAt: toStr(nextPayoutProfile?.lastCollectionLinkSentAt),
            recipientEmail: toStr(nextBusinessDetails?.email || profile?.email || nextPayoutProfile?.recipientEmail || ""),
            lastVerifiedAt: toStr(nextPayoutProfile?.lastVerifiedAt),
          });
          setBusinessDetails({
            companyName: toStr(nextBusinessDetails?.companyName || nextVendorName || vendorName),
            registrationNumber: toStr(nextBusinessDetails?.registrationNumber),
            vatNumber: toStr(nextBusinessDetails?.vatNumber),
            email: toStr(nextBusinessDetails?.email || profile?.email || ""),
            phoneNumber: toStr(nextBusinessDetails?.phoneNumber),
            addressText: toStr(nextBusinessDetails?.addressText),
          });
          setSellerCodeValue(
            toStr(
              sellerRecord.sellerCode ||
                sellerRecord.activeSellerCode ||
                sellerRecord.groupSellerCode ||
                profile?.sellerCode,
            ),
          );
          setSavedSnapshot(
            buildSettingsSnapshot({
              branding: {
                bannerImageUrl: toStr(nextBranding?.bannerImageUrl || nextBranding?.bannerUrl),
                bannerBlurHashUrl: toStr(nextBranding?.bannerBlurHashUrl || nextBranding?.bannerBlurHash),
                bannerAltText: toStr(nextBranding?.bannerAltText || nextBranding?.bannerAlt || `${nextVendorName || vendorName} banner`),
                bannerObjectPosition: normalizePlacement(nextBranding?.bannerObjectPosition),
                logoImageUrl: toStr(nextBranding?.logoImageUrl || nextBranding?.logoUrl),
                logoBlurHashUrl: toStr(nextBranding?.logoBlurHashUrl || nextBranding?.logoBlurHash),
                logoAltText: toStr(nextBranding?.logoAltText || nextBranding?.logoAlt || `${nextVendorName || vendorName} logo`),
                logoObjectPosition: normalizePlacement(nextBranding?.logoObjectPosition),
              },
              shippingSettings: mapShippingSettings(nextShippingSettings),
              payoutProfile: {
                provider: toStr(nextPayoutProfile?.provider || sellerRecord?.payoutProvider || "wise"),
                payoutMethod: resolvePayoutMethodForCountry(nextPayoutProfile?.payoutMethod, nextPayoutProfile?.country || nextPayoutProfile?.bankCountry),
                accountHolderName: toStr(nextPayoutProfile?.accountHolderName),
                bankName: toStr(nextPayoutProfile?.bankName),
                bankCountry: toStr(nextPayoutProfile?.bankCountry || "ZA"),
                bankAddress: toStr(nextPayoutProfile?.bankAddress),
                branchCode: toStr(nextPayoutProfile?.branchCode),
                accountNumber: toStr(nextPayoutProfile?.accountNumber),
                iban: toStr(nextPayoutProfile?.iban),
                swiftBic: toStr(nextPayoutProfile?.swiftBic),
                routingNumber: toStr(nextPayoutProfile?.routingNumber),
                accountType: toStr(nextPayoutProfile?.accountType || "business_cheque"),
                country: toStr(nextPayoutProfile?.country || "ZA"),
                currency: toStr(nextPayoutProfile?.currency || "ZAR"),
                beneficiaryReference: toStr(nextPayoutProfile?.beneficiaryReference),
                beneficiaryAddressLine1: toStr(nextPayoutProfile?.beneficiaryAddressLine1),
                beneficiaryAddressLine2: toStr(nextPayoutProfile?.beneficiaryAddressLine2),
                beneficiaryCity: toStr(nextPayoutProfile?.beneficiaryCity),
                beneficiaryRegion: toStr(nextPayoutProfile?.beneficiaryRegion),
                beneficiaryPostalCode: toStr(nextPayoutProfile?.beneficiaryPostalCode),
                beneficiaryCountry: toStr(nextPayoutProfile?.beneficiaryCountry || "ZA"),
                verificationStatus: toStr(nextPayoutProfile?.verificationStatus || "not_submitted"),
                verificationNotes: toStr(nextPayoutProfile?.verificationNotes),
                stripeRecipientAccountId: toStr(nextPayoutProfile?.stripeRecipientAccountId),
                stripeRecipientEntityType: toStr(nextPayoutProfile?.stripeRecipientEntityType),
                stripeRecipientCountry: toStr(nextPayoutProfile?.stripeRecipientCountry),
                stripeLastAccountLinkCreatedAt: toStr(nextPayoutProfile?.stripeLastAccountLinkCreatedAt),
                wiseProfileId: toStr(nextPayoutProfile?.wiseProfileId),
                wiseRecipientId: toStr(nextPayoutProfile?.wiseRecipientId),
                wiseRecipientStatus: toStr(nextPayoutProfile?.wiseRecipientStatus),
                wiseRequirementType: toStr(nextPayoutProfile?.wiseRequirementType),
                wiseRequirements: Array.isArray(nextPayoutProfile?.wiseRequirements) ? nextPayoutProfile.wiseRequirements : [],
                wiseDetails: nextPayoutProfile?.wiseDetails && typeof nextPayoutProfile?.wiseDetails === "object" ? nextPayoutProfile.wiseDetails : {},
                onboardingStatus: toStr(nextPayoutProfile?.onboardingStatus || "created"),
                payoutMethodEnabled: nextPayoutProfile?.payoutMethodEnabled === true,
                lastCollectionLinkSentAt: toStr(nextPayoutProfile?.lastCollectionLinkSentAt),
                recipientEmail: toStr(nextPayoutProfile?.recipientEmail || nextBusinessDetails?.email || profile?.email || ""),
                lastVerifiedAt: toStr(nextPayoutProfile?.lastVerifiedAt),
              },
              businessDetails: {
                companyName: toStr(nextBusinessDetails?.companyName || nextVendorName || vendorName),
                registrationNumber: toStr(nextBusinessDetails?.registrationNumber),
                vatNumber: toStr(nextBusinessDetails?.vatNumber),
                email: toStr(nextBusinessDetails?.email || profile?.email || ""),
                phoneNumber: toStr(nextBusinessDetails?.phoneNumber),
                addressText: toStr(nextBusinessDetails?.addressText),
              },
              vendorNameValue: nextVendorName || vendorName,
              vendorDescriptionValue: nextVendorDescription,
            }),
          );
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load seller settings.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadBranding();

    return () => {
      cancelled = true;
    };
  }, [sellerSlug, vendorName]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      if (snackbarTimeoutRef.current) window.clearTimeout(snackbarTimeoutRef.current);
    };
  }, []);

  const payoutProvider = toStr(payoutProfile.provider || "wise").toLowerCase();
  const payoutErrorNotice = (() => {
    const message = toStr(error);
    if (!message) return "";
    const normalized = message.toLowerCase();
    if (
      normalized.includes("payout") ||
      normalized.includes("wise") ||
      normalized.includes("bank") ||
      normalized.includes("recipient") ||
      normalized.includes("routing") ||
      normalized.includes("wire") ||
      normalized.includes("swift") ||
      normalized.includes("account number") ||
      normalized.includes("postal code") ||
      normalized.includes("address")
    ) {
      return message;
    }
    return "";
  })();
  const selectedShippingZoneCountries = useMemo(
    () => shippingSettings.zones.map((zone) => normalizeCountryKey(zone.countryCode)).filter(Boolean),
    [shippingSettings.zones],
  );
  const hasDuplicateShippingZoneCountries = selectedShippingZoneCountries.length !== new Set(selectedShippingZoneCountries).size;
  const recipientId = payoutProvider === "wise" ? payoutProfile.wiseRecipientId : payoutProfile.stripeRecipientAccountId;
  const payoutRecipientReady = Boolean(
    payoutStatus?.connected ||
      payoutStatus?.payoutsEnabled === true ||
      payoutStatus?.hasBankDestination === true ||
      recipientId ||
      payoutProfile.payoutMethodEnabled === true ||
      ["verified", "ready"].includes(toStr(payoutProfile.verificationStatus || payoutProfile.onboardingStatus).toLowerCase()),
  );
  const payoutSectionVisible = visibleSectionSet.has("payouts");
  const payoutSummaryBank = payoutStatus?.bankName
    ? `${payoutStatus.bankName}${payoutStatus.accountLast4 ? ` •••• ${payoutStatus.accountLast4}` : ""}`
    : payoutStatus?.accountSummary
      ? payoutStatus.accountSummary
    : payoutStatus?.hasBankDestination
      ? "Bank account connected in Wise"
      : "Save payout details to create a Wise recipient";
  const payoutMethodLabel = toStr(payoutStatus?.enabledPayoutMethod || payoutStatus?.requestedPayoutMethod || payoutProfile.payoutMethod)
    .replace(/_/g, " ")
    .replace(/\bwire\b/i, "Wire")
    .replace(/\blocal\b/i, "Local")
    .replace(/\bother country bank\b/i, "Wire")
    .replace(/\bsame country bank\b/i, "Local");
  const payoutSummaryStatus =
    payoutStatus?.payoutsEnabled && payoutStatus?.hasBankDestination
      ? "ready for payouts"
      : payoutStatus
        ? toStr(payoutStatus?.status || payoutStatus?.onboardingStatus || "created")
        : toStr(payoutProfile.verificationStatus || (payoutRecipientReady ? "pending" : "not_started"));
  const payoutSummarySyncedAt = toStr(payoutProfile.lastVerifiedAt || payoutProfile.stripeLastAccountLinkCreatedAt);
  const payoutNoticeText = sanitizeLegacyPayoutNotice(payoutProfile.verificationNotes);
  const payoutSetupComplete =
    payoutSummaryStatus === "ready for payouts" ||
    payoutRecipientReady;
  const payoutConnectedSummary =
    payoutSummaryBank && payoutSummaryBank !== "Save payout details to create a Wise recipient" ? payoutSummaryBank : "";
  const sellerPayoutEmail = toStr(businessDetails.email || profile?.email || payoutProfile.recipientEmail || "");
  const activeWiseRequirementType =
    toStr(payoutProfile.wiseRequirementType) ||
    toStr(wiseRequirementOptions[0]?.type);
  const activeWiseRequirementFields =
    (wiseRequirementOptions.find((option) => option.type === activeWiseRequirementType)?.fields || payoutProfile.wiseRequirements || []).filter(Boolean);
  const visibleWiseRequirementFields = activeWiseRequirementFields.filter(
    (field) =>
      ![
        "accountHolderName",
        "email",
        "currency",
        "address.country",
        "legalType",
        "details.legalType",
        "recipientType",
        "details.recipientType",
      ].includes(normalizeWiseFieldKey(field.key)),
  );
  const groupedWiseRequirementFields = visibleWiseRequirementFields.reduce(
    (groups, field) => {
      const title = getWiseFieldGroupTitle(field.key);
      const existing = groups.find((group) => group.title === title);
      if (existing) {
        existing.fields.push(field);
      } else {
        groups.push({ title, fields: [field] });
      }
      return groups;
    },
    [] as Array<{ title: string; fields: typeof visibleWiseRequirementFields }>,
  );

  async function loadPayoutStatus() {
    if (!profile?.uid || !sellerSlug) return null;
    setPayoutStatusLoading(true);
    try {
      const response = await fetch(
        `/api/payouts/recipient/status?uid=${encodeURIComponent(profile.uid)}&sellerId=${encodeURIComponent(sellerSlug)}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to load payout status.");
      }
      const nextStatus = payload?.data || null;
      setPayoutStatus(nextStatus);
      return nextStatus;
    } catch (cause) {
      setPayoutStatus(null);
      showSnackbar(cause instanceof Error ? cause.message : "Unable to load payout status.", "error");
      return null;
    } finally {
      setPayoutStatusLoading(false);
    }
  }

  async function loadWiseRequirements(nextProfile?: SellerPayoutProfile) {
    const profileToUse = nextProfile || payoutProfile;
    setWiseRequirementsLoading(true);
    setWiseRequirementsError(null);
    try {
      const response = await fetch("/api/payouts/recipient/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutProfile: profileToUse,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to load payout requirements.");
      }
      const options = Array.isArray(payload?.data?.options) ? payload.data.options : [];
      const selectedType = toStr(payload?.data?.selectedType || profileToUse.wiseRequirementType || options[0]?.type);
      setWiseRequirementOptions(options);
      setPayoutProfile((current) => ({
        ...current,
        provider: payoutProvider,
        wiseRequirementType: selectedType,
        wiseRequirements: (options.find((option: any) => option.type === selectedType)?.fields || []),
      }));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to load payout requirements.";
      setWiseRequirementsError(message);
    } finally {
      setWiseRequirementsLoading(false);
    }
  }

  async function createPayoutRecipient() {
    if (!profile?.uid || !sellerSlug) return;
    if (hasUnsavedChanges) {
      const saved = await saveSettings({ showSuccessMessage: false });
      if (!saved) return;
    }
    setPayoutConnectBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/payouts/recipient/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile.uid,
          sellerId: sellerSlug,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to create the payout recipient.");
      }
      const nextUrl = toStr(payload?.data?.url);
      const nextRecipientId = toStr(payload?.data?.recipientId);
      const nextOnboardingStatus = toStr(payload?.data?.onboardingStatus || (nextRecipientId ? "ready" : ""));
      if (nextRecipientId || nextOnboardingStatus) {
        setPayoutProfile((current) => ({
          ...current,
          provider: payoutProvider,
          wiseRecipientId: nextRecipientId || current.wiseRecipientId,
          wiseRecipientStatus: nextOnboardingStatus === "ready" ? "active" : current.wiseRecipientStatus,
          onboardingStatus: nextOnboardingStatus || current.onboardingStatus,
          verificationStatus:
            nextOnboardingStatus === "ready"
              ? "verified"
              : nextOnboardingStatus
                ? "pending"
                : current.verificationStatus,
          payoutMethodEnabled: nextOnboardingStatus === "ready" ? true : current.payoutMethodEnabled,
          verificationNotes:
            nextOnboardingStatus === "ready"
              ? "Wise recipient is ready for payouts."
              : current.verificationNotes,
          lastVerifiedAt: new Date().toISOString(),
        }));
      }
      if (!nextUrl) {
        const latestStatus = await loadPayoutStatus();
        const payoutConnected = Boolean(
          latestStatus?.connected ||
            latestStatus?.payoutsEnabled === true ||
            latestStatus?.hasBankDestination === true ||
            nextRecipientId ||
            nextOnboardingStatus === "ready",
        );
        showSnackbar(
          payoutConnected
            ? payload?.data?.message || "Payout destination connected successfully."
            : payload?.data?.message || "Payout details saved. Connection still needs attention.",
          "success",
        );
        return;
      }
      window.location.href = nextUrl;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the payout recipient.");
      showSnackbar(cause instanceof Error ? cause.message : "Unable to create the payout recipient.", "error");
    } finally {
      setPayoutConnectBusy(false);
    }
  }

  useEffect(() => {
    if (!profile?.uid || !sellerSlug) return;
    void loadPayoutStatus();
  }, [profile?.uid, sellerSlug]);

  useEffect(() => {
    if (!sectionOpen.payouts) return;
    void loadWiseRequirements();
  }, [sectionOpen.payouts, payoutProfile.currency, payoutProfile.bankCountry]);

  useEffect(() => {
    if (!profile?.uid || !sellerSlug) return undefined;
    const handleFocus = () => {
      void loadPayoutStatus();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadPayoutStatus();
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [profile?.uid, sellerSlug]);

  async function uploadAsset(file: File, kind: "banner" | "logo") {
    if (!profile?.uid) throw new Error("Missing seller profile.");
    const prepared = await prepareImageAsset(file, {
      maxDimension: kind === "banner" ? 2400 : 1400,
      quality: kind === "banner" ? 0.84 : 0.88,
    });
    const safeName = prepared.file.name.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase();
    const path = `users/${profile.uid}/seller-branding/${sellerSlug}-${kind}-${Date.now()}-${safeName}`;
    const fileRef = storageRef(clientStorage, path);
    await uploadBytes(fileRef, prepared.file, { contentType: prepared.file.type });
    const imageUrl = await getDownloadURL(fileRef);

    return {
      imageUrl,
      blurHashUrl: prepared.blurHashUrl,
      altText: prepared.altText || `${vendorName} ${kind}`,
    };
  }

  async function handleUpload(kind: "banner" | "logo", file?: File | null) {
    if (!file) return;
    setError(null);

    if (kind === "banner") setBannerUploading(true);
    if (kind === "logo") setLogoUploading(true);

    try {
      const asset = await uploadAsset(file, kind);
      setBranding((current) => ({
        ...current,
        ...(kind === "banner"
          ? {
              bannerImageUrl: asset.imageUrl,
              bannerBlurHashUrl: asset.blurHashUrl,
              bannerAltText: asset.altText,
              bannerObjectPosition: "50% 50%",
            }
          : {
              logoImageUrl: asset.imageUrl,
              logoBlurHashUrl: asset.blurHashUrl,
              logoAltText: asset.altText,
            }),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload image.");
    } finally {
      if (kind === "banner") setBannerUploading(false);
      if (kind === "logo") setLogoUploading(false);
      if (bannerInputRef.current && kind === "banner") bannerInputRef.current.value = "";
      if (logoInputRef.current && kind === "logo") logoInputRef.current.value = "";
    }
  }

  async function saveSettings(options: { showSuccessMessage?: boolean } = {}) {
    const { showSuccessMessage = true } = options;
    if (!canEditSettings) {
      setError("You do not have permission to change seller settings.");
      return false;
    }
    const nextVendorName = sanitizeVendorName(vendorNameValue || vendorName);
    if (!nextVendorName) {
      setError("Vendor name is required.");
      return false;
    }
    if (sellerNameCheck.checking) {
      setError("Wait for the vendor name check to finish.");
      return false;
    }
    if (sellerNameCheck.unique === false) {
      setError("Choose a unique vendor name before saving.");
      return false;
    }
    setSaving(true);
    setError(null);
    try {
    const response = await fetch("/api/client/v1/accounts/seller/settings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile?.uid,
          sellerSlug,
          data: {
            branding,
            shippingSettings: serializeShippingSettings(shippingSettings),
            payoutProfile,
            businessDetails,
            vendorName: nextVendorName,
            vendorDescription: vendorDescriptionValue,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to save seller settings.");
      }

      const nextBranding = payload?.branding || branding;
      const nextSeller = payload?.seller || {};
      const nextPayoutProfile = payload?.payoutProfile || payoutProfile;
      const nextBusinessDetails = payload?.businessDetails || businessDetails;
      const weightRequirementState = payload?.shippingWeightRequirements || null;
      setBranding({
        bannerImageUrl: toStr(nextBranding?.bannerImageUrl),
        bannerBlurHashUrl: toStr(nextBranding?.bannerBlurHashUrl),
        bannerAltText: toStr(nextBranding?.bannerAltText),
        bannerObjectPosition: normalizePlacement(nextBranding?.bannerObjectPosition),
        logoImageUrl: toStr(nextBranding?.logoImageUrl),
        logoBlurHashUrl: toStr(nextBranding?.logoBlurHashUrl),
        logoAltText: toStr(nextBranding?.logoAltText),
        logoObjectPosition: normalizePlacement(nextBranding?.logoObjectPosition),
      });
      const nextShippingSettings = normalizeShippingSettings(payload?.shippingSettings || {});
      setShippingSettings(mapShippingSettings(nextShippingSettings));
      setPayoutProfile({
        provider: toStr(nextPayoutProfile?.provider || payload?.payoutProvider || payoutProvider || "wise"),
        payoutMethod: resolvePayoutMethodForCountry(nextPayoutProfile?.payoutMethod, nextPayoutProfile?.country || nextPayoutProfile?.bankCountry),
        accountHolderName: toStr(nextPayoutProfile?.accountHolderName),
        bankName: toStr(nextPayoutProfile?.bankName),
        bankCountry: toStr(nextPayoutProfile?.bankCountry || "ZA"),
        bankAddress: toStr(nextPayoutProfile?.bankAddress),
        branchCode: toStr(nextPayoutProfile?.branchCode),
        accountNumber: toStr(nextPayoutProfile?.accountNumber),
        iban: toStr(nextPayoutProfile?.iban),
        swiftBic: toStr(nextPayoutProfile?.swiftBic),
        routingNumber: toStr(nextPayoutProfile?.routingNumber),
        accountType: toStr(nextPayoutProfile?.accountType || "business_cheque"),
        country: toStr(nextPayoutProfile?.country || "ZA"),
        currency: toStr(nextPayoutProfile?.currency || "ZAR"),
        beneficiaryReference: toStr(nextPayoutProfile?.beneficiaryReference),
        beneficiaryAddressLine1: toStr(nextPayoutProfile?.beneficiaryAddressLine1),
        beneficiaryAddressLine2: toStr(nextPayoutProfile?.beneficiaryAddressLine2),
        beneficiaryCity: toStr(nextPayoutProfile?.beneficiaryCity),
        beneficiaryRegion: toStr(nextPayoutProfile?.beneficiaryRegion),
        beneficiaryPostalCode: toStr(nextPayoutProfile?.beneficiaryPostalCode),
        beneficiaryCountry: toStr(nextPayoutProfile?.beneficiaryCountry || "ZA"),
        verificationStatus: toStr(nextPayoutProfile?.verificationStatus || "not_submitted"),
        verificationNotes: toStr(nextPayoutProfile?.verificationNotes),
        stripeRecipientAccountId: toStr(nextPayoutProfile?.stripeRecipientAccountId),
        stripeRecipientEntityType: toStr(nextPayoutProfile?.stripeRecipientEntityType),
        stripeRecipientCountry: toStr(nextPayoutProfile?.stripeRecipientCountry),
        stripeLastAccountLinkCreatedAt: toStr(nextPayoutProfile?.stripeLastAccountLinkCreatedAt),
        wiseProfileId: toStr(nextPayoutProfile?.wiseProfileId),
        wiseRecipientId: toStr(nextPayoutProfile?.wiseRecipientId),
        wiseRecipientStatus: toStr(nextPayoutProfile?.wiseRecipientStatus),
        wiseRequirementType: toStr(nextPayoutProfile?.wiseRequirementType),
        wiseRequirements: Array.isArray(nextPayoutProfile?.wiseRequirements) ? nextPayoutProfile.wiseRequirements : [],
        wiseDetails: nextPayoutProfile?.wiseDetails && typeof nextPayoutProfile.wiseDetails === "object" ? nextPayoutProfile.wiseDetails : {},
        onboardingStatus: toStr(nextPayoutProfile?.onboardingStatus || "created"),
        payoutMethodEnabled: nextPayoutProfile?.payoutMethodEnabled === true,
        lastCollectionLinkSentAt: toStr(nextPayoutProfile?.lastCollectionLinkSentAt),
        recipientEmail: toStr(nextBusinessDetails?.email || profile?.email || nextPayoutProfile?.recipientEmail || ""),
        lastVerifiedAt: toStr(nextPayoutProfile?.lastVerifiedAt),
      });
      setBusinessDetails({
        companyName: toStr(nextBusinessDetails?.companyName || nextVendorName),
        registrationNumber: toStr(nextBusinessDetails?.registrationNumber),
        vatNumber: toStr(nextBusinessDetails?.vatNumber),
        email: toStr(nextBusinessDetails?.email || profile?.email || ""),
        phoneNumber: toStr(nextBusinessDetails?.phoneNumber),
        addressText: toStr(nextBusinessDetails?.addressText),
      });
      setVendorNameValue(sanitizeVendorName(nextSeller?.vendorName || nextVendorName));
      setVendorDescriptionValue(toStr(nextSeller?.vendorDescription || vendorDescriptionValue).slice(0, 500));
      setSellerCodeValue(toStr(nextSeller?.sellerCode || sellerCodeValue));
      setSavedSnapshot(
        buildSettingsSnapshot({
          branding: {
            bannerImageUrl: toStr(nextBranding?.bannerImageUrl),
            bannerBlurHashUrl: toStr(nextBranding?.bannerBlurHashUrl),
            bannerAltText: toStr(nextBranding?.bannerAltText),
            bannerObjectPosition: normalizePlacement(nextBranding?.bannerObjectPosition),
            logoImageUrl: toStr(nextBranding?.logoImageUrl),
            logoBlurHashUrl: toStr(nextBranding?.logoBlurHashUrl),
            logoAltText: toStr(nextBranding?.logoAltText),
            logoObjectPosition: normalizePlacement(nextBranding?.logoObjectPosition),
          },
          shippingSettings: mapShippingSettings(nextShippingSettings),
          payoutProfile: {
            provider: toStr(nextPayoutProfile?.provider || payload?.payoutProvider || payoutProvider || "wise"),
            payoutMethod: resolvePayoutMethodForCountry(nextPayoutProfile?.payoutMethod, nextPayoutProfile?.country || nextPayoutProfile?.bankCountry),
            accountHolderName: toStr(nextPayoutProfile?.accountHolderName),
            bankName: toStr(nextPayoutProfile?.bankName),
            bankCountry: toStr(nextPayoutProfile?.bankCountry || "ZA"),
            bankAddress: toStr(nextPayoutProfile?.bankAddress),
            branchCode: toStr(nextPayoutProfile?.branchCode),
            accountNumber: toStr(nextPayoutProfile?.accountNumber),
            iban: toStr(nextPayoutProfile?.iban),
            swiftBic: toStr(nextPayoutProfile?.swiftBic),
            routingNumber: toStr(nextPayoutProfile?.routingNumber),
            accountType: toStr(nextPayoutProfile?.accountType || "business_cheque"),
            country: toStr(nextPayoutProfile?.country || "ZA"),
            currency: toStr(nextPayoutProfile?.currency || "ZAR"),
            beneficiaryReference: toStr(nextPayoutProfile?.beneficiaryReference),
            beneficiaryAddressLine1: toStr(nextPayoutProfile?.beneficiaryAddressLine1),
            beneficiaryAddressLine2: toStr(nextPayoutProfile?.beneficiaryAddressLine2),
            beneficiaryCity: toStr(nextPayoutProfile?.beneficiaryCity),
            beneficiaryRegion: toStr(nextPayoutProfile?.beneficiaryRegion),
            beneficiaryPostalCode: toStr(nextPayoutProfile?.beneficiaryPostalCode),
            beneficiaryCountry: toStr(nextPayoutProfile?.beneficiaryCountry || "ZA"),
            verificationStatus: toStr(nextPayoutProfile?.verificationStatus || "not_submitted"),
            verificationNotes: toStr(nextPayoutProfile?.verificationNotes),
            stripeRecipientAccountId: toStr(nextPayoutProfile?.stripeRecipientAccountId),
            stripeRecipientEntityType: toStr(nextPayoutProfile?.stripeRecipientEntityType),
            stripeRecipientCountry: toStr(nextPayoutProfile?.stripeRecipientCountry),
            stripeLastAccountLinkCreatedAt: toStr(nextPayoutProfile?.stripeLastAccountLinkCreatedAt),
            wiseProfileId: toStr(nextPayoutProfile?.wiseProfileId),
            wiseRecipientId: toStr(nextPayoutProfile?.wiseRecipientId),
            wiseRecipientStatus: toStr(nextPayoutProfile?.wiseRecipientStatus),
            wiseRequirementType: toStr(nextPayoutProfile?.wiseRequirementType),
            wiseRequirements: Array.isArray(nextPayoutProfile?.wiseRequirements) ? nextPayoutProfile.wiseRequirements : [],
            wiseDetails: nextPayoutProfile?.wiseDetails && typeof nextPayoutProfile?.wiseDetails === "object" ? nextPayoutProfile.wiseDetails : {},
            onboardingStatus: toStr(nextPayoutProfile?.onboardingStatus || "created"),
            payoutMethodEnabled: nextPayoutProfile?.payoutMethodEnabled === true,
            lastCollectionLinkSentAt: toStr(nextPayoutProfile?.lastCollectionLinkSentAt),
            recipientEmail: toStr(nextPayoutProfile?.recipientEmail || nextBusinessDetails?.email || profile?.email || ""),
            lastVerifiedAt: toStr(nextPayoutProfile?.lastVerifiedAt),
          },
          businessDetails: {
            companyName: toStr(nextBusinessDetails?.companyName || nextVendorName),
            registrationNumber: toStr(nextBusinessDetails?.registrationNumber),
            vatNumber: toStr(nextBusinessDetails?.vatNumber),
            email: toStr(nextBusinessDetails?.email || profile?.email || ""),
            phoneNumber: toStr(nextBusinessDetails?.phoneNumber),
            addressText: toStr(nextBusinessDetails?.addressText),
          },
          vendorNameValue: sanitizeVendorName(nextSeller?.vendorName || nextVendorName),
          vendorDescriptionValue: toStr(nextSeller?.vendorDescription || vendorDescriptionValue).slice(0, 500),
        }),
      );
      if (showSuccessMessage) {
        showSnackbar(
          weightRequirementState?.hasWeightBasedShipping && weightRequirementState?.missingWeightCount > 0
            ? weightRequirementState?.deactivatedCount > 0
              ? `Seller settings saved. ${weightRequirementState.missingWeightCount} product${weightRequirementState.missingWeightCount === 1 ? "" : "s"} still need variant weights, and ${weightRequirementState.deactivatedCount} active listing${weightRequirementState.deactivatedCount === 1 ? "" : "s"} were moved out of active status because there is no local-delivery fallback.`
              : `Seller settings saved. ${weightRequirementState.missingWeightCount} product${weightRequirementState.missingWeightCount === 1 ? "" : "s"} still need variant weights before per-kg country shipping can apply.`
            : "Seller settings saved.",
          "success",
        );
      }
      onSettingsSaved?.();
      await refreshProfile();
      void loadPayoutStatus();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save seller settings.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteSellerAccount() {
    if (!canDeleteSeller) {
      setError("You do not have permission to delete this seller account.");
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile?.uid,
          sellerSlug,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to delete seller account.");
      }
      await refreshProfile();
      router.push("/seller/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete seller account.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return renderLoadingSkeleton();
  }

  function updateBannerPosition(clientX: number, clientY: number) {
    const stage = bannerStageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = clampNumber(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clampNumber(((clientY - rect.top) / rect.height) * 100, 0, 100);
    setBranding((current) => ({
      ...current,
      bannerObjectPosition: placementToString(x, y),
    }));
  }

  return (
    <section className="space-y-4">
      {visibleSectionSet.has("profile") ? (
      <div className="rounded-[8px] border border-black/5 bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Vendor profile</p>
            <h4 className="mt-1 text-[18px] font-semibold text-[#202020]">Update your seller identity</h4>
            <p className="mt-1 text-[12px] text-[#57636c]">
              Keep your vendor name and description current. Your seller code stays fixed and is used across Piessang.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Link
              href={publicVendorHref}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#907d4c]"
            >
              View public profile <span aria-hidden="true">→</span>
            </Link>
            <div className="rounded-[8px] border border-black/10 bg-[rgba(32,32,32,0.03)] px-3 py-2 text-[12px] text-[#57636c]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b94a3]">Seller code</p>
              <p className="mt-1 font-semibold text-[#202020]">{sellerCodeValue || "Will be generated"}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Vendor name</span>
            <input
              value={vendorNameValue}
              onChange={(event) => setVendorNameValue(sanitizeVendorName(event.target.value))}
              onBlur={(event) => setVendorNameValue(sanitizeVendorName(event.target.value))}
              placeholder="Your vendor name"
              disabled={!canEditSettings}
              className={`w-full rounded-[8px] bg-white h-12 px-3 text-[13px] outline-none transition-colors disabled:bg-[#f7f7f7] ${
                sellerNameCheck.unique === true
                  ? "border border-[#39a96b] bg-[rgba(57,169,107,0.06)] focus:border-[#39a96b]"
                  : sellerNameCheck.unique === false
                    ? "border border-[#d11c1c] focus:border-[#d11c1c]"
                    : "border border-black/10 focus:border-[#cbb26b]"
              }`}
            />
            <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
              This must be unique across Piessang sellers.
            </p>
            {sellerNameCheck.checking ? (
              <p className="mt-1 text-[11px] font-medium text-[#907d4c]">Checking availability...</p>
            ) : sellerNameCheck.current ? (
              <p className="mt-1 text-[11px] font-medium text-[#57636c]">This is your current vendor name.</p>
            ) : sellerNameCheck.unique === true ? (
              <p className="mt-1 text-[11px] font-semibold text-[#39a96b]">Vendor name available.</p>
            ) : sellerNameCheck.unique === false ? (
              <div className="mt-2 rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-3 py-2">
                <p className="text-[11px] font-semibold text-[#b91c1c]">Vendor name already exists.</p>
                {sellerNameCheck.suggestions.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sellerNameCheck.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setVendorNameValue(suggestion)}
                        className="inline-flex items-center rounded-[8px] border border-[#d9b5b8] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#907d4c]"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Seller code</span>
            <div className="flex items-center gap-2 rounded-[8px] border border-black/10 bg-[#fafafa] h-12 px-3 text-[13px] text-[#202020]">
              <span className="truncate font-mono font-semibold">{sellerCodeValue || "Will be generated automatically"}</span>
              {sellerCodeValue ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(sellerCodeValue);
                      setSellerCodeCopied(true);
                      showSnackbar("Seller code copied.");
                      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
                      copyTimeoutRef.current = window.setTimeout(() => setSellerCodeCopied(false), 1600);
                    } catch {
                      setError("Unable to copy seller code.");
                      showSnackbar("Unable to copy seller code.", "error");
                    }
                  }}
                  className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-black/10 bg-white px-2.5 text-[11px] font-semibold text-[#202020]"
                >
                  {sellerCodeCopied ? (
                    <>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
                        <path
                          d="M5 12.5 10 17 19 7.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Copied
                    </>
                  ) : (
                    "Copy"
                  )}
                </button>
              ) : null}
            </div>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Vendor description</span>
          <textarea
            value={vendorDescriptionValue}
            onChange={(event) => setVendorDescriptionValue(event.target.value.slice(0, 500))}
            placeholder="Tell buyers and team members what your vendor account is about..."
            disabled={!canEditSettings}
            rows={4}
            className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b] disabled:bg-[#f7f7f7]"
          />
          <p className="mt-1 text-[11px] text-[#8b94a3]">Optional. Keep it short and clear.</p>
        </label>
      </div>
      ) : null}

      {visibleSectionSet.has("branding") ? (
      <SettingsSection
        eyebrow="Branding"
        title="Store visuals"
        description="Manage your banner and logo without keeping the whole branding workspace open all the time."
        expanded={standaloneSection === "branding" ? true : sectionOpen.branding}
        onToggle={() => standaloneSection === "branding" ? undefined : setSectionOpen((current) => ({ ...current, branding: !current.branding }))}
      >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[8px] border border-black/5 bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Branding</p>
              <h4 className="mt-1 text-[18px] font-semibold text-[#202020]">Banner image</h4>
              <p className="mt-1 text-[12px] text-[#57636c]">
                Suggested ratio: {BANNER_RATIOS.join(" or ")}. Drag the image inside the frame to reposition it.
              </p>
            </div>
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              disabled={!canEditSettings || bannerUploading}
              className="inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bannerUploading ? "Uploading..." : "Upload"}
            </button>
          </div>

          <div
            ref={bannerStageRef}
            className={`mt-4 overflow-hidden rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] ${
              canEditSettings ? "cursor-grab active:cursor-grabbing" : ""
            }`}
            onPointerDown={(event) => {
              if (!canEditSettings || !branding.bannerImageUrl) return;
              setBannerDragging(true);
              updateBannerPosition(event.clientX, event.clientY);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!bannerDragging || !canEditSettings || !branding.bannerImageUrl) return;
              updateBannerPosition(event.clientX, event.clientY);
            }}
            onPointerUp={() => setBannerDragging(false)}
            onPointerCancel={() => setBannerDragging(false)}
            onLostPointerCapture={() => setBannerDragging(false)}
          >
            <div className="relative aspect-[3/1] w-full bg-[#fff]">
              {branding.bannerImageUrl ? (
                <BlurhashImage
                  src={branding.bannerImageUrl}
                  blurHash={branding.bannerBlurHashUrl}
                  alt={branding.bannerAltText || `${vendorName} banner`}
                  className="h-full w-full"
                  imageClassName="object-cover"
                  imageStyle={{ objectPosition: branding.bannerObjectPosition || "50% 50%" }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-center text-[12px] text-[#8b94a3]">
                  Banner preview appears here.
                </div>
              )}
              {branding.bannerImageUrl ? (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(32,32,32,0.35)]"
                    style={{
                      left: `${bannerPosition.x}%`,
                      top: `${bannerPosition.y}%`,
                    }}
                  />
                  <div
                    className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70"
                    style={{
                      left: `${bannerPosition.x}%`,
                      top: `${bannerPosition.y}%`,
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleUpload("banner", event.target.files?.[0])}
          />

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Banner alt text</span>
            <input
              value={branding.bannerAltText}
              onChange={(event) =>
                setBranding((current) => ({ ...current, bannerAltText: event.target.value.slice(0, 120) }))
              }
              placeholder="Describe the banner image"
              className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
            />
          </label>
        </div>

        <div className="rounded-[8px] border border-black/5 bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Branding</p>
              <h4 className="mt-1 text-[18px] font-semibold text-[#202020]">Logo image</h4>
              <p className="mt-1 text-[12px] text-[#57636c]">
                Suggested ratio: {LOGO_RATIOS.join(" or ")}. Keep the brand mark centered for best results.
              </p>
            </div>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={!canEditSettings || logoUploading}
              className="inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {logoUploading ? "Uploading..." : "Upload"}
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center overflow-hidden rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-8">
            <div className="relative h-32 w-32 overflow-hidden rounded-[8px] border border-black/10 bg-white">
              {branding.logoImageUrl ? (
                <BlurhashImage
                  src={branding.logoImageUrl}
                  blurHash={branding.logoBlurHashUrl}
                  alt={branding.logoAltText || `${vendorName} logo`}
                  className="h-full w-full"
                  imageClassName="object-contain"
                  imageStyle={{ objectPosition: branding.logoObjectPosition || "center center" }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-center text-[12px] text-[#8b94a3]">
                  Logo preview appears here.
                </div>
              )}
            </div>
          </div>

          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleUpload("logo", event.target.files?.[0])}
          />

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Logo alt text</span>
            <input
              value={branding.logoAltText}
              onChange={(event) =>
                setBranding((current) => ({ ...current, logoAltText: event.target.value.slice(0, 120) }))
              }
              placeholder="Describe the logo image"
              className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
            />
          </label>
        </div>
      </div>
      </SettingsSection>
      ) : null}

      {visibleSectionSet.has("shipping") ? (
      <SettingsSection
        eyebrow="Shipping preferences"
        title="How you ship orders"
        description="Define your origin, fulfillment mode, seller-managed shipping zones, pricing rules, batching, and margin."
        expanded={standaloneSection === "shipping" ? true : sectionOpen.shipping}
        onToggle={() => standaloneSection === "shipping" ? undefined : setSectionOpen((current) => ({ ...current, shipping: !current.shipping }))}
      >
        <div className="mt-4 space-y-4">
          <div className="rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[#202020]">Ships from</p>
                <p className="mt-1 text-[12px] text-[#57636c]">This is the origin used for seller-managed shipping rules and platform fulfilment coordination.</p>
              </div>
            </div>
            <div className="mt-4 rounded-[8px] border border-dashed border-black/10 bg-white px-4 py-4 text-[12px] text-[#57636c]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-[#202020]">Chosen origin</p>
                  <p className="mt-1 text-[13px] text-[#202020]">
                    {formatSellerOriginSummary(shippingSettings.shipsFrom) || formatShipsFromSummary(shippingSettings.shipsFrom) || "No shipping origin selected yet."}
                  </p>
                  {shippingSettings.shipsFrom.postalCode ? (
                    <p className="mt-1">Postal code: {shippingSettings.shipsFrom.postalCode}</p>
                  ) : null}
                  <p className="mt-1">Set this once so zone logic can resolve from the right place.</p>
                </div>
                <button type="button" onClick={() => setOriginPickerOpen(true)} disabled={!canEditSettings} className="inline-flex h-9 shrink-0 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] disabled:opacity-60">
                  {formatSellerOriginSummary(shippingSettings.shipsFrom) || formatShipsFromSummary(shippingSettings.shipsFrom) ? "Edit location" : "Choose location"}
                </button>
              </div>
            </div>

          <div className="rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[#202020]">Local delivery</p>
                <p className="mt-1 text-[12px] text-[#57636c]">
                  Configure nearby delivery separately from broader shipping zones.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-3 rounded-[8px] border border-black/10 bg-white px-4 py-3">
                <input
                  type="checkbox"
                  checked={shippingSettings.localDelivery.enabled}
                  onChange={(event) =>
                    setShippingSettings((current) => ({
                      ...current,
                      localDelivery: { ...current.localDelivery, enabled: event.target.checked },
                    }))
                  }
                  disabled={!canEditSettings}
                  className="h-4 w-4 rounded border-black/20"
                />
                <div>
                  <p className="text-[13px] font-semibold text-[#202020]">Enable local delivery</p>
                  <p className="text-[11px] text-[#57636c]">Use this for nearby delivery rules without mixing them into national or international shipping zones.</p>
                </div>
              </label>

              <div className="rounded-[8px] border border-black/10 bg-white p-4">
                <p className="text-[12px] font-semibold text-[#202020]">Local delivery method</p>
                <p className="mt-1 text-[11px] text-[#57636c]">Choose one local delivery rule type to avoid overlapping logic.</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {[
                    { value: "province", label: "Province rates", description: "Use province-by-province local delivery pricing." },
                    { value: "postal_code_group", label: "Postal code groups", description: "Use exact postcodes or postcode ranges for local delivery." },
                  ].map((option) => (
                    <label key={option.value} className={`rounded-[8px] border px-4 py-3 ${shippingSettings.localDelivery.mode === option.value ? "border-[#cbb26b] bg-[rgba(203,178,107,0.08)]" : "border-black/10 bg-white"}`}>
                      <input
                        type="radio"
                        name="local-delivery-mode"
                        value={option.value}
                        checked={shippingSettings.localDelivery.mode === option.value}
                        onChange={() =>
                          setShippingSettings((current) => ({
                            ...current,
                            localDelivery: {
                              ...current.localDelivery,
                              mode: option.value as SellerShippingSettings["localDelivery"]["mode"],
                            },
                          }))
                        }
                        disabled={!canEditSettings}
                        className="sr-only"
                      />
                      <p className="text-[13px] font-semibold text-[#202020]">{option.label}</p>
                      <p className="mt-1 text-[11px] text-[#57636c]">{option.description}</p>
                    </label>
                  ))}
                </div>
              </div>
              {shippingSettings.localDelivery.mode === "province" ? (
                <div className="rounded-[8px] border border-black/10 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold text-[#202020]">Province rates</p>
                    <button
                      type="button"
                      onClick={() =>
                        setShippingSettings((current) => ({
                          ...current,
                          localDelivery: {
                            ...current.localDelivery,
                            provinces: [...current.localDelivery.provinces, { province: "", placeId: "", enabled: true, rateOverrideEnabled: false, rateOverride: makeShippingRateDraft(), batching: { enabled: true, mode: "single_shipping_fee", maxBatchLimit: "" }, estimatedDeliveryDays: { min: "", max: "" } }],
                          },
                        }))
                      }
                      disabled={!canEditSettings || !shippingSettings.shipsFrom.countryCode}
                      className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"
                    >
                      Add
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {!shippingSettings.shipsFrom.countryCode ? (
                      <div className="rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-3 py-3 text-[11px] text-[#57636c]">
                        Choose a ship-from country first, then search Google provinces / states for that country.
                      </div>
                    ) : null}
                    {shippingSettings.localDelivery.provinces.map((province, provinceIndex) => (
                      <div key={`local-province-${provinceIndex}`} className="grid gap-3 rounded-[8px] border border-black/10 bg-[#fafafa] p-3">
                        <div className="space-y-1.5">
                          <FieldHelpLabel
                            label="Province / region"
                            help="Choose the province or state that this local delivery rule applies to. Buyers in this province will use the pricing and batching settings in this block."
                          />
                          <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                            <GoogleAdminRegionSelect
                              countryCode={shippingSettings.shipsFrom.countryCode}
                              value={province.province}
                              placeId={province.placeId}
                              onSelect={(selection) =>
                                setShippingSettings((current) => ({
                                  ...current,
                                  localDelivery: {
                                    ...current.localDelivery,
                                    provinces: current.localDelivery.provinces.map((item, itemIndex) =>
                                      itemIndex === provinceIndex ? { ...item, province: selection.label, placeId: selection.placeId } : item,
                                    ),
                                  },
                                }))
                              }
                              disabled={!canEditSettings}
                            />
                            <button
                              type="button"
                              onClick={() => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.filter((_, itemIndex) => itemIndex !== provinceIndex) } }))}
                              disabled={!canEditSettings}
                              aria-label="Remove province block"
                              title="Remove province block"
															className="inline-flex h-[46px] w-[46px] items-center justify-center rounded-[8px] border border-[#ef4444]/20 bg-white text-[#b91c1c] transition hover:bg-[#fff5f5] disabled:opacity-60"
                            >
                              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className={`grid gap-2 ${province.rateOverride.pricingMode === "flat" ? "md:grid-cols-[220px_1fr_auto]" : "md:grid-cols-[220px_auto]"}`}>
                          <label className="block">
                            <FieldHelpLabel
                              label="Pricing method"
                              help="Choose how shipping should be calculated for this province. Use flat rate for one fixed fee, weight-based or tiered for heavier baskets, order-value based for spend bands, or free over threshold to waive shipping above a set basket value."
                              className="mb-1.5"
                            />
                            <select value={province.rateOverride.pricingMode} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, pricingMode: event.target.value as SellerShippingRateDraft["pricingMode"] } } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none">
                              <option value="flat">Flat rate</option>
                              <option value="weight_based">Weight based</option>
                              <option value="tiered">Tiered by weight</option>
                              <option value="order_value_based">Order value based</option>
                              <option value="free_over_threshold">Free over threshold</option>
                            </select>
                          </label>
                          {province.rateOverride.pricingMode === "flat" ? (
                            <div>
                              <FieldHelpLabel
                                label="Flat shipping fee"
                                help="This is the one fixed shipping amount charged when this province uses flat-rate pricing."
                                className="mb-1.5"
                              />
                              <input value={province.rateOverride.flatRate} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, flatRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="80" />
                              <span className="mt-1 block text-[11px] text-[#57636c]">{getOverrideRateLabel(province.rateOverride.pricingMode)}</span>
                            </div>
                          ) : null}
                        </div>
                        {province.rateOverride.pricingMode === "weight_based" ? (
                          <div className="grid gap-2 md:grid-cols-4">
                            <input value={province.rateOverride.weightBased.baseRate} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, baseRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Base rate" />
                            <input value={province.rateOverride.weightBased.includedKg} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, includedKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Included kg" />
                            <input value={province.rateOverride.weightBased.additionalRatePerKg} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, additionalRatePerKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Extra per kg" />
                            <label className="flex items-center gap-2 rounded-[8px] border border-black/10 bg-[#fafafa] px-3 py-2.5 text-[12px] text-[#202020]"><input type="checkbox" checked={province.rateOverride.weightBased.roundUpToNextKg} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, roundUpToNextKg: event.target.checked } } } : item) } }))} disabled={!canEditSettings} />Round up</label>
                          </div>
                        ) : null}
                        {province.rateOverride.pricingMode === "tiered" ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <FieldHelpLabel
                                label="Weight bands"
                                help="Create weight ranges for this province. Each order matches the band that contains its combined basket weight."
                              />
                              <button
                                type="button"
                                onClick={() => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: [...item.rateOverride.tiered, { minWeightKg: "", maxWeightKg: "", rate: "" }] } } : item) } }))}
                                disabled={!canEditSettings}
                                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"
                              >
                                <span aria-hidden="true" className="text-[13px] leading-none">+</span>
                                Add band
                              </button>
                            </div>
                            {province.rateOverride.tiered.map((tier, tierIndex) => (
                              <div key={`local-province-tier-${provinceIndex}-${tierIndex}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                                <input value={tier.minWeightKg} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, minWeightKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } : band) } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Min kg" />
                                <input value={tier.maxWeightKg} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, maxWeightKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } : band) } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Max kg" />
                                <input value={tier.rate} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, rate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : band) } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Rate" />
                                <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.filter((_, bandIndex) => bandIndex !== tierIndex) } } : item) } }))} disabled={!canEditSettings || province.rateOverride.tiered.length <= 1} className="rounded-[8px] border border-[#ef4444]/20 bg-white px-3 py-2.5 text-[11px] font-semibold text-[#b91c1c]">Remove band</button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {province.rateOverride.pricingMode === "order_value_based" ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <FieldHelpLabel
                                label="Order value bands"
                                help="Create basket-value ranges for this province. Each buyer will be charged the rate that matches their order total in this province."
                              />
                              <button
                                type="button"
                                onClick={() => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: [...item.rateOverride.orderValueBased, { minOrderValue: "", maxOrderValue: "", rate: "" }] } } : item) } }))}
                                disabled={!canEditSettings}
                                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"
                              >
                                <span aria-hidden="true" className="text-[13px] leading-none">+</span>
                                Add band
                              </button>
                            </div>
                            {province.rateOverride.orderValueBased.map((band, bandIndex) => (
                              <div key={`local-province-order-${provinceIndex}-${bandIndex}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                                <input value={band.minOrderValue} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.map((entry, entryIndex) => entryIndex === bandIndex ? { ...entry, minOrderValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entry) } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Min value" />
                                <input value={band.maxOrderValue} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.map((entry, entryIndex) => entryIndex === bandIndex ? { ...entry, maxOrderValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entry) } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Max value" />
                                <input value={band.rate} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.map((entry, entryIndex) => entryIndex === bandIndex ? { ...entry, rate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entry) } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Rate" />
                                <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.filter((_, entryIndex) => entryIndex !== bandIndex) } } : item) } }))} disabled={!canEditSettings || province.rateOverride.orderValueBased.length <= 1} className="rounded-[8px] border border-[#ef4444]/20 bg-white px-3 py-2.5 text-[11px] font-semibold text-[#b91c1c]">Remove band</button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {province.rateOverride.pricingMode === "free_over_threshold" ? (
                          <div className="grid gap-2 md:grid-cols-2">
                            <input value={province.rateOverride.freeOverThreshold.threshold} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, freeOverThreshold: { ...item.rateOverride.freeOverThreshold, threshold: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Free over value" />
                            <input value={province.rateOverride.freeOverThreshold.fallbackRate} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, freeOverThreshold: { ...item.rateOverride.freeOverThreshold, fallbackRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Otherwise charge" />
                          </div>
                        ) : null}
                        <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
                          <label className="block">
                            <FieldHelpLabel
                              label="Batching"
                              help="Choose how multiple items in this province should be grouped for shipping. Per order charges one fee for the batch, highest item shipping uses the highest matched charge, combine weight uses total kg, and per item charges each unit separately."
                              className="mb-1.5"
                            />
                            <select value={province.batching.mode} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, batching: { ...item.batching, mode: event.target.value as SellerShippingSettings["localDelivery"]["batching"]["mode"] } } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none">
                              <option value="single_shipping_fee">{getBatchingOptionLabel("single_shipping_fee")}</option>
                              <option value="highest_item_shipping">{getBatchingOptionLabel("highest_item_shipping")}</option>
                              <option value="combine_weight">{getBatchingOptionLabel("combine_weight")}</option>
                              <option value="per_item">{getBatchingOptionLabel("per_item")}</option>
                            </select>
                          </label>
                          <label className="block">
                            <FieldHelpLabel
                              label={getBatchLimitLabel(province.batching.mode)}
                              help="Optional cap for each shipping batch in this province. If a basket exceeds this limit, checkout splits it into multiple batches and sums the shipping across them."
                              className="mb-1.5"
                            />
                            <input value={province.batching.maxBatchLimit} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, batching: { ...item.batching, maxBatchLimit: event.target.value.replace(/[^\d]/g, "").slice(0, 3) } } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder={getBatchLimitPlaceholder(province.batching.mode)} />
                          </label>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <label className="block">
                            <FieldHelpLabel label="Min days" help="Shortest estimated delivery time for this province rule." className="mb-1.5" />
                            <input value={province.estimatedDeliveryDays.min} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, estimatedDeliveryDays: clampEtaDaysRange(item.estimatedDeliveryDays, { min: event.target.value }) } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="1" />
                          </label>
                          <label className="block">
                            <FieldHelpLabel label="Max days" help="Longest estimated delivery time for this province rule." className="mb-1.5" />
                            <input value={province.estimatedDeliveryDays.max} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, provinces: current.localDelivery.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, estimatedDeliveryDays: clampEtaDaysRange(item.estimatedDeliveryDays, { max: event.target.value }) } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="3" />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {shippingSettings.localDelivery.mode === "postal_code_group" ? (
                <div className="rounded-[8px] border border-black/10 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold text-[#202020]">Postal code groups</p>
                    <button
                      type="button"
                      onClick={() =>
                        setShippingSettings((current) => ({
                          ...current,
                          localDelivery: {
                            ...current.localDelivery,
                            postalCodeGroups: [...current.localDelivery.postalCodeGroups, { name: "", coverageMode: "exact", postalCodes: "", rangeFrom: "", rangeTo: "", rateOverrideEnabled: false, rateOverride: makeShippingRateDraft(), batching: { enabled: true, mode: "single_shipping_fee", maxBatchLimit: "" }, estimatedDeliveryDays: { min: "", max: "" } }],
                          },
                        }))
                      }
                      disabled={!canEditSettings}
                      className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"
                    >
                      Add
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {shippingSettings.localDelivery.postalCodeGroups.map((group, groupIndex) => (
                      <div key={`local-postal-${groupIndex}`} className="rounded-[8px] border border-black/10 bg-[#fafafa] p-3">
                        {(() => {
                          const coverageMode = getPostalGroupCoverageMode(group);
                          return (
                            <>
                        <div className="space-y-1.5">
                          <FieldHelpLabel
                            label="Group name"
                            help="Give this postal-code group a clear internal name, like Cape Town Metro or Winelands, so you can recognise what area this rule covers."
                          />
                          <div className="flex items-center gap-2">
                            <input value={group.name} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, name: event.target.value.slice(0, 80) } : item) } }))} disabled={!canEditSettings} className="min-w-0 w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Cape Town Metro" />
                            <button
                              type="button"
                              onClick={() => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.filter((_, itemIndex) => itemIndex !== groupIndex) } }))}
                              disabled={!canEditSettings}
                              aria-label="Remove postal code group"
                              title="Remove postal code group"
                              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border border-[#ef4444]/20 bg-white text-[#b91c1c] transition hover:bg-[#fff5f5] disabled:opacity-60"
                            >
                              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3">
                          <div className="rounded-[8px] border border-black/10 bg-white p-4">
                            <FieldHelpLabel
                              label="Coverage type"
                              help="Choose one way to define this group. Use exact postal codes for a fixed list, or use a range for a continuous postcode span. Each group should use only one coverage style."
                              className="mb-3"
                            />
                            <div className="flex w-full rounded-[10px] bg-[#ececec] p-1">
                              <label className="min-w-0 flex-1">
                                <input
                                  type="radio"
                                  name={`local-postal-coverage-${groupIndex}`}
                                  value="exact"
                                  checked={coverageMode === "exact"}
                                  onChange={() =>
                                    setShippingSettings((current) => ({
                                      ...current,
                                      localDelivery: {
                                        ...current.localDelivery,
                                        postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) =>
                                          itemIndex === groupIndex ? { ...item, coverageMode: "exact", rangeFrom: "", rangeTo: "" } : item,
                                        ),
                                      },
                                    }))
                                  }
                                  disabled={!canEditSettings}
                                  className="sr-only"
                                />
                                <span
                                  className={`inline-flex h-11 w-full items-center justify-center rounded-[8px] px-4 text-[13px] font-semibold transition ${
                                    coverageMode === "exact"
                                      ? "bg-[#cbb26b] text-white shadow-[0_2px_6px_rgba(20,24,27,0.1)]"
                                      : "text-[#4b5563]"
                                  }`}
                                >
                                  Exact postal codes
                                </span>
                              </label>
                              <label className="min-w-0 flex-1">
                                <input
                                  type="radio"
                                  name={`local-postal-coverage-${groupIndex}`}
                                  value="range"
                                  checked={coverageMode === "range"}
                                  onChange={() =>
                                    setShippingSettings((current) => ({
                                      ...current,
                                      localDelivery: {
                                        ...current.localDelivery,
                                        postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) =>
                                          itemIndex === groupIndex ? { ...item, coverageMode: "range", postalCodes: "" } : item,
                                        ),
                                      },
                                    }))
                                  }
                                  disabled={!canEditSettings}
                                  className="sr-only"
                                />
                                <span
                                  className={`inline-flex h-11 w-full items-center justify-center rounded-[8px] px-4 text-[13px] font-semibold transition ${
                                    coverageMode === "range"
                                      ? "bg-[#cbb26b] text-white shadow-[0_2px_6px_rgba(20,24,27,0.1)]"
                                      : "text-[#4b5563]"
                                  }`}
                                >
                                  Postal code range
                                </span>
                              </label>
                            </div>
                          </div>
                          {coverageMode === "exact" ? (
                            <label className="block">
                              <FieldHelpLabel
                                label="Exact postal codes"
                                help="Enter a comma-separated list of exact postal codes that belong to this group. Use this when you know the exact local delivery postcodes you want to price together."
                                className="mb-1.5"
                              />
                              <input value={group.postalCodes} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, coverageMode: "exact", postalCodes: event.target.value, rangeFrom: "", rangeTo: "" } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="8001, 8005, 7700" />
                            </label>
                          ) : (
                            <div className="grid gap-2 md:grid-cols-2">
                              <label className="block">
                                <FieldHelpLabel
                                  label="Postal code range from"
                                  help="Range start for this group. Buyers whose postcode falls between the start and end value can match this group."
                                  className="mb-1.5"
                                />
                                <input value={group.rangeFrom} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, coverageMode: "range", rangeFrom: event.target.value, postalCodes: "" } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="7500" />
                              </label>
                              <label className="block">
                                <FieldHelpLabel
                                  label="Postal code range to"
                                  help="Range end for this group. Buyers whose postcode falls between the start and end value can match this group."
                                  className="mb-1.5"
                                />
                                <input value={group.rangeTo} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, coverageMode: "range", rangeTo: event.target.value, postalCodes: "" } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="7999" />
                              </label>
                            </div>
                          )}
                          <div className={`${group.rateOverride.pricingMode === "flat" ? "grid gap-2 md:grid-cols-[220px_1fr]" : "grid gap-2 md:grid-cols-[220px]"}`}>
                            <label className="block">
                              <FieldHelpLabel
                                label="Pricing method"
                                help="Choose how shipping should be calculated for this postal-code group. This applies only when the buyer matches this exact group or postcode range."
                                className="mb-1.5"
                              />
                              <select value={group.rateOverride.pricingMode} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, pricingMode: event.target.value as SellerShippingRateDraft["pricingMode"] } } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none"><option value="flat">Flat rate</option><option value="weight_based">Weight based</option><option value="tiered">Tiered by weight</option><option value="order_value_based">Order value based</option><option value="free_over_threshold">Free over threshold</option></select>
                            </label>
                            {group.rateOverride.pricingMode === "flat" ? (
                              <label className="block">
                                <FieldHelpLabel
                                  label="Flat shipping fee"
                                  help="This is the one fixed shipping amount charged when this postal-code group uses flat-rate pricing."
                                  className="mb-1.5"
                                />
                                <input value={group.rateOverride.flatRate} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, flatRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="80" />
                              </label>
                            ) : null}
                          </div>
                          {group.rateOverride.pricingMode === "weight_based" ? (
                            <div className="grid gap-2 md:grid-cols-4">
                              <input value={group.rateOverride.weightBased.baseRate} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, baseRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Base rate" />
                              <input value={group.rateOverride.weightBased.includedKg} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, includedKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Included kg" />
                              <input value={group.rateOverride.weightBased.additionalRatePerKg} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, additionalRatePerKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Extra per kg" />
                              <label className="flex items-center gap-2 rounded-[8px] border border-black/10 bg-[#fafafa] px-3 py-2.5 text-[12px] text-[#202020]"><input type="checkbox" checked={group.rateOverride.weightBased.roundUpToNextKg} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, roundUpToNextKg: event.target.checked } } } : item) } }))} disabled={!canEditSettings} />Round up</label>
                            </div>
                          ) : null}
                          {group.rateOverride.pricingMode === "tiered" ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <FieldHelpLabel
                                  label="Weight bands"
                                  help="Create weight ranges for this postal-code group. Each order matches the band that contains its combined basket weight."
                                />
                                <button
                                  type="button"
                                  onClick={() => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: [...item.rateOverride.tiered, { minWeightKg: "", maxWeightKg: "", rate: "" }] } } : item) } }))}
                                  disabled={!canEditSettings}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"
                                >
                                  <span aria-hidden="true" className="text-[13px] leading-none">+</span>
                                  Add band
                                </button>
                              </div>
                              {group.rateOverride.tiered.map((tier, tierIndex) => (
                                <div key={`local-postal-tier-${groupIndex}-${tierIndex}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                                  <input value={tier.minWeightKg} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, minWeightKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } : band) } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Min kg" />
                                  <input value={tier.maxWeightKg} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, maxWeightKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } : band) } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Max kg" />
                                  <input value={tier.rate} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, rate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : band) } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Rate" />
                                  <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.filter((_, bandIndex) => bandIndex !== tierIndex) } } : item) } }))} disabled={!canEditSettings || group.rateOverride.tiered.length <= 1} className="rounded-[8px] border border-[#ef4444]/20 bg-white px-3 py-2.5 text-[11px] font-semibold text-[#b91c1c]">Remove band</button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {group.rateOverride.pricingMode === "order_value_based" ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <FieldHelpLabel
                                  label="Order value bands"
                                  help="Create basket-value ranges for this postal-code group. Each buyer will be charged the rate that matches their order total in this area."
                                />
                                <button
                                  type="button"
                                  onClick={() => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: [...item.rateOverride.orderValueBased, { minOrderValue: "", maxOrderValue: "", rate: "" }] } } : item) } }))}
                                  disabled={!canEditSettings}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"
                                >
                                  <span aria-hidden="true" className="text-[13px] leading-none">+</span>
                                  Add band
                                </button>
                              </div>
                              {group.rateOverride.orderValueBased.map((band, bandIndex) => (
                                <div key={`local-postal-order-${groupIndex}-${bandIndex}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                                  <input value={band.minOrderValue} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.map((entry, entryIndex) => entryIndex === bandIndex ? { ...entry, minOrderValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entry) } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Min value" />
                                  <input value={band.maxOrderValue} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.map((entry, entryIndex) => entryIndex === bandIndex ? { ...entry, maxOrderValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entry) } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Max value" />
                                  <input value={band.rate} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.map((entry, entryIndex) => entryIndex === bandIndex ? { ...entry, rate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entry) } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Rate" />
                                  <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.filter((_, entryIndex) => entryIndex !== bandIndex) } } : item) } }))} disabled={!canEditSettings || group.rateOverride.orderValueBased.length <= 1} className="rounded-[8px] border border-[#ef4444]/20 bg-white px-3 py-2.5 text-[11px] font-semibold text-[#b91c1c]">Remove band</button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {group.rateOverride.pricingMode === "free_over_threshold" ? (
                            <div className="grid gap-2 md:grid-cols-2">
                              <input value={group.rateOverride.freeOverThreshold.threshold} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, freeOverThreshold: { ...item.rateOverride.freeOverThreshold, threshold: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Free over value" />
                              <input value={group.rateOverride.freeOverThreshold.fallbackRate} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, freeOverThreshold: { ...item.rateOverride.freeOverThreshold, fallbackRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Otherwise charge" />
                            </div>
                          ) : null}
                          <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
                            <label className="block">
                              <FieldHelpLabel
                                label="Batching"
                                help="Choose how multiple items in this postal-code group should be grouped for shipping. Per order charges one fee for the batch, highest item shipping uses the highest matched charge, combine weight uses total kg, and per item charges each unit separately."
                                className="mb-1.5"
                              />
                              <select value={group.batching.mode} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, batching: { ...item.batching, mode: event.target.value as SellerShippingSettings["localDelivery"]["batching"]["mode"] } } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none">
                                <option value="single_shipping_fee">{getBatchingOptionLabel("single_shipping_fee")}</option>
                                <option value="highest_item_shipping">{getBatchingOptionLabel("highest_item_shipping")}</option>
                                <option value="combine_weight">{getBatchingOptionLabel("combine_weight")}</option>
                                <option value="per_item">{getBatchingOptionLabel("per_item")}</option>
                              </select>
                            </label>
                            <label className="block">
                              <FieldHelpLabel
                                label={getBatchLimitLabel(group.batching.mode)}
                                help="Optional cap for each shipping batch in this postal-code group. If a basket exceeds this limit, checkout splits it into multiple batches and sums the shipping across them."
                                className="mb-1.5"
                              />
                              <input value={group.batching.maxBatchLimit} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, batching: { ...item.batching, maxBatchLimit: event.target.value.replace(/[^\d]/g, "").slice(0, 3) } } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder={getBatchLimitPlaceholder(group.batching.mode)} />
                            </label>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <label className="block">
                              <FieldHelpLabel label="Min days" help="Shortest estimated delivery time for this postal-code group." className="mb-1.5" />
                              <input value={group.estimatedDeliveryDays.min} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, estimatedDeliveryDays: clampEtaDaysRange(item.estimatedDeliveryDays, { min: event.target.value }) } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="1" />
                            </label>
                            <label className="block">
                              <FieldHelpLabel label="Max days" help="Longest estimated delivery time for this postal-code group." className="mb-1.5" />
                              <input value={group.estimatedDeliveryDays.max} onChange={(event) => setShippingSettings((current) => ({ ...current, localDelivery: { ...current.localDelivery, postalCodeGroups: current.localDelivery.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, estimatedDeliveryDays: clampEtaDaysRange(item.estimatedDeliveryDays, { max: event.target.value }) } : item) } }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="3" />
                            </label>
                          </div>
                        </div>
                            </>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              </div>
            </div>
          </div>

          <div className="rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[#202020]">Shipping zones</p>
                <p className="mt-1 text-[12px] text-[#57636c]">Create country zones, then optionally add province overrides and postal code groups.</p>
              </div>
              <button
                type="button"
                onClick={() => setShippingSettings((current) => ({ ...current, zones: [...current.zones, makeShippingZoneDraft()] }))}
                disabled={!canEditSettings}
                className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] disabled:opacity-60"
              >
                Add zone
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {!shippingSettings.zones.length ? (
                <div className="rounded-[8px] border border-dashed border-black/10 bg-white px-4 py-4 text-[12px] text-[#57636c]">
                  No shipping zones yet. Start with a simple South Africa flat-rate zone, then add overrides later.
                </div>
              ) : null}
              {shippingSettings.zones.map((zone, zoneIndex) => (
                <div key={zone.id} className="rounded-[8px] border border-black/10 bg-white p-4">
                  <div className="grid gap-4">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                      <label className="block">
                        <FieldHelpLabel
                          label="Zone name"
                          help="Give this shipping zone a clear internal name, like South Africa, Namibia, or UAE express, so you can recognise what destination rule this card controls."
                          className="mb-1.5"
                        />
                        <input
                          value={zone.name}
                          onChange={(event) => setShippingSettings((current) => ({
                            ...current,
                            zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, name: event.target.value.slice(0, 80) } : entry),
                          }))}
                          disabled={!canEditSettings}
                          className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none"
                          placeholder="South Africa"
                        />
                      </label>
                      <label className="block">
                        <FieldHelpLabel
                          label="Country"
                          help="Choose the destination country this shipping zone applies to. Province overrides and postal-code groups inside this zone will all belong to this country."
                          className="mb-1.5"
                        />
                        <select
                          value={zone.countryCode}
                          onChange={(event) => setShippingSettings((current) => ({
                            ...current,
                            zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, countryCode: event.target.value } : entry),
                          }))}
                          disabled={!canEditSettings}
                          className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none"
                        >
                          {SELLER_SHIPPING_COUNTRY_OPTIONS.map((option) => (
                            <option key={option.code} value={option.code}>
                              {option.displayLabel}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.filter((_, index) => index !== zoneIndex) }))}
                        disabled={!canEditSettings}
                        aria-label="Delete shipping zone"
                        title="Delete shipping zone"
                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center self-end rounded-[8px] border border-[#ef4444]/20 bg-white text-[#b91c1c] transition hover:bg-[#fff5f5] disabled:opacity-60"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    </div>

                    <div className="block">
                      <FieldHelpLabel
                        label="Coverage type"
                        help="Start with a whole-country zone, then switch to province overrides or postal-code groups when this country needs more specific destination pricing."
                        className="mb-1.5"
                      />
                      <div className="grid gap-2 md:grid-cols-3">
                        {[
                          { value: "country", label: "Country", description: "Use one rule for the whole country." },
                          { value: "province", label: "Province overrides", description: "Set province-specific rules inside this zone." },
                          { value: "postal_code_group", label: "Postal code groups", description: "Use exact postcodes or postcode ranges inside this zone." },
                        ].map((option) => (
                          <label
                            key={option.value}
                            className={`rounded-[8px] border px-4 py-3 ${
                              zone.coverageType === option.value ? "border-[#cbb26b] bg-[rgba(203,178,107,0.08)]" : "border-black/10 bg-white"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`zone-coverage-type-${zone.id}`}
                              value={option.value}
                              checked={zone.coverageType === option.value}
                              onChange={() =>
                                setShippingSettings((current) => ({
                                  ...current,
                                  zones: current.zones.map((entry, index) =>
                                    index === zoneIndex
                                      ? { ...entry, coverageType: option.value as SellerShippingZoneDraft["coverageType"] }
                                      : entry,
                                  ),
                                }))
                              }
                              disabled={!canEditSettings}
                              className="sr-only"
                            />
                            <p className="text-[13px] font-semibold text-[#202020]">{option.label}</p>
                            <p className="mt-1 text-[11px] leading-[1.5] text-[#57636c]">{option.description}</p>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {zone.coverageType === "country" ? (
                    <div className="mt-4 rounded-[8px] border border-black/10 bg-[#fafafa] p-3">
                      <div className="space-y-2">
                        <div className="grid gap-3 rounded-[8px] border border-black/10 bg-white p-3">
                          <div className={`grid gap-2 ${zone.defaultRate.pricingMode === "flat" ? "md:grid-cols-[220px_1fr]" : "md:grid-cols-[220px]"}`}>
                            <label className="block">
                              <FieldHelpLabel
                                label="Pricing method"
                                help="Choose how shipping should be calculated for this province override. This override applies only to buyers whose address falls inside this province."
                                className="mb-1.5"
                              />
                              <select
                                value={zone.defaultRate.pricingMode}
                                onChange={(event) => setShippingSettings((current) => ({
                                  ...current,
                                  zones: current.zones.map((entry, index) => index === zoneIndex ? {
                                    ...entry,
                                    defaultRate: { ...entry.defaultRate, pricingMode: event.target.value as SellerShippingRateDraft["pricingMode"] },
                                  } : entry),
                                }))}
                                disabled={!canEditSettings}
                                className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none"
                              >
                                <option value="flat">Flat rate</option>
                                <option value="weight_based">Weight based</option>
                                <option value="tiered">Tiered by weight</option>
                                <option value="order_value_based">Order value based</option>
                                <option value="free_over_threshold">Free over threshold</option>
                              </select>
                            </label>
                            {zone.defaultRate.pricingMode === "flat" ? (
                              <label className="block">
                                <FieldHelpLabel
                                  label="Flat shipping fee"
                                  help="This is the fixed shipping amount charged when this province override uses flat-rate pricing."
                                  className="mb-1.5"
                                />
                                <input
                                  value={zone.defaultRate.flatRate}
                                  onChange={(event) => setShippingSettings((current) => ({
                                    ...current,
                                    zones: current.zones.map((entry, index) => index === zoneIndex ? {
                                      ...entry,
                                      defaultRate: { ...entry.defaultRate, flatRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) },
                                    } : entry),
                                  }))}
                                  disabled={!canEditSettings}
                                  className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none"
                                  placeholder="80"
                                />
                              </label>
                            ) : null}
                          </div>

                          {zone.defaultRate.pricingMode === "weight_based" ? (
                            <div className="grid gap-2 md:grid-cols-4">
                              <input value={zone.defaultRate.weightBased.baseRate} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, weightBased: { ...entry.defaultRate.weightBased, baseRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Base rate" />
                              <input value={zone.defaultRate.weightBased.includedKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, weightBased: { ...entry.defaultRate.weightBased, includedKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } } } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Included kg" />
                              <input value={zone.defaultRate.weightBased.additionalRatePerKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, weightBased: { ...entry.defaultRate.weightBased, additionalRatePerKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Extra per kg" />
                              <label className="flex items-center gap-2 rounded-[8px] border border-black/10 bg-[#fafafa] px-3 py-2.5 text-[12px] text-[#202020]"><input type="checkbox" checked={zone.defaultRate.weightBased.roundUpToNextKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, weightBased: { ...entry.defaultRate.weightBased, roundUpToNextKg: event.target.checked } } } : entry) }))} disabled={!canEditSettings} />Round up</label>
                            </div>
                          ) : null}

                          {zone.defaultRate.pricingMode === "tiered" ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <FieldHelpLabel
                                  label="Weight bands"
                                  help="Create weight ranges for this province override. Each order matches the band that contains its combined basket weight."
                                />
                                <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, tiered: [...entry.defaultRate.tiered, { minWeightKg: "", maxWeightKg: "", rate: "" }] } } : entry) }))} disabled={!canEditSettings} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"><span aria-hidden="true" className="text-[13px] leading-none">+</span>Add band</button>
                              </div>
                              {zone.defaultRate.tiered.map((tier, tierIndex) => (
                                <div key={`${zone.id}-country-tier-${tierIndex}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                                  <input value={tier.minWeightKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, tiered: entry.defaultRate.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, minWeightKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } : band) } } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Min kg" />
                                  <input value={tier.maxWeightKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, tiered: entry.defaultRate.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, maxWeightKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } : band) } } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Max kg" />
                                  <input value={tier.rate} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, tiered: entry.defaultRate.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, rate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : band) } } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Rate" />
                                  <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, tiered: entry.defaultRate.tiered.filter((_, bandIndex) => bandIndex !== tierIndex) } } : entry) }))} disabled={!canEditSettings || zone.defaultRate.tiered.length <= 1} className="rounded-[8px] border border-[#ef4444]/20 bg-white px-3 py-2.5 text-[11px] font-semibold text-[#b91c1c]">Remove band</button>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {zone.defaultRate.pricingMode === "order_value_based" ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <FieldHelpLabel
                                  label="Order value bands"
                                  help="Create basket-value ranges for this province override. Each buyer will be charged the rate that matches their order total in this province."
                                />
                                <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, orderValueBased: [...entry.defaultRate.orderValueBased, { minOrderValue: "", maxOrderValue: "", rate: "" }] } } : entry) }))} disabled={!canEditSettings} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"><span aria-hidden="true" className="text-[13px] leading-none">+</span>Add band</button>
                              </div>
                              {zone.defaultRate.orderValueBased.map((band, bandIndex) => (
                                <div key={`${zone.id}-country-order-${bandIndex}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                                  <input value={band.minOrderValue} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, orderValueBased: entry.defaultRate.orderValueBased.map((entryBand, entryIndex) => entryIndex === bandIndex ? { ...entryBand, minOrderValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entryBand) } } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Min value" />
                                  <input value={band.maxOrderValue} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, orderValueBased: entry.defaultRate.orderValueBased.map((entryBand, entryIndex) => entryIndex === bandIndex ? { ...entryBand, maxOrderValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entryBand) } } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Max value" />
                                  <input value={band.rate} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, orderValueBased: entry.defaultRate.orderValueBased.map((entryBand, entryIndex) => entryIndex === bandIndex ? { ...entryBand, rate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entryBand) } } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Rate" />
                                  <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, orderValueBased: entry.defaultRate.orderValueBased.filter((_, entryIndex) => entryIndex !== bandIndex) } } : entry) }))} disabled={!canEditSettings || zone.defaultRate.orderValueBased.length <= 1} className="rounded-[8px] border border-[#ef4444]/20 bg-white px-3 py-2.5 text-[11px] font-semibold text-[#b91c1c]">Remove band</button>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {zone.defaultRate.pricingMode === "free_over_threshold" ? (
                            <div className="grid gap-2 md:grid-cols-2">
                              <input value={zone.defaultRate.freeOverThreshold.threshold} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, freeOverThreshold: { ...entry.defaultRate.freeOverThreshold, threshold: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Free over value" />
                              <input value={zone.defaultRate.freeOverThreshold.fallbackRate} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, defaultRate: { ...entry.defaultRate, freeOverThreshold: { ...entry.defaultRate.freeOverThreshold, fallbackRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Otherwise charge" />
                            </div>
                          ) : null}

                          <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
                            <label className="block">
                              <FieldHelpLabel
                                label="Batching"
                                help="Choose how multiple items in this province override should be grouped for shipping. Per order charges one fee for the batch, highest item shipping uses the highest matched charge, combine weight uses total kg, and per item charges each unit separately."
                                className="mb-1.5"
                              />
                              <select value={zone.batching.mode} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, batching: { ...entry.batching, mode: event.target.value as SellerShippingSettings["localDelivery"]["batching"]["mode"] } } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none"><option value="single_shipping_fee">{getBatchingOptionLabel("single_shipping_fee")}</option><option value="highest_item_shipping">{getBatchingOptionLabel("highest_item_shipping")}</option><option value="combine_weight">{getBatchingOptionLabel("combine_weight")}</option><option value="per_item">{getBatchingOptionLabel("per_item")}</option></select>
                            </label>
                            <label className="block">
                              <FieldHelpLabel
                                label={getBatchLimitLabel(zone.batching.mode)}
                                help="Optional cap for each shipping batch in this province override. If a basket exceeds this limit, checkout splits it into multiple batches and sums the shipping across them."
                                className="mb-1.5"
                              />
                              <input value={zone.batching.maxBatchLimit} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, batching: { ...entry.batching, maxBatchLimit: event.target.value.replace(/[^\d]/g, "").slice(0, 3) } } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder={getBatchLimitPlaceholder(zone.batching.mode)} />
                            </label>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <label className="block">
                              <FieldHelpLabel label="Min days" help="Shortest estimated delivery time for this zone province override." className="mb-1.5" />
                              <input value={zone.estimatedDeliveryDays.min} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, estimatedDeliveryDays: clampEtaDaysRange(entry.estimatedDeliveryDays, { min: event.target.value }) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="2" />
                            </label>
                            <label className="block">
                              <FieldHelpLabel label="Max days" help="Longest estimated delivery time for this zone province override." className="mb-1.5" />
                              <input value={zone.estimatedDeliveryDays.max} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, estimatedDeliveryDays: clampEtaDaysRange(entry.estimatedDeliveryDays, { max: event.target.value }) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="5" />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {zone.coverageType === "province" ? (
                    <div className="mt-4 rounded-[8px] border border-black/10 bg-[#fafafa] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[12px] font-semibold text-[#202020]">Province overrides</p>
                        <button
                          type="button"
                          onClick={() => setShippingSettings((current) => ({
                            ...current,
                            zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: [...entry.provinces, { province: "", placeId: "", enabled: true, rateOverrideEnabled: false, rateOverride: makeShippingRateDraft(), batching: { enabled: true, mode: "single_shipping_fee", maxBatchLimit: "" }, estimatedDeliveryDays: { min: "", max: "" } }] } : entry),
                          }))}
                          disabled={!canEditSettings || !zone.countryCode}
                          className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"
                        >
                          Add province
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {!zone.countryCode ? (
                          <div className="rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-3 text-[11px] text-[#57636c]">
                            Choose a zone country first, then search Google provinces / states for that country.
                          </div>
                        ) : null}
                        {zone.provinces.map((province, provinceIndex) => (
                          <div key={`${zone.id}-province-${provinceIndex}`} className="grid gap-3 rounded-[8px] border border-black/10 bg-white p-3">
                            <div className="space-y-1.5">
                              <FieldHelpLabel
                                label="Province / region"
                                help="Choose the province or state that this override applies to inside the selected zone country. Buyers in this province will use the pricing and batching settings in this block."
                              />
                              <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                                <GoogleAdminRegionSelect
                                  countryCode={zone.countryCode}
                                  value={province.province}
                                  placeId={province.placeId}
                                  onSelect={(selection) => setShippingSettings((current) => ({
                                    ...current,
                                    zones: current.zones.map((entry, index) => index === zoneIndex ? {
                                      ...entry,
                                      provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, province: selection.label, placeId: selection.placeId } : item),
                                    } : entry),
                                  }))}
                                  disabled={!canEditSettings}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShippingSettings((current) => ({
                                    ...current,
                                    zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.filter((_, itemIndex) => itemIndex !== provinceIndex) } : entry),
                                  }))}
                                  disabled={!canEditSettings}
                                  aria-label="Remove province override"
                                  title="Remove province override"
                                  className="inline-flex h-[46px] w-[46px] items-center justify-center rounded-[8px] border border-[#ef4444]/20 bg-white text-[#b91c1c] transition hover:bg-[#fff5f5] disabled:opacity-60"
                                >
                                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18" />
                                    <path d="M8 6V4h8v2" />
                                    <path d="M19 6l-1 14H6L5 6" />
                                    <path d="M10 11v6" />
                                    <path d="M14 11v6" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            <div className={`grid gap-2 ${province.rateOverride.pricingMode === "flat" ? "md:grid-cols-[220px_1fr]" : "md:grid-cols-[220px]"}`}>
                              <label className="block">
                                <FieldHelpLabel
                                  label="Pricing method"
                                  help="Choose how shipping should be calculated for this province override. This override applies only to buyers whose address falls inside this province."
                                  className="mb-1.5"
                                />
                                <select
                                  value={province.rateOverride.pricingMode}
                                  onChange={(event) => setShippingSettings((current) => ({
                                    ...current,
                                    zones: current.zones.map((entry, index) => index === zoneIndex ? {
                                      ...entry,
                                      provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, pricingMode: event.target.value as SellerShippingRateDraft["pricingMode"] } } : item),
                                    } : entry),
                                  }))}
                                  disabled={!canEditSettings}
                                  className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none"
                                >
                                  <option value="flat">Flat rate</option>
                                  <option value="weight_based">Weight based</option>
                                  <option value="tiered">Tiered by weight</option>
                                  <option value="order_value_based">Order value based</option>
                                  <option value="free_over_threshold">Free over threshold</option>
                                </select>
                              </label>
                              {province.rateOverride.pricingMode === "flat" ? (
                                <label className="block">
                                  <FieldHelpLabel
                                    label="Flat shipping fee"
                                    help="This is the fixed shipping amount charged when this province override uses flat-rate pricing."
                                    className="mb-1.5"
                                  />
                                  <input
                                    value={province.rateOverride.flatRate}
                                    onChange={(event) => setShippingSettings((current) => ({
                                      ...current,
                                      zones: current.zones.map((entry, index) => index === zoneIndex ? {
                                        ...entry,
                                        provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, flatRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } : item),
                                      } : entry),
                                    }))}
                                    disabled={!canEditSettings}
                                    className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none"
                                    placeholder="80"
                                  />
                                </label>
                              ) : null}
                            </div>

                            {province.rateOverride.pricingMode === "weight_based" ? (
                              <div className="grid gap-2 md:grid-cols-4">
                                <input value={province.rateOverride.weightBased.baseRate} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, baseRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Base rate" />
                                <input value={province.rateOverride.weightBased.includedKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, includedKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Included kg" />
                                <input value={province.rateOverride.weightBased.additionalRatePerKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, additionalRatePerKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Extra per kg" />
                                <label className="flex items-center gap-2 rounded-[8px] border border-black/10 bg-[#fafafa] px-3 py-2.5 text-[12px] text-[#202020]"><input type="checkbox" checked={province.rateOverride.weightBased.roundUpToNextKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, roundUpToNextKg: event.target.checked } } } : item) } : entry) }))} disabled={!canEditSettings} />Round up</label>
                              </div>
                            ) : null}

                            {province.rateOverride.pricingMode === "tiered" ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                  <FieldHelpLabel
                                    label="Weight bands"
                                    help="Create weight ranges for this province override. Each order matches the band that contains its combined basket weight."
                                  />
                                  <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: [...item.rateOverride.tiered, { minWeightKg: "", maxWeightKg: "", rate: "" }] } } : item) } : entry) }))} disabled={!canEditSettings} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"><span aria-hidden="true" className="text-[13px] leading-none">+</span>Add band</button>
                                </div>
                                {province.rateOverride.tiered.map((tier, tierIndex) => (
                                  <div key={`${zone.id}-province-tier-${provinceIndex}-${tierIndex}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                                    <input value={tier.minWeightKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, minWeightKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } : band) } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Min kg" />
                                    <input value={tier.maxWeightKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, maxWeightKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } : band) } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Max kg" />
                                    <input value={tier.rate} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, rate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : band) } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Rate" />
                                    <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.filter((_, bandIndex) => bandIndex !== tierIndex) } } : item) } : entry) }))} disabled={!canEditSettings || province.rateOverride.tiered.length <= 1} className="rounded-[8px] border border-[#ef4444]/20 bg-white px-3 py-2.5 text-[11px] font-semibold text-[#b91c1c]">Remove band</button>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            {province.rateOverride.pricingMode === "order_value_based" ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-3">
                                  <FieldHelpLabel
                                    label="Order value bands"
                                    help="Create basket-value ranges for this province override. Each buyer will be charged the rate that matches their order total in this province."
                                  />
                                  <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: [...item.rateOverride.orderValueBased, { minOrderValue: "", maxOrderValue: "", rate: "" }] } } : item) } : entry) }))} disabled={!canEditSettings} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"><span aria-hidden="true" className="text-[13px] leading-none">+</span>Add band</button>
                                </div>
                                {province.rateOverride.orderValueBased.map((band, bandIndex) => (
                                  <div key={`${zone.id}-province-order-${provinceIndex}-${bandIndex}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                                    <input value={band.minOrderValue} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.map((entryBand, entryIndex) => entryIndex === bandIndex ? { ...entryBand, minOrderValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entryBand) } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Min value" />
                                    <input value={band.maxOrderValue} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.map((entryBand, entryIndex) => entryIndex === bandIndex ? { ...entryBand, maxOrderValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entryBand) } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Max value" />
                                    <input value={band.rate} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.map((entryBand, entryIndex) => entryIndex === bandIndex ? { ...entryBand, rate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entryBand) } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Rate" />
                                    <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.filter((_, entryIndex) => entryIndex !== bandIndex) } } : item) } : entry) }))} disabled={!canEditSettings || province.rateOverride.orderValueBased.length <= 1} className="rounded-[8px] border border-[#ef4444]/20 bg-white px-3 py-2.5 text-[11px] font-semibold text-[#b91c1c]">Remove band</button>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            {province.rateOverride.pricingMode === "free_over_threshold" ? (
                              <div className="grid gap-2 md:grid-cols-2">
                                <input value={province.rateOverride.freeOverThreshold.threshold} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, freeOverThreshold: { ...item.rateOverride.freeOverThreshold, threshold: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Free over value" />
                                <input value={province.rateOverride.freeOverThreshold.fallbackRate} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, freeOverThreshold: { ...item.rateOverride.freeOverThreshold, fallbackRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Otherwise charge" />
                              </div>
                            ) : null}

                            <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
                              <label className="block">
                                <FieldHelpLabel
                                  label="Batching"
                                  help="Choose how multiple items in this province override should be grouped for shipping. Per order charges one fee for the batch, highest item shipping uses the highest matched charge, combine weight uses total kg, and per item charges each unit separately."
                                  className="mb-1.5"
                                />
                                <select value={province.batching.mode} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, batching: { ...item.batching, mode: event.target.value as SellerShippingSettings["localDelivery"]["batching"]["mode"] } } : item) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none"><option value="single_shipping_fee">{getBatchingOptionLabel("single_shipping_fee")}</option><option value="highest_item_shipping">{getBatchingOptionLabel("highest_item_shipping")}</option><option value="combine_weight">{getBatchingOptionLabel("combine_weight")}</option><option value="per_item">{getBatchingOptionLabel("per_item")}</option></select>
                              </label>
                              <label className="block">
                                <FieldHelpLabel
                                  label={getBatchLimitLabel(province.batching.mode)}
                                  help="Optional cap for each shipping batch in this province override. If a basket exceeds this limit, checkout splits it into multiple batches and sums the shipping across them."
                                  className="mb-1.5"
                                />
                                <input value={province.batching.maxBatchLimit} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, batching: { ...item.batching, maxBatchLimit: event.target.value.replace(/[^\d]/g, "").slice(0, 3) } } : item) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder={getBatchLimitPlaceholder(province.batching.mode)} />
                              </label>
                            </div>
                            <div className="grid gap-2 md:grid-cols-2">
                              <label className="block">
                                <FieldHelpLabel label="Min days" help="Shortest estimated delivery time for this zone province override." className="mb-1.5" />
                                <input value={province.estimatedDeliveryDays.min} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, estimatedDeliveryDays: clampEtaDaysRange(item.estimatedDeliveryDays, { min: event.target.value }) } : item) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="2" />
                              </label>
                              <label className="block">
                                <FieldHelpLabel label="Max days" help="Longest estimated delivery time for this zone province override." className="mb-1.5" />
                                <input value={province.estimatedDeliveryDays.max} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, provinces: entry.provinces.map((item, itemIndex) => itemIndex === provinceIndex ? { ...item, estimatedDeliveryDays: clampEtaDaysRange(item.estimatedDeliveryDays, { max: event.target.value }) } : item) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="5" />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {zone.coverageType === "postal_code_group" ? (
                    <div className="mt-4 rounded-[8px] border border-black/10 bg-[#fafafa] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[12px] font-semibold text-[#202020]">Postal code groups</p>
                        <button
                          type="button"
                          onClick={() => setShippingSettings((current) => ({
                            ...current,
                            zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: [...entry.postalCodeGroups, { name: "", coverageMode: "exact", postalCodes: "", rangeFrom: "", rangeTo: "", rateOverrideEnabled: false, rateOverride: makeShippingRateDraft(), batching: { enabled: true, mode: "single_shipping_fee", maxBatchLimit: "" }, estimatedDeliveryDays: { min: "", max: "" } }] } : entry),
                          }))}
                          disabled={!canEditSettings}
                          className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"
                        >
                          Add postal group
                        </button>
                      </div>
                      <div className="mt-3 space-y-3">
                        {zone.postalCodeGroups.map((group, groupIndex) => {
                          const coverageMode = getPostalGroupCoverageMode(group);
                          return (
                            <div key={`${zone.id}-postal-${groupIndex}`} className="rounded-[8px] border border-black/10 bg-white p-3">
                              <div className="space-y-1.5">
                                <FieldHelpLabel
                                  label="Group name"
                                  help="Give this postal-code group a clear internal name, like Cape Town Metro or Winelands, so you can recognise what area this override covers inside this zone."
                                />
                                <div className="flex items-center gap-2">
                                  <input value={group.name} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, name: event.target.value.slice(0, 80) } : item) } : entry) }))} disabled={!canEditSettings} className="min-w-0 w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Cape Town Metro" />
                                  <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.filter((_, itemIndex) => itemIndex !== groupIndex) } : entry) }))} disabled={!canEditSettings} aria-label="Remove postal code group" title="Remove postal code group" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border border-[#ef4444]/20 bg-white text-[#b91c1c] transition hover:bg-[#fff5f5] disabled:opacity-60"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg></button>
                                </div>
                              </div>
                              <div className="mt-3 grid gap-3">
                                <div className="rounded-[8px] border border-black/10 bg-white p-4">
                                  <FieldHelpLabel
                                    label="Coverage type"
                                    help="Choose one way to define this group. Use exact postal codes for a fixed list, or use a range for a continuous postcode span. Each group should use only one coverage style."
                                    className="mb-3"
                                  />
                                  <div className="flex w-full rounded-[10px] bg-[#ececec] p-1">
                                    <label className="min-w-0 flex-1">
                                      <input type="radio" name={`zone-postal-coverage-${zone.id}-${groupIndex}`} value="exact" checked={coverageMode === "exact"} onChange={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, coverageMode: "exact", rangeFrom: "", rangeTo: "" } : item) } : entry) }))} disabled={!canEditSettings} className="sr-only" />
                                      <span className={`inline-flex h-11 w-full items-center justify-center rounded-[8px] px-4 text-[13px] font-semibold transition ${coverageMode === "exact" ? "bg-[#cbb26b] text-white shadow-[0_2px_6px_rgba(20,24,27,0.1)]" : "text-[#4b5563]"}`}>Exact postal codes</span>
                                    </label>
                                    <label className="min-w-0 flex-1">
                                      <input type="radio" name={`zone-postal-coverage-${zone.id}-${groupIndex}`} value="range" checked={coverageMode === "range"} onChange={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, coverageMode: "range", postalCodes: "" } : item) } : entry) }))} disabled={!canEditSettings} className="sr-only" />
                                      <span className={`inline-flex h-11 w-full items-center justify-center rounded-[8px] px-4 text-[13px] font-semibold transition ${coverageMode === "range" ? "bg-[#cbb26b] text-white shadow-[0_2px_6px_rgba(20,24,27,0.1)]" : "text-[#4b5563]"}`}>Postal code range</span>
                                    </label>
                                  </div>
                                </div>

                                {coverageMode === "exact" ? (
                                  <label className="block">
                                    <FieldHelpLabel label="Exact postal codes" help="Enter a comma-separated list of exact postal codes that belong to this zone group. Use this when you know the exact destination postcodes you want to price together." className="mb-1.5" />
                                    <input value={group.postalCodes} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, coverageMode: "exact", postalCodes: event.target.value, rangeFrom: "", rangeTo: "" } : item) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="8001, 8005, 7700" />
                                  </label>
                                ) : (
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <label className="block">
                                      <FieldHelpLabel label="Postal code range from" help="Range start for this group. Buyers whose postcode falls between the start and end value can match this group." className="mb-1.5" />
                                      <input value={group.rangeFrom} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, coverageMode: "range", rangeFrom: event.target.value, postalCodes: "" } : item) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="7500" />
                                    </label>
                                    <label className="block">
                                      <FieldHelpLabel label="Postal code range to" help="Range end for this group. Buyers whose postcode falls between the start and end value can match this group." className="mb-1.5" />
                                      <input value={group.rangeTo} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, coverageMode: "range", rangeTo: event.target.value, postalCodes: "" } : item) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="7999" />
                                    </label>
                                  </div>
                                )}

                                <div className={`${group.rateOverride.pricingMode === "flat" ? "grid gap-2 md:grid-cols-[220px_1fr]" : "grid gap-2 md:grid-cols-[220px]"}`}>
                                  <label className="block">
                                    <FieldHelpLabel label="Pricing method" help="Choose how shipping should be calculated for this postal-code group. This applies only when the buyer matches this exact group or postcode range." className="mb-1.5" />
                                    <select value={group.rateOverride.pricingMode} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, pricingMode: event.target.value as SellerShippingRateDraft["pricingMode"] } } : item) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none"><option value="flat">Flat rate</option><option value="weight_based">Weight based</option><option value="tiered">Tiered by weight</option><option value="order_value_based">Order value based</option><option value="free_over_threshold">Free over threshold</option></select>
                                  </label>
                                  {group.rateOverride.pricingMode === "flat" ? (
                                    <label className="block">
                                      <FieldHelpLabel label="Flat shipping fee" help="This is the one fixed shipping amount charged when this postal-code group uses flat-rate pricing." className="mb-1.5" />
                                      <input value={group.rateOverride.flatRate} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, flatRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } : item) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="80" />
                                    </label>
                                  ) : null}
                                </div>

                                {group.rateOverride.pricingMode === "weight_based" ? (
                                  <div className="grid gap-2 md:grid-cols-4">
                                    <input value={group.rateOverride.weightBased.baseRate} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, baseRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Base rate" />
                                    <input value={group.rateOverride.weightBased.includedKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, includedKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Included kg" />
                                    <input value={group.rateOverride.weightBased.additionalRatePerKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, additionalRatePerKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Extra per kg" />
                                    <label className="flex items-center gap-2 rounded-[8px] border border-black/10 bg-[#fafafa] px-3 py-2.5 text-[12px] text-[#202020]"><input type="checkbox" checked={group.rateOverride.weightBased.roundUpToNextKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, weightBased: { ...item.rateOverride.weightBased, roundUpToNextKg: event.target.checked } } } : item) } : entry) }))} disabled={!canEditSettings} />Round up</label>
                                  </div>
                                ) : null}

                                {group.rateOverride.pricingMode === "tiered" ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                      <FieldHelpLabel label="Weight bands" help="Create weight ranges for this postal-code group. Each order matches the band that contains its combined basket weight." />
                                      <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: [...item.rateOverride.tiered, { minWeightKg: "", maxWeightKg: "", rate: "" }] } } : item) } : entry) }))} disabled={!canEditSettings} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"><span aria-hidden="true" className="text-[13px] leading-none">+</span>Add band</button>
                                    </div>
                                    {group.rateOverride.tiered.map((tier, tierIndex) => (
                                      <div key={`${zone.id}-postal-tier-${groupIndex}-${tierIndex}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                                        <input value={tier.minWeightKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, minWeightKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } : band) } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Min kg" />
                                        <input value={tier.maxWeightKg} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, maxWeightKg: event.target.value.replace(/[^\d.]/g, "").slice(0, 6) } : band) } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Max kg" />
                                        <input value={tier.rate} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.map((band, bandIndex) => bandIndex === tierIndex ? { ...band, rate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : band) } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Rate" />
                                        <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, tiered: item.rateOverride.tiered.filter((_, bandIndex) => bandIndex !== tierIndex) } } : item) } : entry) }))} disabled={!canEditSettings || group.rateOverride.tiered.length <= 1} className="rounded-[8px] border border-[#ef4444]/20 bg-white px-3 py-2.5 text-[11px] font-semibold text-[#b91c1c]">Remove band</button>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}

                                {group.rateOverride.pricingMode === "order_value_based" ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                      <FieldHelpLabel label="Order value bands" help="Create basket-value ranges for this postal-code group. Each buyer will be charged the rate that matches their order total in this area." />
                                      <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: [...item.rateOverride.orderValueBased, { minOrderValue: "", maxOrderValue: "", rate: "" }] } } : item) } : entry) }))} disabled={!canEditSettings} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"><span aria-hidden="true" className="text-[13px] leading-none">+</span>Add band</button>
                                    </div>
                                    {group.rateOverride.orderValueBased.map((band, bandIndex) => (
                                      <div key={`${zone.id}-postal-order-${groupIndex}-${bandIndex}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                                        <input value={band.minOrderValue} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.map((entryBand, entryIndex) => entryIndex === bandIndex ? { ...entryBand, minOrderValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entryBand) } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Min value" />
                                        <input value={band.maxOrderValue} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.map((entryBand, entryIndex) => entryIndex === bandIndex ? { ...entryBand, maxOrderValue: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entryBand) } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Max value" />
                                        <input value={band.rate} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.map((entryBand, entryIndex) => entryIndex === bandIndex ? { ...entryBand, rate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } : entryBand) } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Rate" />
                                        <button type="button" onClick={() => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, orderValueBased: item.rateOverride.orderValueBased.filter((_, entryIndex) => entryIndex !== bandIndex) } } : item) } : entry) }))} disabled={!canEditSettings || group.rateOverride.orderValueBased.length <= 1} className="rounded-[8px] border border-[#ef4444]/20 bg-white px-3 py-2.5 text-[11px] font-semibold text-[#b91c1c]">Remove band</button>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}

                                {group.rateOverride.pricingMode === "free_over_threshold" ? (
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <input value={group.rateOverride.freeOverThreshold.threshold} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, freeOverThreshold: { ...item.rateOverride.freeOverThreshold, threshold: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Free over value" />
                                    <input value={group.rateOverride.freeOverThreshold.fallbackRate} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, rateOverrideEnabled: true, rateOverride: { ...item.rateOverride, freeOverThreshold: { ...item.rateOverride.freeOverThreshold, fallbackRate: event.target.value.replace(/[^\d.]/g, "").slice(0, 8) } } } : item) } : entry) }))} disabled={!canEditSettings} className="rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="Otherwise charge" />
                                  </div>
                                ) : null}

                                <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
                                  <label className="block">
                                    <FieldHelpLabel label="Batching" help="Choose how multiple items in this postal-code group should be grouped for shipping. Per order charges one fee for the batch, highest item shipping uses the highest matched charge, combine weight uses total kg, and per item charges each unit separately." className="mb-1.5" />
                                    <select value={group.batching.mode} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, batching: { ...item.batching, mode: event.target.value as SellerShippingSettings["localDelivery"]["batching"]["mode"] } } : item) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none"><option value="single_shipping_fee">{getBatchingOptionLabel("single_shipping_fee")}</option><option value="highest_item_shipping">{getBatchingOptionLabel("highest_item_shipping")}</option><option value="combine_weight">{getBatchingOptionLabel("combine_weight")}</option><option value="per_item">{getBatchingOptionLabel("per_item")}</option></select>
                                  </label>
                                  <label className="block">
                                    <FieldHelpLabel label={getBatchLimitLabel(group.batching.mode)} help="Optional cap for each shipping batch in this postal-code group. If a basket exceeds this limit, checkout splits it into multiple batches and sums the shipping across them." className="mb-1.5" />
                                    <input value={group.batching.maxBatchLimit} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, batching: { ...item.batching, maxBatchLimit: event.target.value.replace(/[^\d]/g, "").slice(0, 3) } } : item) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder={getBatchLimitPlaceholder(group.batching.mode)} />
                                  </label>
                                </div>
                                <div className="grid gap-2 md:grid-cols-2">
                                  <label className="block">
                                    <FieldHelpLabel label="Min days" help="Shortest estimated delivery time for this zone postal-code group." className="mb-1.5" />
                                    <input value={group.estimatedDeliveryDays.min} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, estimatedDeliveryDays: clampEtaDaysRange(item.estimatedDeliveryDays, { min: event.target.value }) } : item) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="2" />
                                  </label>
                                  <label className="block">
                                    <FieldHelpLabel label="Max days" help="Longest estimated delivery time for this zone postal-code group." className="mb-1.5" />
                                    <input value={group.estimatedDeliveryDays.max} onChange={(event) => setShippingSettings((current) => ({ ...current, zones: current.zones.map((entry, index) => index === zoneIndex ? { ...entry, postalCodeGroups: entry.postalCodeGroups.map((item, itemIndex) => itemIndex === groupIndex ? { ...item, estimatedDeliveryDays: clampEtaDaysRange(item.estimatedDeliveryDays, { max: event.target.value }) } : item) } : entry) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none" placeholder="5" />
                                  </label>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                </div>
              ))}
            </div>
          </div>
        </div>
      </SettingsSection>
      ) : null}

      {visibleSectionSet.has("business") ? (
      <SettingsSection
        eyebrow="Business details"
        title="Supplier details for invoices"
        description="Keep your legal business and VAT details current so customer invoices can show the right seller information."
        expanded={standaloneSection === "business" ? true : sectionOpen.business}
        onToggle={() => standaloneSection === "business" ? undefined : setSectionOpen((current) => ({ ...current, business: !current.business }))}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Registered business name</span>
            <input
              value={businessDetails.companyName}
              onChange={(event) => setBusinessDetails((current) => ({ ...current, companyName: event.target.value.slice(0, 120) }))}
              placeholder="Piessang Trading (Pty) Ltd"
              disabled={!canEditSettings}
              className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none disabled:bg-[#f7f7f7]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">VAT number</span>
            <input
              value={businessDetails.vatNumber}
              onChange={(event) => setBusinessDetails((current) => ({ ...current, vatNumber: event.target.value.slice(0, 40) }))}
              placeholder="4760314296"
              disabled={!canEditSettings}
              className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none disabled:bg-[#f7f7f7]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Registration number</span>
            <input
              value={businessDetails.registrationNumber}
              onChange={(event) => setBusinessDetails((current) => ({ ...current, registrationNumber: event.target.value.slice(0, 60) }))}
              placeholder="2026/123456/07"
              disabled={!canEditSettings}
              className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none disabled:bg-[#f7f7f7]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Business email</span>
            <input
              value={businessDetails.email}
              onChange={(event) => setBusinessDetails((current) => ({ ...current, email: event.target.value.slice(0, 120) }))}
              placeholder="accounts@yourbusiness.com"
              disabled={!canEditSettings}
              className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none disabled:bg-[#f7f7f7]"
            />
          </label>
          <div className="block">
            <PhoneInput
              label="Business phone"
              countryCode={businessPhoneCountryCode}
              localNumber={businessPhoneLocalNumber}
              onCountryCodeChange={(value) => {
                const nextCode = String(value || "27");
                const nextLocal = sanitizePhoneLocalNumber(nextCode, businessPhoneLocalNumber);
                setBusinessPhoneCountryCode(nextCode);
                setBusinessPhoneLocalNumber(nextLocal);
                setBusinessDetails((current) => ({
                  ...current,
                  phoneNumber: combinePhoneNumber(nextCode, nextLocal),
                }));
              }}
              onLocalNumberChange={(value) => {
                const nextLocal = sanitizePhoneLocalNumber(businessPhoneCountryCode, value);
                setBusinessPhoneLocalNumber(nextLocal);
                setBusinessDetails((current) => ({
                  ...current,
                  phoneNumber: combinePhoneNumber(businessPhoneCountryCode, nextLocal),
                }));
              }}
              disabled={!canEditSettings}
              hint="This will be saved with the full international dialing code."
            />
          </div>
          <label className="block md:col-span-2">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Registered business address</span>
            <textarea
              value={businessDetails.addressText}
              onChange={(event) => setBusinessDetails((current) => ({ ...current, addressText: event.target.value.slice(0, 240) }))}
              placeholder="Unit 2, 4 Example Street, Paarl, Western Cape, 7646"
              disabled={!canEditSettings}
              rows={3}
              className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none disabled:bg-[#f7f7f7]"
            />
          </label>
        </div>
      </SettingsSection>
      ) : null}

      {visibleSectionSet.has("payouts") ? (
      <SettingsSection
        eyebrow="Payout settings"
        title="Where Piessang should pay you"
        description="Add the bank details where Piessang should send your seller payouts."
        expanded={standaloneSection === "payouts" ? true : sectionOpen.payouts}
        onToggle={() => standaloneSection === "payouts" ? undefined : setSectionOpen((current) => ({ ...current, payouts: !current.payouts }))}
      >
        <div className="mt-4 rounded-[8px] border border-black/10 bg-[#fafafa] px-4 py-3 text-[12px] leading-[1.7] text-[#57636c]">
          <div>
            <p className="font-semibold text-[#202020]">How this works</p>
            <p className="mt-1">Fill in your bank details, then use the button at the bottom of this form to save your details and connect your payout destination automatically.</p>
          </div>
          <p className="mt-2 text-[12px] text-[#57636c]">
            {recipientId
              ? "If you change your bank details later, use the same button again and Piessang will refresh your payout destination."
              : "You only need to do this once unless your payout details change later."}
          </p>
        </div>

        {payoutErrorNotice ? (
          <div className="mt-3 rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-4 text-[13px] leading-[1.7] text-[#7f1d1d]">
            <p className="font-semibold text-[#b91c1c]">We couldn&apos;t complete your payout setup.</p>
            <p className="mt-1">{payoutErrorNotice}</p>
            <p className="mt-2">
              If you&apos;re unsure how to fix this, please contact support or create a support ticket and we&apos;ll help you finish the payout setup.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/support/tickets"
                className="inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#2b2b2b]"
              >
                Create support ticket
              </Link>
              <Link
                href="/support"
                className="inline-flex h-9 items-center rounded-[8px] border border-[#d9b5b8] bg-white px-3 text-[12px] font-semibold text-[#7f1d1d] transition-colors hover:border-[#b91c1c]"
              >
                Contact support
              </Link>
            </div>
          </div>
        ) : null}

        <div className="mt-3 rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Account holder name</span>
              <input value={payoutProfile.accountHolderName} onChange={(event) => setPayoutProfile((current) => ({ ...current, provider: payoutProvider, accountHolderName: event.target.value.slice(0, 120) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none disabled:bg-[#f7f7f7]" placeholder="Dillon Jurgens" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Recipient email</span>
              <input value={sellerPayoutEmail} readOnly disabled className="w-full cursor-not-allowed rounded-[8px] border border-black/10 bg-[#f7f7f7] h-12 px-3 text-[13px] outline-none disabled:bg-[#f7f7f7]" placeholder="seller email" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Currency</span>
              <div className="w-full rounded-[8px] border border-black/10 bg-[#f7f7f7] h-12 px-3 text-[13px] font-medium text-[#202020]">
                {payoutProfile.currency || getDefaultPayoutCurrency(payoutProfile.bankCountry) || "USD"}
              </div>
              <p className="mt-1.5 text-[11px] leading-[1.5] text-[#57636c]">
                Currency is set automatically from the selected bank country.
              </p>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Bank country</span>
              <select
                value={payoutProfile.bankCountry}
                onChange={(event) =>
                  setPayoutProfile((current) => {
                    const nextCountry = event.target.value;
                    const nextCurrency = getDefaultPayoutCurrency(nextCountry) || current.currency || "USD";
                    return {
                      ...current,
                      provider: payoutProvider,
                      bankCountry: nextCountry,
                      country: nextCountry,
                      currency: nextCurrency,
                      beneficiaryCountry: current.beneficiaryCountry || nextCountry,
                    };
                  })
                }
                disabled={!canEditSettings}
                className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none disabled:bg-[#f7f7f7]"
              >
                {SUPPORTED_PAYOUT_COUNTRIES.map((entry) => (
                  <option key={entry.code} value={entry.code}>{entry.label}</option>
                ))}
              </select>
            </label>
            {wiseRequirementsLoading ? (
              <div className="rounded-[8px] border border-black/10 bg-white px-3 py-3 text-[12px] text-[#57636c] md:col-span-2 xl:col-span-3">
                Loading Wise payout fields...
              </div>
            ) : null}
            {wiseRequirementsError ? (
              <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-3 py-3 text-[12px] text-[#b91c1c] md:col-span-2 xl:col-span-3">
                {wiseRequirementsError}
              </div>
            ) : null}
            {groupedWiseRequirementFields.map((group) => (
              <div key={group.title} className="rounded-[8px] border border-black/10 bg-white p-4 md:col-span-2 xl:col-span-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#907d4c]">{group.title}</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.fields.map((field) => {
                    const key = normalizeWiseFieldKey(field.key);
                    const inputMode = guessWiseFieldInputMode(field);
                    const value = getWiseDetailFallback(payoutProfile, key);
                    const friendlyLabel = getFriendlyWiseFieldLabel(field);
                    const helpText = getWiseFieldHelpText(field);
                    const booleanOptions = getWiseBooleanOptions(field);
                    const accountTypeOptions = getWiseAccountTypeOptions(field);
                    return (
                      <label key={key} className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                          {friendlyLabel}
                          {field.required !== false ? " *" : ""}
                        </span>
                        {inputMode === "select" ? (
                          <select
                            value={value}
                            onChange={(event) =>
                              setPayoutProfile((current) => ({
                                ...current,
                                provider: payoutProvider,
                                wiseDetails: {
                                  ...current.wiseDetails,
                                  [key]: event.target.value,
                                },
                              }))
                            }
                            disabled={!canEditSettings}
                            className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none disabled:bg-[#f7f7f7]"
                          >
                            <option value="">Select</option>
                            {(field.values || []).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : inputMode === "boolean" ? (
                          <select
                            value={value || "false"}
                            onChange={(event) =>
                              setPayoutProfile((current) => ({
                                ...current,
                                provider: payoutProvider,
                                wiseDetails: {
                                  ...current.wiseDetails,
                                  [key]: event.target.value,
                                },
                              }))
                            }
                            disabled={!canEditSettings}
                            className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none disabled:bg-[#f7f7f7]"
                          >
                            {booleanOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : inputMode === "account_type" ? (
                          <select
                            value={value || ""}
                            onChange={(event) =>
                              setPayoutProfile((current) => ({
                                ...current,
                                provider: payoutProvider,
                                wiseDetails: {
                                  ...current.wiseDetails,
                                  [key]: event.target.value,
                                },
                              }))
                            }
                            disabled={!canEditSettings}
                            className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none disabled:bg-[#f7f7f7]"
                          >
                            <option value="">Select account type</option>
                            {accountTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={inputMode === "email" ? "email" : inputMode === "date" ? "date" : "text"}
                            value={value}
                            onChange={(event) =>
                              setPayoutProfile((current) => ({
                                ...current,
                                provider: payoutProvider,
                                wiseDetails: {
                                  ...current.wiseDetails,
                                  [key]:
                                    inputMode === "iban"
                                      ? event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 34)
                                      : inputMode === "swift"
                                        ? event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11)
                                        : inputMode === "date"
                                          ? event.target.value
                                        : event.target.value.slice(0, 240),
                                },
                              }))
                            }
                            disabled={!canEditSettings}
                            className="w-full rounded-[8px] border border-black/10 bg-white h-12 px-3 text-[13px] outline-none disabled:bg-[#f7f7f7]"
                            placeholder={friendlyLabel}
                          />
                        )}
                        {helpText ? (
                          <p className="mt-1.5 text-[11px] leading-[1.5] text-[#57636c]">{helpText}</p>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {!payoutRecipientReady || hasUnsavedChanges ? (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => void createPayoutRecipient()}
                disabled={!canEditSettings || payoutConnectBusy}
                className="inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-[#202020] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {payoutConnectBusy
                  ? "Preparing..."
                  : payoutRecipientReady
                    ? "Save payout changes"
                    : recipientId
                      ? "Save and update payouts"
                      : "Save and connect payouts"}
              </button>
            </div>
          ) : null}
        </div>

        <div
          className={`mt-3 rounded-[8px] border px-4 py-3 text-[13px] leading-[1.7] ${
            payoutRecipientReady
              ? "border-[#cfe8d8] bg-[rgba(57,169,107,0.08)] text-[#166534]"
              : "border-[rgba(144,125,76,0.18)] bg-[rgba(144,125,76,0.08)] text-[#6f5d2d]"
          }`}
        >
          <p className={`font-semibold ${payoutRecipientReady ? "text-[#166534]" : "text-[#5f4f25]"}`}>
            {payoutRecipientReady ? "Payouts connected" : "Payout setup still needs attention"}
          </p>
          <p className="mt-1">
            {payoutRecipientReady
              ? `Your payout destination is connected and ready. ${payoutSummarySyncedAt ? `Last checked ${formatDateTime(payoutSummarySyncedAt)}.` : ""}`
              : payoutNoticeText || "Save your payout details and connect your payout destination to start receiving seller payouts."}
          </p>
          {payoutRecipientReady && payoutConnectedSummary ? (
            <p className="mt-2 text-[12px] font-medium text-[#166534]">Connected account: {payoutConnectedSummary}</p>
          ) : null}
        </div>

        <div className="mt-3 rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
          <p className="text-[13px] font-semibold text-[#202020]">Payout FAQ</p>
          <div className="mt-3 overflow-hidden rounded-[8px] border border-black/10 bg-white">
            {[
              {
                question: "When do payouts happen?",
                answer:
                  "Piessang releases seller payouts after the order is delivered, the hold window has passed, and payout checks are complete.",
              },
              {
                question: "What do I need to do now?",
                answer:
                  "Choose your payout country and currency, complete the payout fields Piessang shows you, then use Save and connect payouts. Piessang validates your payout recipient details automatically.",
              },
              {
                question: "Will I need to do this again?",
                answer:
                  "Usually no. You only need to update this section again if your bank details or payout destination changes later.",
              },
              {
                question: "How will I know it is ready?",
                answer:
                  "This section checks your payout setup automatically and will show a green notice when your payout destination is connected and ready.",
              },
            ].map((item) => (
              <details key={item.question} className="group border-b border-black/10 last:border-b-0">
                <summary className="cursor-pointer list-none px-4 py-3 text-[12px] font-semibold text-[#202020] marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    <span>{item.question}</span>
                    <span className="text-[#907d4c] transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <div className="px-4 pb-3">
                  <p className="text-[12px] leading-[1.7] text-[#57636c]">{item.answer}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </SettingsSection>
      ) : null}

      <GooglePlacePickerModal
        open={originPickerOpen}
        title="Choose your shipping origin"
        initialValue={{
          streetAddress: shippingSettings.shipsFrom.streetAddress,
          addressLine2: shippingSettings.shipsFrom.addressLine2,
          country: SHOPPER_COUNTRY_OPTIONS.find((option) => option.code === shippingSettings.shipsFrom.countryCode)?.label || shippingSettings.shipsFrom.countryCode,
          region: shippingSettings.shipsFrom.province,
          city: shippingSettings.shipsFrom.city,
          suburb: shippingSettings.shipsFrom.suburb,
          postalCode: shippingSettings.shipsFrom.postalCode,
          utcOffsetMinutes: Number.isFinite(Number(shippingSettings.shipsFrom.utcOffsetMinutes)) ? Number(shippingSettings.shipsFrom.utcOffsetMinutes) : null,
          latitude: Number.isFinite(Number(shippingSettings.shipsFrom.latitude)) ? Number(shippingSettings.shipsFrom.latitude) : null,
          longitude: Number.isFinite(Number(shippingSettings.shipsFrom.longitude)) ? Number(shippingSettings.shipsFrom.longitude) : null,
        }}
        onClose={() => setOriginPickerOpen(false)}
        onSelect={(value) => {
          setShippingSettings((current) => ({
            ...current,
            shipsFrom: {
              ...current.shipsFrom,
              countryCode: normalizeCountryCode(value.country) || current.shipsFrom.countryCode,
              streetAddress: toStr(value.streetAddress),
              addressLine2: toStr(value.addressLine2),
              province: toStr(value.region),
              city: toStr(value.city),
              suburb: toStr(value.suburb),
              postalCode: toStr(value.postalCode),
              utcOffsetMinutes: Number.isFinite(Number(value.utcOffsetMinutes)) ? Number(value.utcOffsetMinutes) : null,
              latitude: Number.isFinite(Number(value.latitude)) ? Number(value.latitude) : null,
              longitude: Number.isFinite(Number(value.longitude)) ? Number(value.longitude) : null,
            },
          }));
          setOriginPickerOpen(false);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        {standaloneSection !== "payouts" ? (
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={saving || !canEditSettings}
          className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
        ) : null}
        {showDangerZone ? (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            disabled={!canDeleteSeller}
            className="inline-flex h-10 items-center rounded-[8px] border border-[#f1c3c3] bg-[#fff7f7] px-4 text-[13px] font-semibold text-[#b91c1c] transition-colors hover:border-[#ef9f9f] hover:bg-[#fff0f0] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close seller account
          </button>
        ) : null}
      </div>

      {hasUnsavedChanges && !standaloneSection ? (
        <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.08)] px-4 py-3 text-[13px] text-[#166534]">
          {payoutSectionVisible && payoutRecipientReady
            ? "Your payouts are already connected. You still have other unsaved seller settings on this page, so save your updates when you're ready."
            : visibleSectionSet.has("shipping")
              ? "You have unsaved shipping changes. Save your updates so your shipping origin, local delivery rules, and shipping zones can take effect."
              : "You have unsaved changes in your seller settings. Save your updates so your changes can take effect."}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[13px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      <ConfirmModal
        open={deleteOpen}
        eyebrow="Close seller account"
        title="This will close the seller profile and hide its products from the marketplace."
        description={`Confirming this action will close the active seller account for ${vendorName || sellerSlug}. The seller page and product links will no longer be available publicly, but the data remains saved in Piessang.`}
        confirmLabel={deleting ? "Closing..." : "Close seller account"}
        busy={deleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void deleteSellerAccount()}
      />

      <AppSnackbar notice={snackbar ? { tone: snackbar.tone || "success", message: snackbar.message } : null} />
    </section>
  );
}

export default SellerSettingsWorkspace;
