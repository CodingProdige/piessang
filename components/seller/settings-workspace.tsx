"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { decode } from "blurhash";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { useAuth } from "@/components/auth/auth-provider";
import { BlurhashImage } from "@/components/shared/blurhash-image";
import { GooglePlacePickerModal } from "@/components/shared/google-place-picker-modal";
import { PhoneInput, combinePhoneNumber, sanitizePhoneLocalNumber, splitPhoneNumber } from "@/components/shared/phone-input";
import { AppSnackbar } from "@/components/ui/app-snackbar";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { SHOPPER_COUNTRY_OPTIONS } from "@/components/products/delivery-area-gate";
import { clientStorage } from "@/lib/firebase";
import { prepareImageAsset } from "@/lib/client/image-prep";
import { normalizeSellerDeliveryProfile } from "@/lib/seller/delivery-profile";
import { SUPPORTED_PAYOUT_COUNTRIES, SUPPORTED_PAYOUT_CURRENCIES } from "@/lib/seller/payout-config";

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
    radiusKm: string;
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
};

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
    radiusKm: "",
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

function guessWiseFieldInputMode(field: { key?: string; values?: Array<{ value: string; label: string }> }) {
  const key = normalizeWiseFieldKey(field?.key);
  if (Array.isArray(field?.values) && field.values.length) return "select";
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
  if (fallback.toLowerCase() === "accountnumber") return "Account number";
  if (fallback.toLowerCase() === "dateofbirth") return "Date of birth";

  return fallback
    .replace(/\//g, " ")
    .replace(/\./g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
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

function mapPricingRules(rules: any[] = []) {
  return Array.isArray(rules)
    ? rules.map((rule) => ({
        id: toStr(rule.id),
        label: toStr(rule.label),
        minDistanceKm: toStr(rule.minDistanceKm),
        maxDistanceKm: toStr(rule.maxDistanceKm),
        minOrderValue: toStr(rule.minOrderValue),
        maxOrderValue: toStr(rule.maxOrderValue),
        fee: toStr(rule.fee),
        freeAboveOrderValue: toStr(rule.freeAboveOrderValue),
        pricingBasis: toStr((rule as any).pricingBasis),
      }))
    : [];
}

function mapDeliveryProfile(profile: any): SellerDeliveryProfile {
  const normalized = normalizeSellerDeliveryProfile(profile && typeof profile === "object" ? profile : {});
  return {
    origin: {
      country: toStr(normalized?.origin?.country),
      region: toStr(normalized?.origin?.region),
      city: toStr(normalized?.origin?.city),
      suburb: toStr(normalized?.origin?.suburb),
      postalCode: toStr(normalized?.origin?.postalCode),
      utcOffsetMinutes: toStr(normalized?.origin?.utcOffsetMinutes),
      latitude: toStr(normalized?.origin?.latitude),
      longitude: toStr(normalized?.origin?.longitude),
    },
    directDelivery: {
      enabled: normalized?.directDelivery?.enabled === true,
      radiusKm: toStr(normalized?.directDelivery?.radiusKm),
      leadTimeDays: toStr(normalized?.directDelivery?.leadTimeDays),
      cutoffTime: toStr(normalized?.directDelivery?.cutoffTime),
      pricingRules: mapPricingRules(normalized?.directDelivery?.pricingRules || []).slice(0, 1),
    },
    shippingZones: Array.isArray(normalized?.shippingZones)
      ? normalized.shippingZones.map((zone) => ({
          id: toStr(zone.id),
          label: toStr(zone.label || zone.country),
          scopeType: "country",
          country: toStr(zone.country),
          region: "",
          city: "",
          postalCodes: "",
          leadTimeDays: toStr(zone.leadTimeDays),
          cutoffTime: toStr(zone.cutoffTime),
          rateMode: toStr((zone as any).rateMode || "flat"),
          pricingBasis: toStr((zone as any).pricingBasis || "per_order"),
          courierKey: toStr((zone as any).courierKey),
          courierServiceLabel: toStr((zone as any).courierServiceLabel),
          pricingRules: mapPricingRules(zone.pricingRules || []).slice(0, 1),
          isFallback: false,
        }))
      : [],
    pickup: {
      enabled: normalized?.pickup?.enabled === true,
      leadTimeDays: toStr(normalized?.pickup?.leadTimeDays),
    },
    notes: toStr(normalized?.notes).slice(0, 500),
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
  deliveryProfile: SellerDeliveryProfile;
  payoutProfile: SellerPayoutProfile;
  businessDetails: SellerBusinessDetails;
  vendorNameValue: string;
  vendorDescriptionValue: string;
}) {
  return JSON.stringify({
    branding: input.branding,
    deliveryProfile: input.deliveryProfile,
    payoutProfile: input.payoutProfile,
    businessDetails: input.businessDetails,
    vendorNameValue: sanitizeVendorName(input.vendorNameValue),
    vendorDescriptionValue: toStr(input.vendorDescriptionValue).slice(0, 500),
  });
}

function formatSellerOriginSummary(origin: SellerDeliveryProfile["origin"]) {
  return [origin.suburb, origin.city, origin.region, origin.country].filter(Boolean).join(", ");
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
}: SellerSettingsWorkspaceProps) {
  const { profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [branding, setBranding] = useState<SellerBranding>(EMPTY_BRANDING);
  const [deliveryProfile, setDeliveryProfile] = useState<SellerDeliveryProfile>(EMPTY_DELIVERY_PROFILE);
  const [payoutProfile, setPayoutProfile] = useState<SellerPayoutProfile>(EMPTY_PAYOUT_PROFILE);
  const [businessDetails, setBusinessDetails] = useState<SellerBusinessDetails>(EMPTY_BUSINESS_DETAILS);
  const [vendorNameValue, setVendorNameValue] = useState(vendorName);
  const [vendorDescriptionValue, setVendorDescriptionValue] = useState("");
  const [sellerCodeValue, setSellerCodeValue] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
    suggestions: string[];
  }>({
    checking: false,
    unique: null,
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
        deliveryProfile,
        payoutProfile,
        businessDetails,
        vendorNameValue,
        vendorDescriptionValue,
      }) !== savedSnapshot,
    [branding, businessDetails, deliveryProfile, payoutProfile, savedSnapshot, vendorDescriptionValue, vendorNameValue],
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
    if (!nextVendorName || nextVendorName.length < 3) {
      setSellerNameCheck({ checking: false, unique: null, suggestions: [] });
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSellerNameCheck((current) => ({ ...current, checking: true }));

      try {
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
          suggestions: Array.isArray(payload?.suggestions) ? payload.suggestions : [],
        });
      } catch {
        if (!controller.signal.aborted) {
          setSellerNameCheck({ checking: false, unique: null, suggestions: [] });
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
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
      if (!sellerSlug) return;

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
        const nextDeliveryProfile = normalizeSellerDeliveryProfile(
          payload?.deliveryProfile && typeof payload.deliveryProfile === "object" ? payload.deliveryProfile : {},
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
          setDeliveryProfile(mapDeliveryProfile(nextDeliveryProfile));
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
            recipientEmail: toStr(nextPayoutProfile?.recipientEmail || nextBusinessDetails?.email || profile?.email || ""),
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
              deliveryProfile: mapDeliveryProfile(nextDeliveryProfile),
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
  const selectedShippingZoneCountries = useMemo(
    () => deliveryProfile.shippingZones.map((zone) => normalizeCountryKey(zone.country)).filter(Boolean),
    [deliveryProfile.shippingZones],
  );
  const hasDuplicateShippingZoneCountries = selectedShippingZoneCountries.length !== new Set(selectedShippingZoneCountries).size;
  const recipientId = payoutProvider === "wise" ? payoutProfile.wiseRecipientId : payoutProfile.stripeRecipientAccountId;
  const payoutRecipientReady = Boolean(payoutStatus?.connected || recipientId);
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
    (payoutStatus?.connected === true && payoutStatus?.hasBankDestination === true);
  const payoutConnectedSummary =
    payoutSummaryBank && payoutSummaryBank !== "Save payout details to create a Wise recipient" ? payoutSummaryBank : "";
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
    if (!profile?.uid || !sellerSlug) return;
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
      setPayoutStatus(payload?.data || null);
    } catch (cause) {
      setPayoutStatus(null);
      showSnackbar(cause instanceof Error ? cause.message : "Unable to load payout status.", "error");
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
      if (!nextUrl) {
        void loadPayoutStatus();
        showSnackbar(payload?.data?.message || "Payout recipient saved successfully.", "success");
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
    setMessage(null);

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
    if (hasDuplicateShippingZoneCountries) {
      setError("Each shipping zone must use a unique country before saving.");
      return false;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/settings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile?.uid,
          sellerSlug,
          data: {
            branding,
            deliveryProfile,
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
      const nextDeliveryProfile = normalizeSellerDeliveryProfile(payload?.deliveryProfile || {});
      setDeliveryProfile(mapDeliveryProfile(nextDeliveryProfile));
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
        recipientEmail: toStr(nextPayoutProfile?.recipientEmail || nextBusinessDetails?.email || profile?.email || ""),
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
          deliveryProfile: mapDeliveryProfile(nextDeliveryProfile),
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
        setMessage(
          weightRequirementState?.hasWeightBasedShipping && weightRequirementState?.missingWeightCount > 0
            ? weightRequirementState?.deactivatedCount > 0
              ? `Seller settings saved. ${weightRequirementState.missingWeightCount} product${weightRequirementState.missingWeightCount === 1 ? "" : "s"} still need variant weights, and ${weightRequirementState.deactivatedCount} active listing${weightRequirementState.deactivatedCount === 1 ? "" : "s"} were moved out of active status because there is no local-delivery fallback.`
              : `Seller settings saved. ${weightRequirementState.missingWeightCount} product${weightRequirementState.missingWeightCount === 1 ? "" : "s"} still need variant weights before per-kg country shipping can apply.`
            : "Seller settings saved."
        );
      }
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
    setMessage(null);
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
      window.location.href = "/seller/dashboard";
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
      <div className="flex justify-end">
        <Link
          href={publicVendorHref}
          className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c] transition-colors hover:text-[#6f5d2d]"
        >
          View Public <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="rounded-[8px] border border-black/5 bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Vendor profile</p>
            <h4 className="mt-1 text-[18px] font-semibold text-[#202020]">Update your seller identity</h4>
            <p className="mt-1 text-[12px] text-[#57636c]">
              Keep your vendor name and description current. Your seller code stays fixed and is used across Piessang.
            </p>
          </div>
          <div className="rounded-[8px] border border-black/10 bg-[rgba(32,32,32,0.03)] px-3 py-2 text-[12px] text-[#57636c]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b94a3]">Seller code</p>
            <p className="mt-1 font-semibold text-[#202020]">{sellerCodeValue || "Will be generated"}</p>
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
              className={`w-full rounded-[8px] bg-white px-3 py-2.5 text-[13px] outline-none transition-colors disabled:bg-[#f7f7f7] ${
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
            <div className="flex items-center gap-2 rounded-[8px] border border-black/10 bg-[#fafafa] px-3 py-2.5 text-[13px] text-[#202020]">
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
            className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[#cbb26b] disabled:bg-[#f7f7f7]"
          />
          <p className="mt-1 text-[11px] text-[#8b94a3]">Optional. Keep it short and clear.</p>
        </label>
      </div>

      <SettingsSection
        eyebrow="Branding"
        title="Store visuals"
        description="Manage your banner and logo without keeping the whole branding workspace open all the time."
        expanded={sectionOpen.branding}
        onToggle={() => setSectionOpen((current) => ({ ...current, branding: !current.branding }))}
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
              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
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
              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
            />
          </label>
        </div>
      </div>
      </SettingsSection>

      <SettingsSection
        eyebrow="Shipping preferences"
        title="How you ship orders"
        description="Keep this simple: set one local delivery radius and fee, then add country shipping rates for everywhere else you ship."
        expanded={sectionOpen.shipping}
        onToggle={() => setSectionOpen((current) => ({ ...current, shipping: !current.shipping }))}
      >
        <div className="mt-4 space-y-4">
          <div className="rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[#202020]">Your shipping origin</p>
                <p className="mt-1 text-[12px] text-[#57636c]">This is the location your local delivery radius is measured from.</p>
              </div>
            </div>
            <div className="mt-4 rounded-[8px] border border-dashed border-black/10 bg-white px-4 py-4 text-[12px] text-[#57636c]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-[#202020]">Chosen origin</p>
                  <p className="mt-1 text-[13px] text-[#202020]">
                    {formatSellerOriginSummary(deliveryProfile.origin) || "No shipping origin selected yet."}
                  </p>
                  {deliveryProfile.origin.postalCode ? (
                    <p className="mt-1">Postal code: {deliveryProfile.origin.postalCode}</p>
                  ) : null}
                  {deliveryProfile.origin.utcOffsetMinutes ? (
                    <p className="mt-1">Location UTC offset: {deliveryProfile.origin.utcOffsetMinutes} minutes</p>
                  ) : null}
                  {deliveryProfile.origin.latitude && deliveryProfile.origin.longitude ? (
                    <p className="mt-1">
                      Pinned map location: {deliveryProfile.origin.latitude}, {deliveryProfile.origin.longitude}
                    </p>
                  ) : (
                    <p className="mt-1">Pick your business location once so your direct delivery and shipping rules can measure from it.</p>
                  )}
                </div>
                <button type="button" onClick={() => setOriginPickerOpen(true)} disabled={!canEditSettings} className="inline-flex h-9 shrink-0 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] disabled:opacity-60">
                  {formatSellerOriginSummary(deliveryProfile.origin) ? "Edit location" : "Choose location"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[#202020]">Local delivery</p>
                <p className="mt-1 text-[12px] text-[#57636c]">Use this when you deliver nearby orders yourself. Set one radius and one flat delivery fee.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <label className="inline-flex items-center gap-2 text-[12px] text-[#57636c]">
                <input type="checkbox" checked={deliveryProfile.directDelivery.enabled} onChange={(event) => setDeliveryProfile((current) => {
                  const next = event.target.checked ? ensureFlatDirectDeliveryRule(current) : current;
                  return {
                    ...next,
                    directDelivery: {
                      ...next.directDelivery,
                      enabled: event.target.checked,
                    },
                  };
                })} disabled={!canEditSettings} className="h-4 w-4 rounded border-black/20" />
                Enable local delivery from your business location
              </label>
              {(() => {
                const directRule = getDirectDeliveryRule(deliveryProfile);
                return (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Delivery radius (km)</span>
                        <input value={deliveryProfile.directDelivery.radiusKm} onChange={(event) => setDeliveryProfile((current) => ({ ...current, directDelivery: { ...current.directDelivery, radiusKm: event.target.value.replace(/[^\d]/g, "").slice(0, 4) } }))} disabled={!canEditSettings || !deliveryProfile.directDelivery.enabled} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]" placeholder="15" />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Expected delivery time (days)</span>
                        <input
                          value={deliveryProfile.directDelivery.leadTimeDays}
                          onChange={(event) => setDeliveryProfile((current) => ({
                            ...current,
                            directDelivery: {
                              ...current.directDelivery,
                              leadTimeDays: event.target.value.replace(/[^\d]/g, "").slice(0, 2),
                            },
                          }))}
                          disabled={!canEditSettings || !deliveryProfile.directDelivery.enabled}
                          className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]"
                          placeholder="1"
                        />
                      </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Delivery fee (R)</span>
                        <input
                          value={directRule.fee}
                          onChange={(event) => setDeliveryProfile((current) => ({
                            ...ensureFlatDirectDeliveryRule(current),
                            directDelivery: {
                              ...ensureFlatDirectDeliveryRule(current).directDelivery,
                              pricingRules: [
                                {
                                  ...getDirectDeliveryRule(current),
                                  fee: event.target.value.replace(/[^\d.]/g, "").slice(0, 8),
                                },
                              ],
                            },
                          }))}
                          disabled={!canEditSettings || !deliveryProfile.directDelivery.enabled}
                          className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]"
                          placeholder="60"
                        />
                      </label>
                    </div>
                    <p className="text-[12px] text-[#57636c]">
                      Shoppers outside this radius will not be able to place seller-delivered orders for your items.
                    </p>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[#202020]">Shipping zones</p>
                <p className="mt-1 text-[12px] text-[#57636c]">Add one row per country you ship to, just like a simple Shopify-style shipping zone list.</p>
              </div>
              <button
                type="button"
                disabled={!canEditSettings || deliveryProfile.shippingZones.length >= SHOPPER_COUNTRY_OPTIONS.length}
                onClick={() =>
                  setDeliveryProfile((current) => ({
                    ...current,
                    shippingZones: [
                      ...current.shippingZones,
                      {
                        ...makeShippingZone(Date.now()),
                        country: getUnusedShippingZoneCountry("", current.shippingZones),
                        label: getUnusedShippingZoneCountry("", current.shippingZones),
                      },
                    ],
                  }))
                }
                className="inline-flex h-9 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] disabled:opacity-60"
              >
                Add Zone
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {hasDuplicateShippingZoneCountries ? (
                <div className="rounded-[8px] border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-[12px] text-[#991b1b]">
                  Each shipping zone must use a unique country. Remove or change duplicate country rows before saving.
                </div>
              ) : null}
              {deliveryProfile.shippingZones.length ? deliveryProfile.shippingZones.map((zone, index) => (
                <div key={zone.id || index} className="rounded-[8px] border border-black/10 bg-white p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Country</span>
                      <div className="relative">
                        <select
                          value={zone.country}
                          onChange={(event) => setDeliveryProfile((current) => ({
                            ...current,
                            shippingZones: current.shippingZones.map((entry, entryIndex) => entryIndex === index ? {
                              ...entry,
                              country: event.target.value,
                              label: event.target.value,
                              scopeType: "country",
                              region: "",
                              city: "",
                              postalCodes: "",
                            } : entry),
                          }))}
                          disabled={!canEditSettings}
                          className="appearance-none w-full rounded-[8px] border border-black/10 bg-white py-2.5 pl-3 pr-8 text-[13px] font-semibold text-[#202020] outline-none disabled:bg-[#f7f7f7]"
                        >
                          <option value="">Select country</option>
                          {SHOPPER_COUNTRY_OPTIONS.filter((option) => {
                            const normalizedLabel = normalizeCountryKey(option.label);
                            return !deliveryProfile.shippingZones.some(
                              (entry, entryIndex) => entryIndex !== index && normalizeCountryKey(entry.country) === normalizedLabel,
                            );
                          }).map((option) => (
                            <option key={option.code} value={option.label}>
                              {option.displayLabel}
                            </option>
                          ))}
                        </select>
                        <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 fill-current text-[#6b7280]" aria-hidden="true">
                          <path d="M5.5 7.5 10 12l4.5-4.5" />
                        </svg>
                      </div>
                    </label>
                    <div className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Shipping type</span>
                      <div className="flex h-[42px] items-center rounded-[8px] border border-black/10 bg-[#f7f7f7] px-3 text-[13px] font-semibold text-[#202020]">
                        Seller-managed flat rate
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Rate calculation</span>
                      <select
                        value={zone.pricingBasis || "per_order"}
                        onChange={(event) => setDeliveryProfile((current) => ({
                          ...current,
                          shippingZones: current.shippingZones.map((entry, entryIndex) => entryIndex === index ? {
                            ...entry,
                            pricingBasis: event.target.value,
                            pricingRules: [
                              {
                                ...(entry.pricingRules[0] || makePricingRule(Date.now())),
                                pricingBasis: event.target.value,
                              },
                            ],
                          } : entry),
                        }))}
                        disabled={!canEditSettings}
                        className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]"
                      >
                        <option value="per_order">Flat per order</option>
                        <option value="per_item">Flat per item</option>
                        <option value="per_kg">Per kg</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Expected delivery time (days)</span>
                      <input
                          value={zone.leadTimeDays || ""}
                          onChange={(event) => setDeliveryProfile((current) => ({
                            ...current,
                            shippingZones: current.shippingZones.map((entry, entryIndex) => entryIndex === index ? {
                              ...entry,
                              leadTimeDays: event.target.value.replace(/[^\d]/g, "").slice(0, 2),
                            } : entry),
                          }))}
                          disabled={!canEditSettings}
                          className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]"
                          placeholder="2"
                        />
                      </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                        {zone.pricingBasis === "per_item" ? "Shipping cost per item (R)" : zone.pricingBasis === "per_kg" ? "Shipping cost per kg (R)" : "Shipping cost (R)"}
                      </span>
                      <input
                          value={zone.pricingRules[0]?.fee || ""}
                          onChange={(event) => setDeliveryProfile((current) => ({
                            ...current,
                            shippingZones: current.shippingZones.map((entry, entryIndex) => entryIndex === index ? {
                              ...entry,
                              pricingRules: [
                                {
                                  ...(entry.pricingRules[0] || makePricingRule(Date.now())),
                                  label: entry.country || entry.label || "Standard shipping",
                                  pricingBasis: entry.pricingBasis || "per_order",
                                  fee: event.target.value.replace(/[^\d.]/g, "").slice(0, 8),
                                  minOrderValue: "",
                                  maxOrderValue: "",
                                  minDistanceKm: "",
                                  maxDistanceKm: "",
                                },
                              ],
                            } : entry),
                          }))}
                          disabled={!canEditSettings}
                          className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]"
                          placeholder="120"
                        />
                      </label>
                    </div>
                  <p className="mt-3 text-[12px] text-[#57636c]">
                    If a shopper’s delivery country does not match one of your rows here, seller-managed shipping will not be offered.
                    {zone.pricingBasis === "per_kg" ? " Per-kg shipping requires every variant on the listing to have a weight." : ""}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <button type="button" disabled={!canEditSettings} onClick={() => setDeliveryProfile((current) => ({ ...current, shippingZones: current.shippingZones.filter((_, entryIndex) => entryIndex !== index) }))} className="text-[12px] font-semibold text-[#b91c1c] disabled:opacity-60">Remove zone</button>
                  </div>
                </div>
              )) : (
                <div className="rounded-[8px] border border-dashed border-black/10 bg-white px-4 py-5 text-[12px] text-[#57636c]">No shipping zones yet.</div>
              )}
            </div>
          </div>

          <div className="rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="inline-flex items-center gap-2 text-[12px] text-[#57636c]">
                <input type="checkbox" checked={deliveryProfile.pickup.enabled} onChange={(event) => setDeliveryProfile((current) => ({ ...current, pickup: { ...current.pickup, enabled: event.target.checked } }))} disabled={!canEditSettings} className="h-4 w-4 rounded border-black/20" />
                Allow customer collection
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Collection ready time (days)</span>
                <input value={deliveryProfile.pickup.leadTimeDays} onChange={(event) => setDeliveryProfile((current) => ({ ...current, pickup: { ...current.pickup, leadTimeDays: event.target.value.replace(/[^\d]/g, "").slice(0, 2) } }))} disabled={!canEditSettings || !deliveryProfile.pickup.enabled} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]" placeholder="0" />
              </label>
            </div>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Delivery notes</span>
          <textarea
            value={deliveryProfile.notes}
            onChange={(event) => setDeliveryProfile((current) => ({ ...current, notes: event.target.value.slice(0, 500) }))}
            placeholder="Anything Piessang should know about your delivery and shipping setup..."
            disabled={!canEditSettings}
            rows={3}
            className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[#cbb26b] disabled:bg-[#f7f7f7]"
          />
        </label>
      </SettingsSection>

      <SettingsSection
        eyebrow="Business details"
        title="Supplier details for invoices"
        description="Keep your legal business and VAT details current so customer invoices can show the right seller information."
        expanded={sectionOpen.business}
        onToggle={() => setSectionOpen((current) => ({ ...current, business: !current.business }))}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Registered business name</span>
            <input
              value={businessDetails.companyName}
              onChange={(event) => setBusinessDetails((current) => ({ ...current, companyName: event.target.value.slice(0, 120) }))}
              placeholder="Piessang Trading (Pty) Ltd"
              disabled={!canEditSettings}
              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">VAT number</span>
            <input
              value={businessDetails.vatNumber}
              onChange={(event) => setBusinessDetails((current) => ({ ...current, vatNumber: event.target.value.slice(0, 40) }))}
              placeholder="4760314296"
              disabled={!canEditSettings}
              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Registration number</span>
            <input
              value={businessDetails.registrationNumber}
              onChange={(event) => setBusinessDetails((current) => ({ ...current, registrationNumber: event.target.value.slice(0, 60) }))}
              placeholder="2026/123456/07"
              disabled={!canEditSettings}
              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Business email</span>
            <input
              value={businessDetails.email}
              onChange={(event) => setBusinessDetails((current) => ({ ...current, email: event.target.value.slice(0, 120) }))}
              placeholder="accounts@yourbusiness.com"
              disabled={!canEditSettings}
              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]"
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
              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]"
            />
          </label>
        </div>
      </SettingsSection>

      <SettingsSection
        eyebrow="Payout settings"
        title="Where Piessang should pay you"
        description="Add the bank details where Piessang should send your seller payouts."
        expanded={sectionOpen.payouts}
        onToggle={() => setSectionOpen((current) => ({ ...current, payouts: !current.payouts }))}
      >
        <div className="mt-4 rounded-[8px] border border-black/10 bg-[#fafafa] px-4 py-3 text-[12px] leading-[1.7] text-[#57636c]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-[#202020]">How this works</p>
              <p className="mt-1">Fill in your bank details, then click <span className="font-semibold text-[#202020]">Save and connect payouts</span>. Piessang will save your details and connect your payout destination automatically.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void createPayoutRecipient()}
                disabled={!canEditSettings || payoutConnectBusy}
                className="inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {payoutConnectBusy
                  ? "Preparing..."
                  : recipientId
                    ? "Save and update payouts"
                    : "Save and connect payouts"}
              </button>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-[#57636c]">
            {recipientId
              ? "If you change your bank details later, use the same button again and Piessang will refresh your payout destination."
              : "You only need to do this once unless your payout details change later."}
          </p>
        </div>

        <div className="mt-3 rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Account holder name</span>
              <input value={payoutProfile.accountHolderName} onChange={(event) => setPayoutProfile((current) => ({ ...current, provider: payoutProvider, accountHolderName: event.target.value.slice(0, 120) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]" placeholder="La Vie De Luc (Pty) Ltd" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Recipient email</span>
              <input value={payoutProfile.recipientEmail} onChange={(event) => setPayoutProfile((current) => ({ ...current, provider: payoutProvider, recipientEmail: event.target.value.slice(0, 120) }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]" placeholder="finance@yourbusiness.com" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Currency</span>
              <select value={payoutProfile.currency} onChange={(event) => setPayoutProfile((current) => ({ ...current, provider: payoutProvider, currency: event.target.value }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]">
                {SUPPORTED_PAYOUT_CURRENCIES.map((entry) => (
                  <option key={entry.code} value={entry.code}>{entry.code}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Bank country</span>
              <select value={payoutProfile.bankCountry} onChange={(event) => setPayoutProfile((current) => ({ ...current, provider: payoutProvider, bankCountry: event.target.value, country: event.target.value, beneficiaryCountry: current.beneficiaryCountry || event.target.value }))} disabled={!canEditSettings} className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]">
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
                    return (
                      <label key={key} className="block">
                        <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">
                          {getFriendlyWiseFieldLabel(field)}
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
                            className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]"
                          >
                            <option value="">Select</option>
                            {(field.values || []).map((option) => (
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
                            className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none disabled:bg-[#f7f7f7]"
                            placeholder={getFriendlyWiseFieldLabel(field)}
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
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

      <GooglePlacePickerModal
        open={originPickerOpen}
        title="Choose your shipping origin"
        initialValue={{
          country: deliveryProfile.origin.country,
          region: deliveryProfile.origin.region,
          city: deliveryProfile.origin.city,
          suburb: deliveryProfile.origin.suburb,
          postalCode: deliveryProfile.origin.postalCode,
          utcOffsetMinutes: Number.isFinite(Number(deliveryProfile.origin.utcOffsetMinutes)) ? Number(deliveryProfile.origin.utcOffsetMinutes) : null,
          latitude: Number.isFinite(Number(deliveryProfile.origin.latitude)) ? Number(deliveryProfile.origin.latitude) : null,
          longitude: Number.isFinite(Number(deliveryProfile.origin.longitude)) ? Number(deliveryProfile.origin.longitude) : null,
        }}
        onClose={() => setOriginPickerOpen(false)}
        onSelect={(value) => {
          setDeliveryProfile((current) => ({
            ...current,
            origin: {
              ...current.origin,
              country: toStr(value.country),
              region: toStr(value.region),
              city: toStr(value.city),
              suburb: toStr(value.suburb),
              postalCode: toStr(value.postalCode),
              utcOffsetMinutes: toStr(value.utcOffsetMinutes),
              latitude: toStr(value.latitude),
              longitude: toStr(value.longitude),
            },
          }));
          setOriginPickerOpen(false);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={saving || !canEditSettings}
          className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          disabled={!canDeleteSeller}
          className="inline-flex h-10 items-center rounded-[8px] border border-[#f1c3c3] bg-[#fff7f7] px-4 text-[13px] font-semibold text-[#b91c1c] transition-colors hover:border-[#ef9f9f] hover:bg-[#fff0f0] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Close seller account
        </button>
      </div>

      {hasUnsavedChanges ? (
        <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.08)] px-4 py-3 text-[13px] text-[#166534]">
          You have unsaved changes in your seller settings. Save your updates so your new delivery rules, payout details, and shipping setup can take effect.
        </div>
      ) : null}

      {message ? (
        <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[13px] text-[#166534]">
          {message}
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
