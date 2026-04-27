"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useEmblaCarousel from "embla-carousel-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useDisplayCurrency } from "@/components/currency/display-currency-provider";
import { readShopperDeliveryArea } from "@/components/products/delivery-area-gate";
import { BlurhashImage } from "@/components/shared/blurhash-image";
import { GooglePlacePickerModal } from "@/components/shared/google-place-picker-modal";
import { PHONE_REGION_OPTIONS, PhoneInput, combinePhoneNumber, splitPhoneNumber } from "@/components/shared/phone-input";
import { AppSnackbar } from "@/components/ui/app-snackbar";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { fetchCheckoutShippingPreview, type CheckoutShippingError, type CheckoutShippingOption, type CheckoutShippingPreview } from "@/lib/shipping/client-preview";
import { normalizeMoneyAmount } from "@/lib/money";
import { getCardBrandFamily, resolveCardTheme } from "@/lib/payments/card-presentation";
import { normalizeShopperLocation } from "@/lib/shopper/location";

type CartItem = {
  product_unique_id?: string | null;
  variant_id?: string | null;
  qty?: number;
  quantity?: number;
  product_snapshot?: {
    product?: {
      title?: string | null;
      sellerCode?: string | null;
      unique_id?: string | null;
      docId?: string | null;
    };
    seller?: {
      vendorName?: string | null;
      baseLocation?: string | null;
      sellerCode?: string | null;
      sellerSlug?: string | null;
      deliveryProfile?: {
        origin?: { city?: string | null; region?: string | null; country?: string | null; latitude?: number | null; longitude?: number | null };
        directDelivery?: { enabled?: boolean; radiusKm?: number; leadTimeDays?: number; pricingRules?: Array<unknown> };
        shippingZones?: Array<unknown>;
        pickup?: { enabled?: boolean; leadTimeDays?: number };
      };
    };
    fulfillment?: {
      mode?: string | null;
    };
    media?: {
      images?: Array<{ imageUrl?: string | null; blurHashUrl?: string | null }>;
    };
  };
  selected_variant_snapshot?: {
    label?: string | null;
    variant_id?: string | null;
    id?: string | null;
    media?: {
      images?: Array<{ imageUrl?: string | null; blurHashUrl?: string | null }>;
    };
    logistics?: {
      parcel_preset?: string | null;
      shipping_class?: string | null;
      weight_kg?: number | null;
      length_cm?: number | null;
      width_cm?: number | null;
      height_cm?: number | null;
      volumetric_weight_kg?: number | null;
      billable_weight_kg?: number | null;
    };
  };
  line_totals?: {
    final_incl?: number;
  };
  availability?: {
    status?: string;
    message?: string;
  };
};

type CartPayload = {
  items?: CartItem[];
  totals?: {
    subtotal_excl?: number;
    vat_total?: number;
    final_excl?: number;
    final_payable_incl?: number;
    final_incl?: number;
    seller_delivery_fee_incl?: number;
    seller_delivery_fee_excl?: number;
    seller_delivery_breakdown?: Array<{
      seller_key?: string;
      seller_name?: string;
      label?: string;
      applicable?: boolean;
      delivery_type?: string;
      lead_time_days?: number | null;
      matched_rule_id?: string | null;
      matched_rule_label?: string | null;
      amount_incl?: number;
      amount_excl?: number;
      currency?: string;
      reason?: string[];
      shipment_summary?: {
        parcelCount?: number;
        actualWeightKg?: number;
        billableWeightKg?: number;
      } | null;
      available_courier_quotes?: Array<{
        id?: string;
        carrier?: string;
        service?: string;
        amountIncl?: number;
        currency?: string;
        leadTimeDays?: number | null;
        handoverOptions?: string[];
        markupAmount?: number;
        baseAmount?: number;
      }>;
      selected_courier_quote_id?: string | null;
    }>;
    delivery_fee_incl?: number;
    delivery_fee_excl?: number;
  };
  cart?: {
    cart_id?: string;
    item_count?: number;
  };
};

type DeliveryLocation = {
  label?: string;
  recipientName?: string;
  streetAddress?: string;
  addressLine2?: string;
  suburb?: string;
  city?: string;
  stateProvinceRegion?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  instructions?: string;
  is_default?: boolean;
  latitude?: number | null;
  longitude?: number | null;
};

type SavedCard = {
  id?: string;
  brand?: string;
  last4?: string;
  expiryMonth?: string;
  expiryYear?: string;
  status?: string;
  themeKey?: string;
};

type NewCardState = {
  holder: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  saveCard: boolean;
};

type AddressDraft = {
  locationName: string;
  recipientName: string;
  streetAddress: string;
  addressLine2: string;
  suburb: string;
  city: string;
  stateProvinceRegion: string;
  postalCode: string;
  country: string;
  phoneCountryCode: string;
  phoneNumber: string;
  instructions: string;
  is_default: boolean;
  latitude: string;
  longitude: string;
};

type CheckoutContactDraft = {
  recipientName: string;
  email: string;
  phoneCountryCode: string;
  phoneNumber: string;
};

type StripeCheckoutState = {
  clientSecret: string;
  publishableKey: string;
  paymentIntentId: string;
  orderId: string;
  orderNumber: string;
  merchantTransactionId: string;
  guestOrderAccessToken?: string;
};

type PaymentOverlayState = {
  open: boolean;
  tone: "processing" | "auth" | "success";
  title: string;
  message: string;
  detail?: string;
};

type CheckoutDeliveryBlockState = {
  title: string;
  message: string;
  sellers: string[];
  reasons: string[];
};

function RequiredMark() {
  return <span className="ml-1 text-[#b91c1c]">*</span>;
}

let stripeJsPromise: Promise<any> | null = null;
const STRIPE_CHECKOUT_STORAGE_KEY = "piessang-stripe-checkout-state";
const ORDER_FINALIZATION_POLL_MS = 1500;
const ORDER_FINALIZATION_MAX_ATTEMPTS = 20;
const PAYMENT_SUCCESS_REDIRECT_MS = 5000;

function loadStripeJs() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if ((window as any).Stripe) return Promise.resolve((window as any).Stripe);
  if (!stripeJsPromise) {
    stripeJsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="https://js.stripe.com/v3/"]');
      if (existing) {
        existing.addEventListener("load", () => resolve((window as any).Stripe), { once: true });
        existing.addEventListener("error", () => reject(new Error("Stripe.js failed to load.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.async = true;
      script.onload = () => resolve((window as any).Stripe);
      script.onerror = () => reject(new Error("Stripe.js failed to load."));
      document.head.appendChild(script);
    });
  }
  return stripeJsPromise;
}

function persistStripeCheckoutState(checkout: StripeCheckoutState | null) {
  if (typeof window === "undefined") return;
  if (!checkout) {
    window.sessionStorage.removeItem(STRIPE_CHECKOUT_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(STRIPE_CHECKOUT_STORAGE_KEY, JSON.stringify(checkout));
}

function readPersistedStripeCheckoutState(): StripeCheckoutState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STRIPE_CHECKOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const paymentIntentId = String(parsed?.paymentIntentId || "").trim();
    const clientSecret = String(parsed?.clientSecret || "").trim();
    const publishableKey = String(parsed?.publishableKey || "").trim();
    const orderId = String(parsed?.orderId || "").trim();
    const orderNumber = String(parsed?.orderNumber || "").trim();
    const merchantTransactionId = String(parsed?.merchantTransactionId || "").trim();
    const guestOrderAccessToken = String(parsed?.guestOrderAccessToken || "").trim();
    if (!paymentIntentId || !clientSecret || !publishableKey || !orderId) return null;
    return { paymentIntentId, clientSecret, publishableKey, orderId, orderNumber, merchantTransactionId, guestOrderAccessToken };
  } catch {
    return null;
  }
}

function readOrderPaymentStatus(order: any): string {
  return String(
    order?.lifecycle?.paymentStatus ||
      order?.payment?.status ||
      order?.order?.status?.payment ||
      "",
  )
    .trim()
    .toLowerCase();
}

function readOrderFinalizationState(order: any): string {
  return String(order?.meta?.paymentFinalization?.state || "")
    .trim()
    .toLowerCase();
}

function getItemCount(cart: CartPayload | null) {
  const items = Array.isArray(cart?.items) ? cart.items : [];
  return items.reduce((sum, item) => sum + Math.max(0, Number(item?.qty ?? item?.quantity ?? 0)), 0);
}

function getSellerGroupLabel(item: CartItem) {
  return item?.product_snapshot?.seller?.vendorName?.trim() || "Piessang seller";
}

function getSellerGroupKey(item: CartItem) {
  return String(
    item?.product_snapshot?.product?.sellerCode ||
      item?.product_snapshot?.seller?.sellerCode ||
      item?.product_snapshot?.seller?.sellerSlug ||
      "",
  ).trim();
}

function getSellerFulfillmentSummary(items: CartItem[]) {
  const modes = new Set(
    items
      .map((item) => String(item?.product_snapshot?.fulfillment?.mode || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (modes.has("bevgo") && modes.has("seller")) return "Some items ship from Piessang and some ship from the seller.";
  if (modes.has("bevgo")) return "Piessang handles shipping for these items.";
  return "The seller handles shipping for these items.";
}

function formatFulfillmentDate(date: Date | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function sanitizeEmailInput(value: string) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function isBasicEmailAddress(value: string) {
  const sanitized = sanitizeEmailInput(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized);
}

function getAddressFieldCopy(countryValue?: string | null) {
  const normalizedCountry = String(countryValue || "").trim().toLowerCase();
  const isSouthAfrica = normalizedCountry === "south africa";
  const isUnitedStates =
    normalizedCountry === "united states" ||
    normalizedCountry === "united states of america" ||
    normalizedCountry === "usa" ||
    normalizedCountry === "us";
  const isUnitedKingdom =
    normalizedCountry === "united kingdom" ||
    normalizedCountry === "uk" ||
    normalizedCountry === "great britain";

  const regionLabel = isSouthAfrica
    ? "Province"
    : isUnitedStates
      ? "State"
      : isUnitedKingdom
        ? "County / Region"
        : "State / Province / Region";

  const postalLabel = isUnitedStates ? "ZIP code" : isUnitedKingdom ? "Postcode" : "Postal code";

  return {
    addressLine1Label: "Address line 1",
    addressLine1Placeholder: "Street number and street name",
    addressLine2Label: "Address line 2",
    addressLine2Placeholder: "Apartment, suite, unit, building, floor",
    suburbLabel: isSouthAfrica ? "Suburb" : "Suburb / District",
    suburbPlaceholder: isSouthAfrica ? "Suburb" : "Suburb, district, or neighborhood",
    cityLabel: "City",
    cityPlaceholder: "City",
    regionLabel,
    regionPlaceholder: regionLabel,
    postalLabel,
    postalPlaceholder: postalLabel,
    countryLabel: "Country",
    countryPlaceholder: "Country",
  };
}

function countryIsoToFlagEmoji(iso: string) {
  if (!/^[A-Z]{2}$/.test(iso)) return "";
  return String.fromCodePoint(...iso.split("").map((char) => 127397 + char.charCodeAt(0)));
}

function getLineIds(item: CartItem) {
  const productId = String(
    item?.product_snapshot?.product?.unique_id ||
      item?.product_snapshot?.product?.docId ||
      item?.product_unique_id ||
      "",
  ).trim();
  const variantId = String(
    item?.selected_variant_snapshot?.variant_id ||
      item?.selected_variant_snapshot?.id ||
      item?.variant_id ||
      "",
  ).trim();
  return { productId, variantId };
}

function formatAddress(location: DeliveryLocation) {
  const lines = [
    location?.label,
    (location as DeliveryLocation & { locationName?: string }).locationName,
    location?.streetAddress,
    location?.addressLine2,
    location?.suburb,
    location?.city,
    location?.stateProvinceRegion || location?.province,
    location?.postalCode,
    location?.country,
  ].filter(Boolean);
  return lines.join(", ");
}

function toCountryCode(countryValue?: string | null) {
  const normalized = String(countryValue || "").trim().toLowerCase();
  if (!normalized) return "";
  const match = PHONE_REGION_OPTIONS.find((option) => option.label.replace(/\s*\(\+\d+\)$/, "").trim().toLowerCase() === normalized);
  return match?.iso || String(countryValue || "").trim().toUpperCase();
}

function buildBuyerDestinationFromLocation(location?: DeliveryLocation | null) {
  if (!location) return null;
  const country = String(location.country || "").trim();
  const province = String(location.province || location.stateProvinceRegion || "").trim();
  const postalCode = String(location.postalCode || "").trim();
  const city = String(location.city || location.suburb || "").trim();
  const countryCode = toCountryCode(country);
  if (!countryCode && !province && !postalCode && !city) return null;
  return {
    countryCode,
    province,
    city,
    postalCode,
  };
}

function formatShippingEta(estimatedDeliveryDays?: { min?: number | null; max?: number | null } | null) {
  const min = Number(estimatedDeliveryDays?.min);
  const max = Number(estimatedDeliveryDays?.max);
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return min === max ? `${min} day${min === 1 ? "" : "s"}` : `${min}-${max} days`;
  }
  if (Number.isFinite(min)) return `${min}+ days`;
  if (Number.isFinite(max)) return `Up to ${max} days`;
  return "";
}

function formatCard(card: SavedCard) {
  const brand = String(card?.brand || "Card").toUpperCase();
  const last4 = String(card?.last4 || "0000");
  const expiryMonth = String(card?.expiryMonth || "").padStart(2, "0");
  const expiryYear = String(card?.expiryYear || "");
  return `${brand} ending ${last4}${expiryMonth && expiryYear ? ` · ${expiryMonth}/${expiryYear}` : ""}`;
}

function formatPreviewExpiry(month?: string, year?: string) {
  const safeMonth = String(month || "").replace(/\D+/g, "").slice(0, 2);
  const safeYear = String(year || "").replace(/\D+/g, "");
  if (!safeMonth && !safeYear) return "MM/YY";
  const displayMonth = safeMonth ? safeMonth.padStart(2, "0") : "MM";
  const displayYear = safeYear ? safeYear.slice(-2) : "YY";
  return `${displayMonth}/${displayYear}`;
}

function maskPreviewNumber(last4?: string) {
  const safeLast4 = String(last4 || "").replace(/\D+/g, "").slice(-4);
  return `••••  ••••  ••••  ${safeLast4 || "••••"}`;
}

function getOrderedCards(cards: SavedCard[], selectedCardId: string) {
  if (!cards.length) return [];
  const selectedIndex = cards.findIndex((card) => String(card?.id || "") === selectedCardId);
  if (selectedIndex <= 0) return cards;
  return [...cards.slice(selectedIndex), ...cards.slice(0, selectedIndex)];
}

function rotateCardId(cards: SavedCard[], selectedCardId: string, direction: 1 | -1) {
  if (!cards.length) return "";
  const selectedIndex = Math.max(0, cards.findIndex((card) => String(card?.id || "") === selectedCardId));
  const nextIndex = (selectedIndex + direction + cards.length) % cards.length;
  return String(cards[nextIndex]?.id || "");
}

function PremiumCardFace({
  brand,
  cardholder,
  number,
  expiry,
  themeKey,
  compact = false,
  selected = false,
}: {
  brand: string;
  cardholder: string;
  number: string;
  expiry: string;
  themeKey?: string;
  compact?: boolean;
  selected?: boolean;
}) {
  const theme = resolveCardTheme(themeKey);
  const brandFamily = getCardBrandFamily(brand);
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[18px] text-white shadow-[0_22px_50px_rgba(20,24,27,0.18)]">
      <div
        className="absolute inset-0"
        style={{ background: theme.cardBackground }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage: `repeating-linear-gradient(135deg, ${theme.stripeColor} 0px, ${theme.stripeColor} 2px, transparent 2px, transparent 20px)`,
        }}
      />
      <div className="relative flex h-full flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-white/65 sm:text-[11px]">Piessang pay</p>
          <div className="flex shrink-0 items-start gap-2">
            {selected ? (
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/90">
                Selected
              </span>
            ) : null}
            <CardBrandMark brandFamily={brandFamily} brandLabel={brand} compact={compact} />
          </div>
        </div>
        <p
          className={[
            compact ? "text-[13px] sm:text-[15px]" : "text-[15px] sm:text-[18px]",
            "mt-5 pr-2 font-semibold tracking-[0.03em] text-white",
          ].join(" ")}
        >
          {number}
        </p>
        <div className="mt-auto flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/55 sm:text-[10px]">Cardholder</p>
            <p className={`${compact ? "text-[11px] sm:text-[12px]" : "text-[12px] sm:text-[14px]"} mt-1 truncate font-semibold uppercase tracking-[0.12em] text-white/95`}>
              {cardholder}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/55 sm:text-[10px]">Expires</p>
            <p className={`${compact ? "text-[11px] sm:text-[12px]" : "text-[12px] sm:text-[14px]"} mt-1 font-semibold tracking-[0.12em] text-white/95`}>
              {expiry}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardBrandMark({
  brandFamily,
  brandLabel,
  compact = false,
}: {
  brandFamily: string;
  brandLabel: string;
  compact?: boolean;
}) {
  const sizeClass = compact ? "scale-[0.88]" : "";
  if (brandFamily === "visa") {
    return (
      <div className={`inline-flex items-center rounded-[10px] bg-white px-3 py-1.5 text-[#1a1f71] shadow-[0_4px_14px_rgba(0,0,0,0.18)] ${sizeClass}`}>
        <span className="text-[12px] font-black italic tracking-[0.12em]">VISA</span>
      </div>
    );
  }
  if (brandFamily === "mastercard") {
    return (
      <div className={`inline-flex items-center rounded-[10px] bg-white px-2.5 py-1.5 shadow-[0_4px_14px_rgba(0,0,0,0.18)] ${sizeClass}`}>
        <div className="relative h-5 w-9">
          <span className="absolute left-0 top-0 h-5 w-5 rounded-full bg-[#eb001b]" />
          <span className="absolute right-0 top-0 h-5 w-5 rounded-full bg-[#f79e1b]" />
          <span className="absolute left-[7px] top-0 h-5 w-5 rounded-full bg-[rgba(255,95,0,0.86)]" />
        </div>
      </div>
    );
  }
  if (brandFamily === "amex") {
    return (
      <div className={`inline-flex items-center rounded-[10px] bg-[#2e77bb] px-3 py-1.5 text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] ${sizeClass}`}>
        <span className="text-[11px] font-black tracking-[0.08em]">AMEX</span>
      </div>
    );
  }
  if (brandFamily === "discover") {
    return (
      <div className={`inline-flex items-center rounded-[10px] bg-white px-3 py-1.5 text-[#202020] shadow-[0_4px_14px_rgba(0,0,0,0.18)] ${sizeClass}`}>
        <span className="text-[11px] font-black tracking-[0.06em]">DISCOVER</span>
      </div>
    );
  }
  if (brandFamily === "maestro") {
    return (
      <div className={`inline-flex items-center rounded-[10px] bg-white px-2.5 py-1.5 shadow-[0_4px_14px_rgba(0,0,0,0.18)] ${sizeClass}`}>
        <div className="relative h-5 w-9">
          <span className="absolute left-0 top-0 h-5 w-5 rounded-full bg-[#0099df]" />
          <span className="absolute right-0 top-0 h-5 w-5 rounded-full bg-[#ed1c2e]" />
          <span className="absolute left-[7px] top-0 h-5 w-5 rounded-full bg-[rgba(103,42,145,0.86)]" />
        </div>
      </div>
    );
  }
  return (
    <div className={`inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85 sm:text-[11px] ${sizeClass}`}>
      {brandLabel}
    </div>
  );
}

function detectCardBrand(number: string) {
  const clean = String(number || "").replace(/\D+/g, "");
  if (/^4/.test(clean)) return "VISA";
  if (/^5[1-5]/.test(clean) || /^2(2[2-9]|[3-6]|7[01])/.test(clean)) return "MASTER";
  return "VISA";
}

function sanitizeCardNumber(value: string) {
  return String(value || "").replace(/\D+/g, "").slice(0, 19);
}

function sanitizeMonth(value: string) {
  return String(value || "").replace(/\D+/g, "").slice(0, 2);
}

function sanitizeYear(value: string) {
  return String(value || "").replace(/\D+/g, "").slice(0, 4);
}

function sanitizeCvv(value: string) {
  return String(value || "").replace(/\D+/g, "").slice(0, 4);
}

function formatCardNumberInput(value: string) {
  const clean = sanitizeCardNumber(value);
  return clean.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function formatMonthInput(value: string) {
  const clean = sanitizeMonth(value);
  if (clean.length === 1 && Number(clean) > 1) return `0${clean}`;
  return clean;
}

function validateExpiryMonth(value: string) {
  const month = Number(sanitizeMonth(value));
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

function validateExpiryYear(value: string) {
  const raw = sanitizeYear(value);
  if (raw.length < 2) return false;
  const fullYear = raw.length === 2 ? Number(`20${raw}`) : Number(raw);
  const currentYear = new Date().getFullYear();
  return Number.isInteger(fullYear) && fullYear >= currentYear && fullYear <= currentYear + 20;
}

function defaultAddressDraft(profile?: { accountName?: string | null; displayName?: string | null }) {
  return {
    locationName: "",
    recipientName: profile?.accountName || profile?.displayName || "",
    streetAddress: "",
    addressLine2: "",
    suburb: "",
    city: "",
    stateProvinceRegion: "",
    postalCode: "",
    country: "South Africa",
    phoneCountryCode: "27",
    phoneNumber: "",
    instructions: "",
    is_default: true,
    latitude: "",
    longitude: "",
  };
}

function resolveLocationTitle(location: DeliveryLocation, index: number) {
  return location.label || (location as DeliveryLocation & { locationName?: string }).locationName || location.recipientName || `Address ${index + 1}`;
}

function deriveAddressNameFromPlace(value: {
  suburb?: string;
  city?: string;
  region?: string;
  country?: string;
}) {
  return [value.suburb, value.city, value.region, value.country]
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)[0] || "";
}

function togglePickupSelection(current: string[], sellerKey: string, enabled: boolean) {
  const normalized = String(sellerKey || "").trim();
  if (!normalized) return current;
  if (enabled) {
    return current.includes(normalized) ? current : [...current, normalized];
  }
  return current.filter((entry) => entry !== normalized);
}

function normalizeCourierSelections(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [String(key || "").trim(), String(entry || "").trim()])
      .filter(([key, entry]) => key && entry),
  );
}

export function CartCheckout() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, uid, cartOwnerId, profile, openAuthModal, refreshCart, syncCartState } = useAuth();
  const { formatMoney } = useDisplayCurrency();
  const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);
  const cardNumberRef = useRef<any>(null);
  const cardExpiryRef = useRef<any>(null);
  const cardCvcRef = useRef<any>(null);
  const contactSectionRef = useRef<HTMLElement | null>(null);
  const addressSectionRef = useRef<HTMLElement | null>(null);
  const paymentSectionRef = useRef<HTMLElement | null>(null);
  const recipientNameInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const phoneFieldRef = useRef<HTMLDivElement | null>(null);
  const addressNameInputRef = useRef<HTMLInputElement | null>(null);
  const streetAddressInputRef = useRef<HTMLInputElement | null>(null);
  const cardHolderInputRef = useRef<HTMLInputElement | null>(null);
  const [cart, setCart] = useState<CartPayload | null>(null);
  const [locations, setLocations] = useState<DeliveryLocation[]>([]);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [cardsModalOpen, setCardsModalOpen] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState("");
  const [pendingDeleteCardId, setPendingDeleteCardId] = useState("");
  const [addressesModalOpen, setAddressesModalOpen] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState("");
  const [addressEditing, setAddressEditing] = useState(false);
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(0);
  const [shippingPreview, setShippingPreview] = useState<CheckoutShippingPreview | null>(null);
  const [shippingPreviewLoading, setShippingPreviewLoading] = useState(false);
  const [contactDraft, setContactDraft] = useState<CheckoutContactDraft>({
    recipientName: "",
    email: String(profile?.email || "").trim(),
    phoneCountryCode: "27",
    phoneNumber: "",
  });
  const [paymentMode, setPaymentMode] = useState<"saved" | "new">("saved");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [newCard, setNewCard] = useState<NewCardState>({
    holder: profile?.accountName || profile?.displayName || "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: "",
    saveCard: true,
  });
  const [cardTouched, setCardTouched] = useState<Record<string, boolean>>({});
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(() => defaultAddressDraft());
  const [addressSaving, setAddressSaving] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [stripeCheckout, setStripeCheckout] = useState<StripeCheckoutState | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [paymentOverlay, setPaymentOverlay] = useState<PaymentOverlayState>({
    open: false,
    tone: "processing",
    title: "Processing payment",
    message: "Please wait while we confirm your order.",
  });
  useEffect(() => {
    const persisted = readPersistedStripeCheckoutState();
    if (!persisted) return;
    setStripeCheckout((current) => current || persisted);
    setSubmitting(true);
    setPaymentOverlay({
      open: true,
      tone: "auth",
      title: "Resuming payment",
      message: "We’re restoring your payment and checking the latest Stripe confirmation status.",
    });
  }, []);

  useEffect(() => {
    persistStripeCheckoutState(stripeCheckout);
  }, [stripeCheckout]);
  const [loading, setLoading] = useState(true);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);
  const [checkoutReserveLoading, setCheckoutReserveLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deliveryBlockError, setDeliveryBlockError] = useState<CheckoutDeliveryBlockState | null>(null);
  const [checkoutSessionLoading, setCheckoutSessionLoading] = useState(false);
  const [successState, setSuccessState] = useState<{ orderNumber: string; orderId: string; guestOrderAccessToken?: string } | null>(null);

  useEffect(() => {
    return () => {
      cardNumberRef.current?.unmount?.();
      cardExpiryRef.current?.unmount?.();
      cardCvcRef.current?.unmount?.();
      cardNumberRef.current = null;
      cardExpiryRef.current = null;
      cardCvcRef.current = null;
      elementsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !uid) {
      setCards([]);
      setPaymentMode("new");
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/client/v1/accounts/locations/get?userId=${encodeURIComponent(uid)}`, {
        cache: "no-store",
      }).then((response) => response.json().catch(() => ({}))),
      fetch("/api/client/v1/accounts/paymentMethods/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      }).then((response) => response.json().catch(() => ({}))),
    ])
      .then(([locationsPayload, cardsPayload]) => {
        if (!mounted) return;
        const nextLocations = Array.isArray(locationsPayload?.data?.deliveryLocations)
          ? locationsPayload.data.deliveryLocations
          : [];
        const nextCards = Array.isArray(cardsPayload?.data?.paymentMethods?.cards)
          ? cardsPayload.data.paymentMethods.cards
          : [];
        setLocations(nextLocations);
        setCards(nextCards);
        const defaultLocationIndex = nextLocations.findIndex((location: DeliveryLocation) => location?.is_default === true);
        setSelectedLocationIndex(defaultLocationIndex >= 0 ? defaultLocationIndex : 0);
        setSelectedCardId((current) => {
          if (nextCards.some((card: SavedCard) => String(card?.id || "") === current)) return current;
          return String(nextCards[0]?.id || "");
        });
        setPaymentMode(nextCards.length ? "saved" : "new");
      })
      .catch(() => {
        if (!mounted) return;
        setErrorMessage("We could not load your checkout details right now.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, profile?.accountName, profile?.displayName, uid]);

  const selectedLocation = locations[selectedLocationIndex] || null;
  const requestedCheckoutSessionId = String(searchParams?.get("session") || "").trim();

  useEffect(() => {
    const nextPhone = splitPhoneNumber(
      String(selectedLocation?.phoneNumber || "").trim(),
      String(selectedLocation?.phoneCountryCode || "27"),
    );
    setContactDraft((current) => ({
      recipientName: String(selectedLocation?.recipientName || profile?.accountName || profile?.displayName || "").trim(),
      email: current.email || String(profile?.email || "").trim(),
      phoneCountryCode: nextPhone.countryCode,
      phoneNumber: nextPhone.localNumber,
    }));
  }, [selectedLocation?.phoneCountryCode, selectedLocation?.phoneNumber, selectedLocation?.recipientName, profile?.accountName, profile?.displayName, profile?.email]);

  useEffect(() => {
    const activeCartOwnerId = cartOwnerId || uid || null;
    if (!activeCartOwnerId) return;
    let mounted = true;
    setDeliveryFeeLoading(true);
    setCheckoutReserveLoading(true);
    fetch("/api/client/v1/carts/checkout-reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartOwnerId: activeCartOwnerId }),
    })
      .then((response) => response.json().catch(() => ({})))
      .then(async (reservePayload) => {
        if (!mounted) return;
        if (reservePayload?.message) {
          setErrorMessage(reservePayload.message);
          setSnackbarMessage(reservePayload.message);
        }
        const refreshedCartResponse = await fetch("/api/client/v1/carts/get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cartOwnerId: activeCartOwnerId,
            lightweight: true,
          }),
        }).catch(() => null);
        const refreshedCartPayload = refreshedCartResponse
          ? await refreshedCartResponse.json().catch(() => ({}))
          : null;
        if (!mounted) return;
        if (refreshedCartResponse?.ok && refreshedCartPayload?.ok !== false) {
          setCart((refreshedCartPayload?.data?.cart ?? null) as CartPayload | null);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setCart(null);
      })
      .finally(() => {
        if (!mounted) return;
        setDeliveryFeeLoading(false);
        setCheckoutReserveLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [cartOwnerId, uid]);

  useEffect(() => {
    setAddressDraft(defaultAddressDraft(profile ?? undefined));
  }, [profile?.accountName, profile?.displayName]);

  useEffect(() => {
    if (!isAuthenticated && locations.length === 0) {
      setShowAddAddress(true);
      setPaymentMode("new");
    }
  }, [isAuthenticated, locations.length]);

  useEffect(() => {
    if (!snackbarMessage) return undefined;
    const timer = window.setTimeout(() => setSnackbarMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [snackbarMessage]);

  useEffect(() => {
    const activeCartOwnerId = cartOwnerId || uid || null;
    const currentCartId = String(cart?.cart?.cart_id || "").trim();
    if (!activeCartOwnerId || !currentCartId || loading || deliveryFeeLoading || checkoutReserveLoading || !cartItems.length) {
      setCheckoutSessionLoading(false);
      return;
    }

    let cancelled = false;
    setCheckoutSessionLoading(true);

    fetch("/api/client/v1/checkout/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cartOwnerId: activeCartOwnerId,
        cartId: currentCartId,
        sessionId: requestedCheckoutSessionId || null,
      }),
    })
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => {
        if (cancelled) return;
        if (payload?.ok === false) {
          throw new Error(payload?.message || "We could not prepare your checkout.");
        }
        const resolvedSessionId = String(payload?.data?.session?.sessionId || "").trim();
        if (!resolvedSessionId) {
          throw new Error("We could not resolve a checkout session.");
        }
        if (resolvedSessionId !== requestedCheckoutSessionId) {
          const nextParams = new URLSearchParams(searchParams?.toString() || "");
          nextParams.set("session", resolvedSessionId);
          router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "We could not prepare your checkout.";
        setErrorMessage(message);
      })
      .finally(() => {
        if (!cancelled) setCheckoutSessionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    cart?.cart?.cart_id,
    Array.isArray(cart?.items) ? cart.items.length : 0,
    cartOwnerId,
    deliveryFeeLoading,
    checkoutReserveLoading,
    loading,
    pathname,
    requestedCheckoutSessionId,
    router,
    searchParams,
    uid,
  ]);

  useEffect(() => {
    if (paymentMode !== "new" || !stripePublishableKey) return undefined;
    let cancelled = false;
    let frameId = 0;

    async function mountCardElements() {
      try {
        const numberHost = document.getElementById("piessang-card-number");
        const expiryHost = document.getElementById("piessang-card-expiry");
        const cvcHost = document.getElementById("piessang-card-cvc");
        if (!numberHost || !expiryHost || !cvcHost) {
          frameId = window.requestAnimationFrame(() => {
            if (!cancelled) void mountCardElements();
          });
          return;
        }
        const Stripe = await loadStripeJs();
        if (!Stripe) throw new Error("Stripe.js is not available.");
        cardNumberRef.current?.unmount?.();
        cardExpiryRef.current?.unmount?.();
        cardCvcRef.current?.unmount?.();
        cardNumberRef.current = null;
        cardExpiryRef.current = null;
        cardCvcRef.current = null;
        const stripe = Stripe(stripePublishableKey);
        stripeRef.current = stripe;
        const elements = stripe.elements({
          appearance: {
            theme: "stripe",
            variables: {
              colorPrimary: "#e3c52f",
              colorText: "#202020",
              colorBackground: "#ffffff",
              colorDanger: "#b91c1c",
              borderRadius: "10px",
            },
          },
        });
        if (!elements) throw new Error("Stripe payment fields are not available.");
        elementsRef.current = elements;
        const baseStyle = {
          style: {
            base: {
              fontSize: "14px",
              color: "#202020",
              fontFamily: "var(--font-geist-sans), sans-serif",
              "::placeholder": {
                color: "#8a94a3",
              },
            },
            invalid: {
              color: "#b91c1c",
            },
          },
        };
        const cardNumber = elements.create("cardNumber", baseStyle);
        const cardExpiry = elements.create("cardExpiry", baseStyle);
        const cardCvc = elements.create("cardCvc", baseStyle);
        if (cancelled) return;
        cardNumber.mount("#piessang-card-number");
        cardExpiry.mount("#piessang-card-expiry");
        cardCvc.mount("#piessang-card-cvc");
        cardNumberRef.current = cardNumber;
        cardExpiryRef.current = cardExpiry;
        cardCvcRef.current = cardCvc;
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "We could not open secure payment.";
        if (!message.includes("applies to no DOM elements")) {
          setErrorMessage(message);
          setSnackbarMessage(message);
        }
      } finally {
        if (!cancelled) setStripeLoading(false);
      }
    }

    setStripeLoading(true);
    void mountCardElements();

    return () => {
      cancelled = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      cardNumberRef.current?.unmount?.();
      cardExpiryRef.current?.unmount?.();
      cardCvcRef.current?.unmount?.();
      cardNumberRef.current = null;
      cardExpiryRef.current = null;
      cardCvcRef.current = null;
    };
  }, [paymentMode, stripePublishableKey]);

  const productsTotalIncl = Number(
    (
      Number((cart as any)?.totals?.subtotal_excl || 0) +
      Number((cart as any)?.totals?.vat_total || 0)
    ),
  );
  const cartItems = Array.isArray(cart?.items) ? cart.items : [];
  const buyerDestination = buildBuyerDestinationFromLocation(selectedLocation);
  const canonicalShippingBaseTotal = Number(shippingPreview?.shippingBaseTotal || 0);
  const canonicalShippingFinalTotal = Number(shippingPreview?.shippingFinalTotal || 0);
  const payableIncl = useMemo(
    () => normalizeMoneyAmount(productsTotalIncl + canonicalShippingFinalTotal),
    [canonicalShippingFinalTotal, productsTotalIncl],
  );
  const selectedCard = cards.find((card) => String(card?.id || "") === selectedCardId) || null;
  const sellerGroups = cartItems.reduce<Array<{ seller: string; sellerKey: string; items: CartItem[] }>>((groups, item) => {
    const seller = getSellerGroupLabel(item);
    const sellerKey = getSellerGroupKey(item) || seller;
    const existing = groups.find((group) => group.sellerKey === sellerKey);
    if (existing) existing.items.push(item);
    else groups.push({ seller, sellerKey, items: [item] });
    return groups;
  }, []);
  const shippingOptionsBySeller = useMemo(
    () =>
      new Map(
        (shippingPreview?.options || []).map((entry) => [String(entry?.sellerId || "").trim(), entry as CheckoutShippingOption]),
      ),
    [shippingPreview?.options],
  );
  const shippingErrorsBySeller = useMemo(
    () =>
      new Map(
        (shippingPreview?.errors || []).map((entry) => [String(entry?.sellerId || "").trim(), entry as CheckoutShippingError]),
      ),
    [shippingPreview?.errors],
  );
  const unavailableItems = cartItems.filter(
    (item) => String(item?.availability?.status || "").trim().toLowerCase() === "out_of_stock",
  );
  const hasSelectedDeliveryAddress = Boolean(
    selectedLocation
    && (
      String(selectedLocation?.streetAddress || "").trim()
      || String(selectedLocation?.city || "").trim()
      || String(selectedLocation?.suburb || "").trim()
      || String(selectedLocation?.postalCode || "").trim()
      || (
        Number.isFinite(Number(selectedLocation?.latitude))
        && Number.isFinite(Number(selectedLocation?.longitude))
      )
    ),
  );
  useEffect(() => {
    if (!cartItems.length || !buyerDestination) {
      setShippingPreview(null);
      setShippingPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setShippingPreviewLoading(true);
    fetchCheckoutShippingPreview({
      items: cartItems as Array<Record<string, unknown>>,
      buyerDestination,
    })
      .then((preview) => {
        if (!cancelled) setShippingPreview(preview);
      })
      .catch(() => {
        if (!cancelled) setShippingPreview({ options: [], errors: [], shippingBaseTotal: 0, shippingFinalTotal: 0 });
      })
      .finally(() => {
        if (!cancelled) setShippingPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buyerDestination, cartItems]);
  const sellerDeliverySummaries = sellerGroups.map((group) => {
    const option = shippingOptionsBySeller.get(group.sellerKey);
    const error = shippingErrorsBySeller.get(group.sellerKey);
    return {
      seller: group.seller,
      sellerKey: group.sellerKey,
      summary: error
        ? {
            label: error.message || "This seller does not ship to the selected destination.",
            amount: 0,
            isUnavailable: true,
            reasons: Array.isArray(error.reasons) ? error.reasons : [],
            shipmentSummary: null,
          }
        : option
          ? {
              label: `${formatMoney(option.finalShippingFee)}${formatShippingEta(option.estimatedDeliveryDays) ? ` · ${formatShippingEta(option.estimatedDeliveryDays)}` : ""}`,
              amount: Number(option.finalShippingFee || 0),
              isUnavailable: false,
              reasons: [],
              shipmentSummary: null,
            }
          : shippingPreviewLoading
            ? {
                label: "Resolving shipping...",
                amount: 0,
                isUnavailable: false,
                reasons: [],
                shipmentSummary: null,
              }
          : hasSelectedDeliveryAddress
            ? {
                label: "Shipping unavailable",
                amount: 0,
                isUnavailable: true,
                reasons: [],
                shipmentSummary: null,
              }
            : {
                label: "Shipping calculated at checkout",
                amount: 0,
                isUnavailable: false,
                reasons: [],
                shipmentSummary: null,
              },
    };
  });
  const unavailableLocalSellerGroups = sellerDeliverySummaries.filter((entry) => entry.summary?.isUnavailable === true);
  const sellerDeliveryBreakdown = sellerGroups.map((group) => {
    const option = shippingOptionsBySeller.get(group.sellerKey);
    const error = shippingErrorsBySeller.get(group.sellerKey);
    return {
      seller_key: group.sellerKey,
      seller_name: group.seller,
      applicable: !error && Boolean(option),
      delivery_type: error ? "unavailable" : "shipping",
      label: error?.message || (option ? `${formatMoney(option.finalShippingFee)}${formatShippingEta(option.estimatedDeliveryDays) ? ` · ${formatShippingEta(option.estimatedDeliveryDays)}` : ""}` : "Shipping calculated at checkout"),
      reason: Array.isArray(error?.reasons) ? error?.reasons : [],
      final_shipping_fee: option?.finalShippingFee || 0,
    };
  });
  const unavailableSellerDeliveryGroups = sellerDeliveryBreakdown.filter(
    (entry) => entry?.applicable === false && String(entry?.delivery_type || "").trim().toLowerCase() === "unavailable",
  );
  const mobileStickyFulfillmentLabel = useMemo(() => {
    if (!hasSelectedDeliveryAddress || !cartItems.length) return "";
    const maxEta = (shippingPreview?.options || [])
      .map((entry) => Number(entry?.estimatedDeliveryDays?.max))
      .filter((value) => Number.isFinite(value))
      .reduce((current, value) => Math.max(current, value), 0);
    if (!maxEta) return "";
    return `Estimated full order in up to ${maxEta} day${maxEta === 1 ? "" : "s"}`;
  }, [cartItems.length, hasSelectedDeliveryAddress, shippingPreview?.options]);
  const blockedSellerKeys = new Set(
    hasSelectedDeliveryAddress
      ? (shippingPreview?.errors || [])
          .filter((entry) =>
            String(entry?.code || "").trim() === "SELLER_DOES_NOT_SHIP_TO_LOCATION" ||
            String(entry?.code || "").trim() === "WEIGHT_REQUIRED_FOR_SHIPPING_MODE",
          )
          .map((entry) => String(entry?.sellerId || "").trim())
          .filter(Boolean)
      : [],
  );
  const checkoutBlocked = unavailableItems.length > 0 || blockedSellerKeys.size > 0;
  const deliveryBlocked = blockedSellerKeys.size > 0;
  const canUseSavedCard = paymentMode === "saved" && Boolean(selectedCard?.id);
  const canUseNewCard = paymentMode === "new" && newCard.holder.trim().length > 1;
  const hasCheckoutContactDetails = Boolean(
    contactDraft.recipientName.trim() &&
      (isAuthenticated || contactDraft.email.trim()) &&
      combinePhoneNumber(contactDraft.phoneCountryCode, contactDraft.phoneNumber).trim(),
  );
  const cartIsResolving = loading || deliveryFeeLoading || checkoutReserveLoading || checkoutSessionLoading || shippingPreviewLoading;
  const cartIsEmpty = !cartIsResolving && cartItems.length === 0;
  const countryOptions = useMemo(
    () =>
      Array.from(
        new Map(
          PHONE_REGION_OPTIONS.map((option) => [
            option.label.replace(/\s*\(\+\d+\)$/, ""),
            {
              name: option.label.replace(/\s*\(\+\d+\)$/, ""),
              iso: option.iso,
              flag: countryIsoToFlagEmoji(option.iso),
            },
          ]),
        ).values(),
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const cardErrors = {
    holder: newCard.holder.trim().length > 1 ? "" : "Enter the name exactly as it appears on the card.",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: "",
  };
  const previewCardBrand =
    paymentMode === "saved"
      ? String(selectedCard?.brand || "Piessang").toUpperCase()
      : "PIESSANG PAY";
  const previewCardholder =
    paymentMode === "saved"
      ? String(profile?.accountName || profile?.displayName || "Piessang shopper").trim() || "Piessang shopper"
      : newCard.holder.trim() || "CARDHOLDER NAME";
  const previewCardNumber =
    paymentMode === "saved"
      ? maskPreviewNumber(selectedCard?.last4)
      : "••••  ••••  ••••  ••••";
  const previewCardExpiry =
    paymentMode === "saved"
      ? formatPreviewExpiry(selectedCard?.expiryMonth, selectedCard?.expiryYear)
      : "MM/YY";
  const previewCardThemeKey =
    paymentMode === "saved"
      ? selectedCard?.themeKey || `${selectedCard?.id || ""}:${previewCardBrand}:${selectedCard?.last4 || ""}`
      : `${previewCardBrand}:${newCard.holder.trim()}`;
  const previewCardTheme = resolveCardTheme(previewCardThemeKey);
  const selectedCardIndex = useMemo(
    () => Math.max(0, cards.findIndex((card) => String(card?.id || "") === selectedCardId)),
    [cards, selectedCardId],
  );
  const successRedirectHref =
    successState?.orderId && successState?.orderNumber
      ? `/checkout/success?orderId=${encodeURIComponent(successState.orderId)}&orderNumber=${encodeURIComponent(successState.orderNumber)}${successState?.guestOrderAccessToken ? `&guest=${encodeURIComponent(successState.guestOrderAccessToken)}` : ""}`
      : "";

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    loop: cards.length > 1,
    dragFree: false,
    containScroll: "trimSnaps",
  });

  const tweenCardShells = useCallback((api: NonNullable<typeof emblaApi>) => {
    const engine = api.internalEngine();
    const scrollProgress = api.scrollProgress();
    const slides = api.slideNodes();
    const snaps = api.scrollSnapList();

    slides.forEach((slide) => {
      const shell = slide.querySelector<HTMLElement>("[data-card-shell]");
      if (!shell) return;
      shell.style.opacity = "0";
      shell.style.transform = "translateX(0px) scale(0.74) rotateY(0deg)";
      shell.style.filter = "blur(1px) saturate(0.82)";
      shell.style.zIndex = "0";
      shell.style.boxShadow = "0 18px 34px rgba(72,32,122,0.10)";
    });

    snaps.forEach((snapPoint, snapIndex) => {
      let diffToTarget = snapPoint - scrollProgress;
      if (engine.options.loop) {
        engine.slideLooper.loopPoints.forEach((loopItem) => {
          const target = loopItem.target();
          if (loopItem.index === snapIndex && target !== 0) {
            const sign = Math.sign(target);
            if (sign === -1) diffToTarget = snapPoint - (1 + scrollProgress);
            if (sign === 1) diffToTarget = snapPoint + (1 - scrollProgress);
          }
        });
      }

      const slideIndexes = engine.slideRegistry[snapIndex] || [];
      slideIndexes.forEach((slideIndex) => {
        const slide = slides[slideIndex];
        const shell = slide?.querySelector<HTMLElement>("[data-card-shell]");
        if (!shell) return;

        const distance = Math.min(Math.abs(diffToTarget), 1.25);
        const closeness = Math.max(0, 1 - distance / 1.15);
        const direction = diffToTarget === 0 ? 0 : diffToTarget > 0 ? 1 : -1;
        const scale = 0.78 + closeness * 0.22;
        const translateX = direction * (1 - closeness) * 68;
        const rotateY = direction * (1 - closeness) * -24;
        const opacity = 0.42 + closeness * 0.58;
        const blur = (1 - closeness) * 1.1;
        const saturation = 0.84 + closeness * 0.16;

        shell.style.opacity = String(opacity);
        shell.style.transform = `translateX(${translateX}px) scale(${scale}) rotateY(${rotateY}deg)`;
        shell.style.filter = `blur(${blur}px) saturate(${saturation})`;
        shell.style.zIndex = String(Math.round(closeness * 20));
        shell.style.boxShadow = `0 ${18 + closeness * 12}px ${34 + closeness * 18}px rgba(72,32,122,${(0.10 + closeness * 0.12).toFixed(3)})`;
      });
    });
  }, [emblaApi]);

  function rotateSavedCard(direction: 1 | -1) {
    if (!emblaApi || cards.length < 2) return;
    if (direction === 1) emblaApi.scrollNext();
    else emblaApi.scrollPrev();
  }

  useEffect(() => {
    if (!emblaApi) return;
    const syncSelection = () => {
      const index = emblaApi.selectedScrollSnap();
      const cardId = String(cards[index]?.id || "");
      if (cardId) setSelectedCardId(cardId);
    };
    const syncTween = () => tweenCardShells(emblaApi);
    syncSelection();
    syncTween();
    emblaApi.on("select", syncSelection);
    emblaApi.on("reInit", syncSelection);
    emblaApi.on("scroll", syncTween);
    emblaApi.on("select", syncTween);
    emblaApi.on("reInit", syncTween);
    return () => {
      emblaApi.off("select", syncSelection);
      emblaApi.off("reInit", syncSelection);
      emblaApi.off("scroll", syncTween);
      emblaApi.off("select", syncTween);
      emblaApi.off("reInit", syncTween);
    };
  }, [emblaApi, cards, tweenCardShells]);

  useEffect(() => {
    if (!emblaApi || !cards.length || selectedCardIndex < 0) return;
    if (emblaApi.selectedScrollSnap() !== selectedCardIndex) {
      emblaApi.scrollTo(selectedCardIndex);
    }
  }, [emblaApi, cards.length, selectedCardIndex]);

  async function completeSuccessfulStripeCheckout(currentCheckout: StripeCheckoutState) {
    const activeCartOwnerId = cartOwnerId || uid || null;
    if (!activeCartOwnerId) {
      throw new Error("Your payment went through, but we could not locate your cart.");
    }
    const clearCartResponse = await fetch("/api/client/v1/carts/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartOwnerId: activeCartOwnerId }),
    });
    const clearCartPayload = await clearCartResponse.json().catch(() => ({}));
    if (!clearCartResponse.ok || clearCartPayload?.ok === false) {
      throw new Error(clearCartPayload?.message || "Your payment went through, but we could not clear your cart yet.");
    }

    syncCartState({ items: [], totals: { final_incl: 0, final_payable_incl: 0 } });
    await refreshCart();
    setStripeCheckout(null);
    persistStripeCheckoutState(null);
    setSuccessState({
      orderNumber: currentCheckout.orderNumber,
      orderId: currentCheckout.orderId,
      guestOrderAccessToken: currentCheckout.guestOrderAccessToken || "",
    });
    setCart({ items: [], totals: { final_incl: 0, final_payable_incl: 0 } });
    setSnackbarMessage("Payment successful.");
    setPaymentOverlay({
      open: true,
      tone: "success",
      title: "Payment successful",
      message: `Order ${currentCheckout.orderNumber} is confirmed.`,
      detail: "You can continue now or wait a few seconds while we take you to your success page automatically.",
    });
    await new Promise((resolve) => window.setTimeout(resolve, PAYMENT_SUCCESS_REDIRECT_MS));
    const guestQuery = currentCheckout.guestOrderAccessToken
      ? `&guest=${encodeURIComponent(currentCheckout.guestOrderAccessToken)}`
      : "";
    router.replace(`/checkout/success?orderId=${encodeURIComponent(currentCheckout.orderId)}&orderNumber=${encodeURIComponent(currentCheckout.orderNumber)}${guestQuery}`);
  }

  async function waitForOrderFinalization(currentCheckout: StripeCheckoutState) {
    for (let attempt = 0; attempt < ORDER_FINALIZATION_MAX_ATTEMPTS; attempt += 1) {
      const response = await fetch("/api/client/v1/orders/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: currentCheckout.orderId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.ok !== false) {
        const orderData = payload?.data?.data ?? payload?.data ?? null;
        const paymentStatus = readOrderPaymentStatus(orderData);
        const finalizationState = readOrderFinalizationState(orderData);
        if (paymentStatus === "paid") {
          return true;
        }
        if (finalizationState === "failed") {
          throw new Error("Your payment was received, but we could not finalize the order yet. Please contact support if this persists.");
        }
      }

      await new Promise((resolve) => window.setTimeout(resolve, ORDER_FINALIZATION_POLL_MS));
    }

    throw new Error("Your payment was received and is still finalizing. Please refresh in a moment if you are not redirected automatically.");
  }

  async function finalizeStripeCheckout(currentCheckout: StripeCheckoutState, paymentIntentId?: string) {
    try {
      setPaymentOverlay({
        open: true,
        tone: "processing",
        title: "Processing payment",
        message: "Your payment was received.",
        detail: "We’re confirming your order, clearing your cart, and preparing your success page.",
      });
      const finalizeResponse = await fetch("/api/client/v1/orders/payment-success", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: currentCheckout.orderId,
          payment: {
            provider: "stripe",
            method: "card",
            chargeType: paymentMode === "saved" ? "saved_payment_method" : "elements_card",
            merchantTransactionId: currentCheckout.merchantTransactionId,
            stripePaymentIntentId: paymentIntentId || currentCheckout.paymentIntentId,
            amount_incl: payableIncl,
            currency: "ZAR",
          },
        }),
      });
      const finalizePayload = await finalizeResponse.json().catch(() => ({}));
      if (!finalizeResponse.ok || finalizePayload?.ok === false) {
        await fetch("/api/client/v1/orders/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: currentCheckout.orderId,
            orderNumber: currentCheckout.orderNumber,
            merchantTransactionId: currentCheckout.merchantTransactionId,
          }),
        }).catch(() => null);
        throw new Error(finalizePayload?.message || "We couldn’t confirm your Stripe payment.");
      }
      const finalizeStatus = String(
        finalizePayload?.data?.status || finalizePayload?.status || "",
      )
        .trim()
        .toLowerCase();
      if (finalizeStatus === "processing") {
        setPaymentOverlay({
          open: true,
          tone: "processing",
          title: "Finalizing order",
          message: "Your payment went through.",
          detail: "We’re still finalizing your order in the background now.",
        });
        await waitForOrderFinalization(currentCheckout);
      }
      await completeSuccessfulStripeCheckout(currentCheckout);
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not confirm your payment.";
      setErrorMessage(message);
      setSnackbarMessage(message);
      setPaymentOverlay((current) => ({ ...current, open: false }));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelEmbeddedStripeCheckout() {
    cardNumberRef.current?.unmount?.();
    cardExpiryRef.current?.unmount?.();
    cardCvcRef.current?.unmount?.();
    cardNumberRef.current = null;
    cardExpiryRef.current = null;
    cardCvcRef.current = null;
    const currentCheckout = stripeCheckout;
    setStripeCheckout(null);
    persistStripeCheckoutState(null);
    setStripeLoading(false);
    setPaymentOverlay((current) => ({ ...current, open: false }));
    if (!currentCheckout) return;
    await fetch("/api/client/v1/orders/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: currentCheckout.orderId,
        orderNumber: currentCheckout.orderNumber,
        merchantTransactionId: currentCheckout.merchantTransactionId,
      }),
    }).catch(() => null);
    setSubmitting(false);
    setSnackbarMessage("Secure payment was cancelled.");
  }

  async function handleStripePaymentSubmit(currentCheckout: StripeCheckoutState) {
    try {
      const Stripe = await loadStripeJs();
      const stripe = stripeRef.current || (Stripe ? Stripe(currentCheckout.publishableKey) : null);
      if (!stripe) throw new Error("Stripe.js is not available.");
      setPaymentOverlay({
        open: true,
        tone: "auth",
        title: "Confirming payment",
        message: "Securely confirming your payment with Stripe.",
        detail: "Your bank may ask you to complete 3D Secure authentication. Keep this page open while we confirm the payment.",
      });

      let result: any;
      if (paymentMode === "saved" && selectedCard?.id) {
        result = await stripe.confirmCardPayment(currentCheckout.clientSecret, {
          payment_method: String(selectedCard.id),
        });
      } else {
        const cardElement = cardNumberRef.current;
        if (!cardElement) throw new Error("Secure card fields are not ready yet.");
        result = await stripe.confirmCardPayment(currentCheckout.clientSecret, {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: newCard.holder.trim(),
              email: String(profile?.email || "").trim() || undefined,
              phone: combinePhoneNumber(contactDraft.phoneCountryCode, contactDraft.phoneNumber).trim() || undefined,
            },
          },
        });
      }

      const recoveredPaymentIntent =
        result?.error?.code === "payment_intent_unexpected_state" &&
        String(result?.error?.payment_intent?.status || "").trim().toLowerCase() === "succeeded"
          ? result.error.payment_intent
          : null;

      if (result?.error && !recoveredPaymentIntent) {
        throw new Error(result.error.message || "Your payment could not be completed.");
      }

      const paymentIntentId = String(
        result?.paymentIntent?.id || recoveredPaymentIntent?.id || currentCheckout.paymentIntentId || "",
      );
      const paymentIntentStatus = String(
        result?.paymentIntent?.status || recoveredPaymentIntent?.status || "",
      )
        .trim()
        .toLowerCase();
      if (paymentIntentStatus && paymentIntentStatus !== "succeeded") {
        const statusResponse = await fetch(
          `/api/client/v1/payments/stripe/payment-intent-status?paymentIntentId=${encodeURIComponent(paymentIntentId)}`,
          { cache: "no-store" },
        );
        const statusPayload = await statusResponse.json().catch(() => ({}));
        const confirmedStatus = String(statusPayload?.data?.status || "").trim().toLowerCase();
        if (confirmedStatus !== "succeeded") {
          throw new Error(statusPayload?.message || "Your payment is still waiting for confirmation.");
        }
      }

      await finalizeStripeCheckout(currentCheckout, paymentIntentId);
      await refreshSavedCards().catch(() => null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Your payment could not be completed.";
      setErrorMessage(message);
      setSnackbarMessage(message);
      setPaymentOverlay((current) => ({ ...current, open: false }));
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!stripeCheckout || successState) return;
    let cancelled = false;
    const currentCheckout = stripeCheckout;

    async function resumeStripeCheckout() {
      try {
        const statusResponse = await fetch(
          `/api/client/v1/payments/stripe/payment-intent-status?paymentIntentId=${encodeURIComponent(currentCheckout.paymentIntentId)}`,
          { cache: "no-store" },
        );
        const statusPayload = await statusResponse.json().catch(() => ({}));
        const confirmedStatus = String(statusPayload?.data?.status || "").trim().toLowerCase();
        if (cancelled) return;

        if (confirmedStatus === "succeeded") {
          setPaymentOverlay({
            open: true,
            tone: "processing",
            title: "Finalizing order",
            message: "Your bank has confirmed the payment.",
            detail: "We’re wrapping up your order now.",
          });
          await finalizeStripeCheckout(currentCheckout, currentCheckout.paymentIntentId);
          return;
        }

        if (confirmedStatus === "processing" || confirmedStatus === "requires_capture") {
          setSubmitting(true);
          setPaymentOverlay({
            open: true,
            tone: "processing",
            title: "Payment processing",
            message: "Stripe is still confirming your payment.",
            detail: "Please keep this page open for a few more seconds.",
          });
          return;
        }

        if (confirmedStatus === "requires_action") {
          setSubmitting(true);
          setPaymentOverlay({
            open: true,
            tone: "auth",
            title: "Additional authentication required",
            message: "Please complete the bank authentication step.",
            detail: "Once your bank confirms it, we’ll finalize the order automatically.",
          });
          return;
        }

        if (confirmedStatus && confirmedStatus !== "requires_payment_method") {
          setSubmitting(true);
          return;
        }

        setPaymentOverlay((current) => ({ ...current, open: false }));
        setSubmitting(false);
      } catch {
        if (cancelled) return;
        setPaymentOverlay((current) => ({ ...current, open: false }));
        setSubmitting(false);
      }
    }

    void resumeStripeCheckout();
    return () => {
      cancelled = true;
    };
  }, [stripeCheckout, successState]);

  async function refreshSavedCards() {
    if (!uid) return;
    const response = await fetch("/api/client/v1/accounts/paymentMethods/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: uid }),
    });
    const payload = await response.json().catch(() => ({}));
    const nextCards = Array.isArray(payload?.data?.paymentMethods?.cards)
      ? payload.data.paymentMethods.cards
      : [];
    setCards(nextCards);
    setSelectedCardId((current) => {
      if (nextCards.some((card: SavedCard) => String(card?.id || "") === current)) return current;
      return String(nextCards[0]?.id || "");
    });
    setPaymentMode(nextCards.length ? "saved" : "new");
  }

  async function handleDeleteSavedCard(cardId: string) {
    if (!uid || !cardId) return;
    setDeletingCardId(cardId);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/paymentMethods/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, cardId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "We could not delete that card right now.");
      }
      await refreshSavedCards();
      setSnackbarMessage("Card removed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not delete that card right now.";
      setErrorMessage(message);
      setSnackbarMessage(message);
    } finally {
      setDeletingCardId("");
    }
  }

  async function handleCreateAddress(options?: { silentSuccess?: boolean }) {
    if (!addressDraft.locationName.trim() || !addressDraft.streetAddress.trim()) {
      setErrorMessage("Add a name for this address and a street address before saving it.");
      setSnackbarMessage("Please complete the required address fields.");
      return null;
    }

    if (!isAuthenticated || !uid) {
      const nextLocation = {
        id: `guest-${Date.now()}`,
        locationName: addressDraft.locationName.trim(),
        label: addressDraft.locationName.trim(),
        recipientName: contactDraft.recipientName.trim(),
        streetAddress: addressDraft.streetAddress.trim(),
        addressLine2: addressDraft.addressLine2.trim(),
        suburb: addressDraft.suburb.trim(),
        city: addressDraft.city.trim(),
        stateProvinceRegion: addressDraft.stateProvinceRegion.trim(),
        province: addressDraft.stateProvinceRegion.trim(),
        postalCode: addressDraft.postalCode.trim(),
        country: addressDraft.country.trim(),
        phoneCountryCode: contactDraft.phoneCountryCode.trim(),
        phoneNumber: combinePhoneNumber(contactDraft.phoneCountryCode, contactDraft.phoneNumber).trim(),
        deliveryInstructions: addressDraft.instructions.trim(),
        instructions: addressDraft.instructions.trim(),
        is_default: false,
        latitude: Number.isFinite(Number(addressDraft.latitude)) ? Number(addressDraft.latitude) : null,
        longitude: Number.isFinite(Number(addressDraft.longitude)) ? Number(addressDraft.longitude) : null,
      };
      setLocations([nextLocation]);
      setSelectedLocationIndex(0);
      setShowAddAddress(false);
      if (!options?.silentSuccess) setSnackbarMessage("Address ready for this order.");
      return nextLocation;
    }

    setAddressSaving(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/locations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uid,
          location: {
            locationName: addressDraft.locationName.trim(),
            recipientName: contactDraft.recipientName.trim(),
            streetAddress: addressDraft.streetAddress.trim(),
            addressLine2: addressDraft.addressLine2.trim(),
            suburb: addressDraft.suburb.trim(),
            city: addressDraft.city.trim(),
            stateProvinceRegion: addressDraft.stateProvinceRegion.trim(),
            postalCode: addressDraft.postalCode.trim(),
            country: addressDraft.country.trim(),
            phoneCountryCode: contactDraft.phoneCountryCode.trim(),
            phoneNumber: combinePhoneNumber(contactDraft.phoneCountryCode, contactDraft.phoneNumber).trim(),
            deliveryInstructions: addressDraft.instructions.trim(),
            is_default: addressDraft.is_default,
            latitude: Number.isFinite(Number(addressDraft.latitude)) ? Number(addressDraft.latitude) : null,
            longitude: Number.isFinite(Number(addressDraft.longitude)) ? Number(addressDraft.longitude) : null,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "We could not save that address right now.");
      }

      const nextLocations = Array.isArray(payload?.data?.deliveryLocations)
        ? payload.data.deliveryLocations
        : [];
      const nextSelectedIndex = Math.max(0, nextLocations.length - 1);
      const nextSelectedLocation = nextLocations[nextSelectedIndex] || null;
      setLocations(nextLocations);
      setSelectedLocationIndex(nextSelectedIndex);
      setShowAddAddress(false);
      setAddressDraft(defaultAddressDraft(profile ?? undefined));
      if (!options?.silentSuccess) setSnackbarMessage("Address saved.");
      return nextSelectedLocation;
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not save that address right now.";
      setErrorMessage(message);
      setSnackbarMessage(message);
      return null;
    } finally {
      setAddressSaving(false);
    }
  }

  async function handleUpdateAddress() {
    if (!uid || !editingLocationId) return;
    if (!addressDraft.locationName.trim() || !addressDraft.streetAddress.trim()) {
      setErrorMessage("Add a name for this address and a street address before saving it.");
      setSnackbarMessage("Please complete the required address fields.");
      return;
    }

    setAddressEditing(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/locations/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uid,
          locationId: editingLocationId,
          updates: {
            locationName: addressDraft.locationName.trim(),
            label: addressDraft.locationName.trim(),
            recipientName: contactDraft.recipientName.trim(),
            streetAddress: addressDraft.streetAddress.trim(),
            addressLine2: addressDraft.addressLine2.trim(),
            suburb: addressDraft.suburb.trim(),
            city: addressDraft.city.trim(),
            stateProvinceRegion: addressDraft.stateProvinceRegion.trim(),
            province: addressDraft.stateProvinceRegion.trim(),
            postalCode: addressDraft.postalCode.trim(),
            country: addressDraft.country.trim(),
            phoneCountryCode: contactDraft.phoneCountryCode.trim(),
            phoneNumber: combinePhoneNumber(contactDraft.phoneCountryCode, contactDraft.phoneNumber).trim(),
            deliveryInstructions: addressDraft.instructions.trim(),
            instructions: addressDraft.instructions.trim(),
            is_default: addressDraft.is_default,
            latitude: Number.isFinite(Number(addressDraft.latitude)) ? Number(addressDraft.latitude) : null,
            longitude: Number.isFinite(Number(addressDraft.longitude)) ? Number(addressDraft.longitude) : null,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "We could not update that address right now.");
      }
      const nextLocations = Array.isArray(payload?.data?.deliveryLocations)
        ? payload.data.deliveryLocations
        : [];
      setLocations(nextLocations);
      const updatedIndex = nextLocations.findIndex((location: any) => String(location?.id || "") === editingLocationId);
      if (updatedIndex >= 0) setSelectedLocationIndex(updatedIndex);
      setEditingLocationId("");
      setAddressDraft(defaultAddressDraft(profile ?? undefined));
      setSnackbarMessage("Address updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not update that address right now.";
      setErrorMessage(message);
      setSnackbarMessage(message);
    } finally {
      setAddressEditing(false);
    }
  }

  async function removeSellerGroupItems(groupItems: CartItem[], sellerName: string) {
    const activeCartOwnerId = cartOwnerId || uid || null;
    if (!activeCartOwnerId || !groupItems.length) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      for (const item of groupItems) {
        const { productId, variantId } = getLineIds(item);
        if (!productId || !variantId) continue;
        const response = await fetch("/api/client/v1/carts/removeItem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cartOwnerId: activeCartOwnerId, unique_id: productId, variant_id: variantId }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || `We could not remove ${sellerName} from your cart right now.`);
        }
      }

      const refreshed = await fetch("/api/client/v1/carts/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartOwnerId: activeCartOwnerId,
          lightweight: true,
        }),
      });
      const refreshedPayload = await refreshed.json().catch(() => ({}));
      const nextCart = (refreshedPayload?.data?.cart ?? null) as CartPayload | null;
      setCart(nextCart);
      syncCartState(nextCart);
      await refreshCart();
      setSnackbarMessage(`${sellerName} removed from your cart.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not update your cart right now.";
      setErrorMessage(message);
      setSnackbarMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckout() {
    const activeCartOwnerId = cartOwnerId || uid || null;
    if (!activeCartOwnerId) {
      return;
    }
    let resolvedSelectedLocation = selectedLocation;
    const scrollToValidationTarget = (
      target: { current: HTMLElement | HTMLInputElement | HTMLDivElement | null },
      fallbackSection?: { current: HTMLElement | null },
    ) => {
      const element = target.current || fallbackSection?.current || null;
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        if ("focus" in element && typeof element.focus === "function") {
          element.focus();
          return;
        }
        const nestedInput = element.querySelector?.("input, button, [tabindex]");
        if (nestedInput instanceof HTMLElement) nestedInput.focus();
      }, 220);
    };
    if (!contactDraft.recipientName.trim()) {
      const message = "Add the recipient name before placing your order.";
      setErrorMessage(message);
      setSnackbarMessage(message);
      scrollToValidationTarget(recipientNameInputRef, contactSectionRef);
      return;
    }
    if (!isAuthenticated && !contactDraft.email.trim()) {
      const message = "Add your email address before placing your order.";
      setErrorMessage(message);
      setSnackbarMessage(message);
      scrollToValidationTarget(emailInputRef, contactSectionRef);
      return;
    }
    if (!isAuthenticated && !isBasicEmailAddress(contactDraft.email)) {
      const message = "Add a valid email address before placing your order.";
      setErrorMessage(message);
      setSnackbarMessage(message);
      scrollToValidationTarget(emailInputRef, contactSectionRef);
      return;
    }
    if (!contactDraft.phoneNumber.trim()) {
      const message = "Add a mobile number for delivery updates before placing your order.";
      setErrorMessage(message);
      setSnackbarMessage(message);
      scrollToValidationTarget(phoneFieldRef, contactSectionRef);
      return;
    }
    if (!resolvedSelectedLocation) {
      const isEnteringManualAddress =
        showAddAddress ||
        !hasSavedAddresses ||
        Boolean(
          addressDraft.locationName.trim() ||
          addressDraft.streetAddress.trim() ||
          addressDraft.suburb.trim() ||
          addressDraft.city.trim() ||
          addressDraft.stateProvinceRegion.trim() ||
          addressDraft.postalCode.trim() ||
          addressDraft.country.trim(),
        );

      if (isEnteringManualAddress) {
        if (!addressDraft.locationName.trim()) {
          const message = "Add an address name before placing your order.";
          setErrorMessage(message);
          setSnackbarMessage(message);
          scrollToValidationTarget(addressNameInputRef, addressSectionRef);
          return;
        }
        if (!addressDraft.streetAddress.trim()) {
          const message = "Add the street address before placing your order.";
          setErrorMessage(message);
          setSnackbarMessage(message);
          scrollToValidationTarget(streetAddressInputRef, addressSectionRef);
          return;
        }
        if (!addressDraft.suburb.trim() || !addressDraft.city.trim() || !addressDraft.stateProvinceRegion.trim() || !addressDraft.postalCode.trim() || !addressDraft.country.trim()) {
          const message = "Complete the delivery address before placing your order.";
          setErrorMessage(message);
          setSnackbarMessage(message);
          scrollToValidationTarget(addressSectionRef, addressSectionRef);
          return;
        }

        const createdLocation = await handleCreateAddress({ silentSuccess: true });
        if (!createdLocation) {
          scrollToValidationTarget(addressSectionRef, addressSectionRef);
          return;
        }
        resolvedSelectedLocation = createdLocation as any;
      } else {
        if (!showAddAddress) {
          setShowAddAddress(true);
        }
        const message = "Choose or add a delivery address before placing your order.";
        setErrorMessage(message);
        setSnackbarMessage(message);
        scrollToValidationTarget(addressNameInputRef, addressSectionRef);
        return;
      }
    }
    if (checkoutBlocked) {
      const message = deliveryBlocked
        ? "One or more seller groups do not ship to this address. Remove them or change your address before placing your order."
        : "Remove the out-of-stock items from your cart before placing your order.";
      setDeliveryBlockError(
        deliveryBlocked
          ? {
              title: "Shipping unavailable for this address",
              message,
              sellers: unavailableSellerDeliveryGroups
                .map((entry) => String(entry?.seller_name || "").trim())
                .filter(Boolean),
              reasons: unavailableLocalSellerGroups.flatMap((entry) =>
                Array.isArray(entry.summary?.reasons) ? entry.summary.reasons.filter(Boolean) : [],
              ),
            }
          : null,
      );
      setErrorMessage(message);
      setSnackbarMessage(message);
      return;
    }
    if (hasSelectedDeliveryAddress && shippingPreviewLoading) {
      const message = "We’re still confirming shipping for your address. Please wait a moment and try again.";
      setErrorMessage(message);
      setSnackbarMessage(message);
      return;
    }
    if (buyerDestination && sellerGroups.length) {
      const validateResponse = await fetch("/api/checkout/validate-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerDestination,
          sellerGroups: sellerGroups.map((group) => ({
            sellerId: group.sellerKey,
            zoneId: shippingOptionsBySeller.get(group.sellerKey)?.matchedRuleId || null,
            items: group.items,
          })),
        }),
      });
      const validatePayload = await validateResponse.json().catch(() => ({}));
      if (!validateResponse.ok || validatePayload?.ok === false) {
        const errors = Array.isArray(validatePayload?.errors) ? validatePayload.errors : [];
        const blockingErrors = errors.filter((entry: any) => {
          const code = String(entry?.code || "").trim();
          return code === "SELLER_DOES_NOT_SHIP_TO_LOCATION" || code === "WEIGHT_REQUIRED_FOR_SHIPPING_MODE" || code === "INVALID_SELECTION";
        });
        if (blockingErrors.length) {
          setShippingPreview((current) =>
            current
              ? {
                  ...current,
                  errors: blockingErrors,
                }
              : { options: [], errors: blockingErrors, shippingBaseTotal: 0, shippingFinalTotal: 0 },
          );
          const message = String(blockingErrors[0]?.message || "Shipping is no longer valid for one or more seller groups.");
          setDeliveryBlockError({
            title: "Shipping validation failed",
            message,
            sellers: blockingErrors.map((entry: any) => String(entry?.sellerId || "").trim()).filter(Boolean),
            reasons: [],
          });
          setErrorMessage(message);
          setSnackbarMessage(message);
          return;
        }
      }
    }
    if (paymentMode === "saved" && !selectedCard?.id) {
      const message = "Choose a saved card or switch to a new card before placing your order.";
      setErrorMessage(message);
      setSnackbarMessage(message);
      scrollToValidationTarget(paymentSectionRef, paymentSectionRef);
      return;
    }
    if (paymentMode === "new") {
      if (!newCard.holder.trim()) {
        const message = "Add the card holder name before placing your order.";
        setErrorMessage(message);
        setSnackbarMessage(message);
        scrollToValidationTarget(cardHolderInputRef, paymentSectionRef);
        return;
      }
      if (!canUseNewCard) {
        const message = "Complete the new card details before placing your order.";
        setErrorMessage(message);
        setSnackbarMessage(message);
        scrollToValidationTarget(paymentSectionRef, paymentSectionRef);
        return;
      }
    }
    if (stripeCheckout) {
      setSubmitting(true);
      setErrorMessage(null);
      setDeliveryBlockError(null);
      setPaymentOverlay({
        open: true,
        tone: "processing",
        title: "Preparing secure payment",
        message: "We’re opening your secure Piessang payment flow.",
        detail: "This will move into bank confirmation or 3D Secure if your card requires it.",
      });
      await handleStripePaymentSubmit(stripeCheckout);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setDeliveryBlockError(null);
    setPaymentOverlay({
      open: true,
      tone: "processing",
      title: "Preparing secure payment",
      message: "We’re setting up your Piessang payment now.",
      detail: "Please keep this page open while we create your secure payment session.",
    });
    let createdOrderId = "";
    let createdOrderNumber = "";
    let createdMerchantTransactionId = "";

    try {
      const createResponse = await fetch("/api/client/v1/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartId: activeCartOwnerId,
          customerId: activeCartOwnerId,
          checkoutSessionId: requestedCheckoutSessionId || null,
          customerEmail: contactDraft.email.trim() || null,
          deliveryAddress: {
            ...(resolvedSelectedLocation || {}),
            recipientName: contactDraft.recipientName.trim(),
            phoneCountryCode: contactDraft.phoneCountryCode.trim(),
            phoneNumber: combinePhoneNumber(contactDraft.phoneCountryCode, contactDraft.phoneNumber).trim(),
          },
          source: "web",
        }),
      });
      const createPayload = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok || createPayload?.ok === false) {
        const sellerList = Array.isArray(createPayload?.sellers)
          ? createPayload.sellers.map((value: any) => String(value || "").trim()).filter(Boolean)
          : [];
        if (String(createPayload?.reasonCode || "").trim().toUpperCase() === "SELLER_DELIVERY_UNAVAILABLE") {
          const reasons = unavailableLocalSellerGroups
            .filter((group) => !sellerList.length || sellerList.includes(String(group?.seller || "").trim()))
            .flatMap((group) => (Array.isArray(group.summary?.reasons) ? group.summary.reasons.filter(Boolean) : []));
          setDeliveryBlockError({
            title: createPayload?.title || "Shipping unavailable for this address",
            message: createPayload?.message || "One or more seller groups do not ship to this address.",
            sellers: sellerList,
            reasons,
          });
        }
        throw new Error(createPayload?.message || "We could not create your order.");
      }

      const orderId = String(createPayload?.data?.orderId || "");
      const orderNumber = String(createPayload?.data?.orderNumber || "");
      const merchantTransactionId = String(createPayload?.data?.merchantTransactionId || "");
      const guestOrderAccessToken = String(createPayload?.data?.guestOrderAccessToken || "").trim();
      if (!orderId || !merchantTransactionId) {
        throw new Error("The order was created without the payment details we expected.");
      }
      createdOrderId = orderId;
      createdOrderNumber = orderNumber;
      createdMerchantTransactionId = merchantTransactionId;

      const chargeResponse = await fetch("/api/client/v1/payments/stripe/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: activeCartOwnerId,
          orderId,
          savePaymentMethod: isAuthenticated && paymentMode === "new" ? newCard.saveCard : false,
          selectedPaymentMethodId: isAuthenticated && paymentMode === "saved" ? String(selectedCard?.id || "") : "",
        }),
      });
      const chargeJson = await chargeResponse.json().catch(() => ({}));
      if (!chargeResponse.ok || chargeJson?.ok === false) {
        throw new Error(chargeJson?.message || "Your payment could not be completed.");
      }

      const clientSecret = String(chargeJson?.data?.clientSecret || chargeJson?.clientSecret || "").trim();
      const paymentIntentId = String(chargeJson?.data?.paymentIntentId || chargeJson?.paymentIntentId || "").trim();
      const publishableKey = String(chargeJson?.data?.publishableKey || chargeJson?.publishableKey || "").trim();
      if (!clientSecret || !paymentIntentId || !publishableKey) {
        throw new Error("Stripe payment did not return the details we expected.");
      }

      const nextCheckout = {
        clientSecret,
        publishableKey,
        paymentIntentId,
        orderId,
        orderNumber: orderNumber || merchantTransactionId,
        merchantTransactionId,
        guestOrderAccessToken,
      };
      setStripeCheckout(nextCheckout);
      await handleStripePaymentSubmit(nextCheckout);
    } catch (error) {
      if (createdOrderId || createdOrderNumber || createdMerchantTransactionId) {
        await fetch("/api/client/v1/orders/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(createdOrderId ? { orderId: createdOrderId } : {}),
            ...(createdOrderNumber ? { orderNumber: createdOrderNumber } : {}),
            ...(createdMerchantTransactionId ? { merchantTransactionId: createdMerchantTransactionId } : {}),
          }),
        }).catch(() => null);
      }
      const message = error instanceof Error ? error.message : "We could not complete your checkout.";
      setErrorMessage(message);
      setSnackbarMessage(message);
      setPaymentOverlay((current) => ({ ...current, open: false }));
    } finally {
      setSubmitting(false);
    }
  }

  if (successState) {
    return (
      <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Order placed</p>
        <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Payment successful</h1>
        <p className="mt-3 text-[14px] leading-[1.7] text-[#57636c]">
          Your order <span className="font-semibold text-[#202020]">{successState.orderNumber}</span> has been placed successfully.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/account?section=orders" className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white">
            View my orders
          </Link>
          <Link href="/products" className="inline-flex h-11 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
            Continue shopping
          </Link>
        </div>
      </section>
    );
  }

  if (cartIsResolving) {
    return (
      <section className="space-y-5">
        <div className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Checkout</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Loading your cart</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
            We&apos;re pulling in your latest cart items, delivery options, and totals before checkout.
          </p>
        </div>
        <div className="space-y-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
              <div className="h-4 w-28 animate-pulse rounded bg-[#ece8df]" />
              <div className="mt-4 h-16 animate-pulse rounded-[8px] bg-[#eef1f4]" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (cartIsEmpty) {
    return (
      <section className="space-y-5">
        <div className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Checkout</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Your cart is empty</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
            Add a few products before heading to checkout.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/products" className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#202020] px-5 text-[13px] font-semibold text-white">
              Continue shopping
            </Link>
            <Link href="/cart" className="inline-flex h-11 items-center justify-center rounded-[8px] border border-black/10 bg-white px-5 text-[13px] font-semibold text-[#202020]">
              View cart
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const checkoutCtaDisabled = submitting || stripeLoading || !cart?.items?.length;
  const checkoutIsProcessing = submitting || stripeLoading;
  const checkoutCtaLabel = submitting ? "Processing secure payment..." : `Place order • ${formatMoney(payableIncl)}`;
  const hasSavedAddresses = locations.length > 0;
  const addressMode = showAddAddress || !hasSavedAddresses ? "new" : "saved";
  const addressFieldCopy = getAddressFieldCopy(addressDraft.country);

  return (
    <>
      <style jsx global>{`
        @keyframes piessang-card-in-next {
          0% {
            transform: translateX(32%) scale(0.78);
            opacity: 0.55;
            filter: blur(2px);
          }
          100% {
            transform: translateX(0) scale(1);
            opacity: 1;
            filter: blur(0);
          }
        }
        @keyframes piessang-card-in-prev {
          0% {
            transform: translateX(-32%) scale(0.78);
            opacity: 0.55;
            filter: blur(2px);
          }
          100% {
            transform: translateX(0) scale(1);
            opacity: 1;
            filter: blur(0);
          }
        }
        @keyframes piessang-card-out-next {
          0% {
            transform: translateX(0) scale(1);
            opacity: 1;
            filter: blur(0);
          }
          100% {
            transform: translateX(-32%) scale(0.78);
            opacity: 0.18;
            filter: blur(2px);
          }
        }
        @keyframes piessang-card-out-prev {
          0% {
            transform: translateX(0) scale(1);
            opacity: 1;
            filter: blur(0);
          }
          100% {
            transform: translateX(32%) scale(0.78);
            opacity: 0.18;
            filter: blur(2px);
          }
        }
        @keyframes piessang-checkout-progress {
          0% {
            background-position: 0% 50%;
            transform: translateX(-6%);
          }
          100% {
            background-position: 100% 50%;
            transform: translateX(6%);
          }
        }
      `}</style>
    <section className="space-y-5 pb-28 lg:pb-0">
      <div className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <div className="mb-4">
          <Image
            src="/logo/Piessang Logo Full - Clipped.png"
            alt="Piessang"
            width={154}
            height={36}
            priority
            className="h-7 w-auto sm:h-8"
          />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Checkout</p>
        <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Final step</h1>
        <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
          Secure your order, confirm the delivery details, and finish payment with confidence.
        </p>
      </div>

      <div className="rounded-[8px] border border-[#b7e4c7] bg-[#effaf3] px-5 py-4 text-[14px] text-[#1f6b43] shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d9f3e3] text-[#198754]"
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 10V7a4 4 0 1 1 8 0v3" />
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="m9.5 15 1.7 1.7L15 13" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-[#165c39]">Stock reserved for checkout</p>
            <p className="mt-0.5 leading-[1.5] text-[#2f7a54]">
              Your items are being held for a short time while you complete payment.
            </p>
          </div>
        </div>
      </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_380px]">
          <div className="space-y-5">
            <section ref={contactSectionRef} className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-[18px] font-semibold text-[#202020]">Delivery contact details</h2>
                  <p className="mt-1 max-w-[34ch] text-[12px] leading-[1.6] text-[#57636c]">
                    Add the name and phone number the seller or driver should use for this order.
                  </p>
                </div>
                {!isAuthenticated ? (
                  <button
                    type="button"
                    onClick={() => openAuthModal("Sign in or create an account for faster checkout next time.")}
                    className="self-start whitespace-normal text-left text-[13px] font-medium leading-[1.5] text-[#57636c] underline decoration-black/20 underline-offset-2 transition hover:text-[#202020] sm:self-auto sm:text-right"
                  >
                    Already have an account? <span className="font-semibold text-[#202020]">Log in</span>
                  </button>
                ) : null}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Recipient name<RequiredMark /></label>
                  <input
                    ref={recipientNameInputRef}
                    value={contactDraft.recipientName}
                    onChange={(event) => setContactDraft((current) => ({ ...current, recipientName: event.target.value }))}
                    className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                    placeholder="Who should receive or collect this order?"
                  />
                </div>
                {!isAuthenticated ? (
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Email address<RequiredMark /></label>
                    <input
                      ref={emailInputRef}
                      type="email"
                      value={contactDraft.email}
                      onChange={(event) =>
                        setContactDraft((current) => ({ ...current, email: sanitizeEmailInput(event.target.value) }))
                      }
                      className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      placeholder="Where should we send your order updates?"
                      autoComplete="email"
                      inputMode="email"
                      spellCheck={false}
                      autoCapitalize="none"
                    />
                  </div>
                ) : null}
                <div ref={phoneFieldRef}>
                  <PhoneInput
                    label="Mobile number *"
                    countryCode={contactDraft.phoneCountryCode}
                    localNumber={contactDraft.phoneNumber}
                    onCountryCodeChange={(value) => setContactDraft((current) => ({ ...current, phoneCountryCode: value }))}
                    onLocalNumberChange={(value) => setContactDraft((current) => ({ ...current, phoneNumber: value }))}
                    hint="We’ll use this for delivery and order updates."
                  />
                </div>
              </div>
            </section>

            <section ref={addressSectionRef} className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[18px] font-semibold text-[#202020]">Delivery address{!selectedLocation ? <RequiredMark /> : null}</h2>
                  <p className="mt-1 text-[12px] text-[#57636c]">
                    Where should we deliver your order?
                  </p>
                </div>
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={() => setAddressesModalOpen(true)}
                    className="text-[12px] font-semibold text-[#907d4c]"
                  >
                    Manage addresses
                  </button>
                ) : null}
              </div>
              <div className="mt-4 inline-flex rounded-[10px] bg-[#f6f3eb] p-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!hasSavedAddresses) return;
                    setShowAddAddress(false);
                  }}
                  disabled={!hasSavedAddresses}
                  className={
                    addressMode === "saved"
                      ? "inline-flex h-10 items-center justify-center rounded-[8px] bg-white px-4 text-[12px] font-semibold text-[#202020] shadow-[0_4px_10px_rgba(20,24,27,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                      : "inline-flex h-10 items-center justify-center rounded-[8px] px-4 text-[12px] font-semibold text-[#7a7a7a] disabled:cursor-not-allowed disabled:opacity-50"
                  }
                >
                  Use saved address
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddAddress(true)}
                  className={
                    addressMode === "new"
                      ? "inline-flex h-10 items-center justify-center rounded-[8px] bg-white px-4 text-[12px] font-semibold text-[#202020] shadow-[0_4px_10px_rgba(20,24,27,0.08)]"
                      : "inline-flex h-10 items-center justify-center rounded-[8px] px-4 text-[12px] font-semibold text-[#7a7a7a]"
                  }
                >
                  Add new address
                </button>
              </div>
              {checkoutBlocked ? (
                <div className="mt-4 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
                  {deliveryBlocked
                    ? "One or more seller groups do not ship to this address. Remove the affected seller items or choose a different delivery address before continuing."
                    : "One or more items in your cart are now out of stock. Remove them from your cart before continuing."}
                </div>
              ) : null}
              {addressMode === "saved" && hasSavedAddresses ? (
                <div className="mt-4 space-y-3">
                  {locations.map((location, index) => (
                    <button
                      key={`${location.label || "address"}-${index}`}
                      type="button"
                      onClick={() => setSelectedLocationIndex(index)}
                      className={
                        index === selectedLocationIndex
                          ? "w-full rounded-[8px] border border-[rgba(203,178,107,0.7)] bg-[rgba(203,178,107,0.08)] p-4 text-left"
                          : "w-full rounded-[8px] border border-black/10 bg-white p-4 text-left"
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[14px] font-semibold text-[#202020]">{resolveLocationTitle(location, index)}</p>
                          <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">{formatAddress(location)}</p>
                          {location?.phoneNumber ? <p className="mt-2 text-[12px] font-medium text-[#202020]">{location.phoneNumber}</p> : null}
                        </div>
                        {location?.is_default ? (
                          <span className="rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">
                            Default
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowAddAddress(true)}
                    className="w-full rounded-[8px] border border-dashed border-[rgba(66,133,244,0.28)] bg-[rgba(66,133,244,0.04)] px-4 py-4 text-left text-[13px] font-semibold text-[#1a56c6] transition hover:border-[rgba(66,133,244,0.42)] hover:bg-[rgba(66,133,244,0.08)]"
                  >
                    + Add new address
                  </button>
                </div>
              ) : addressMode === "saved" ? (
                <div className="mt-4 rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-4 text-[13px] text-[#57636c]">
                  You do not have a saved delivery address yet.
                </div>
              ) : (
                <div className="mt-4 rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setAddressPickerOpen(true)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[rgba(66,133,244,0.28)] bg-[linear-gradient(135deg,rgba(66,133,244,0.12)_0%,rgba(52,168,83,0.08)_100%)] px-4 text-[12px] font-semibold text-[#1a56c6] shadow-[0_8px_18px_rgba(66,133,244,0.12)] transition hover:border-[rgba(66,133,244,0.42)] hover:bg-[linear-gradient(135deg,rgba(66,133,244,0.16)_0%,rgba(52,168,83,0.12)_100%)]"
                      >
                        <span
                          aria-hidden="true"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#4285f4] shadow-[0_4px_10px_rgba(66,133,244,0.18)]"
                        >
                          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.9]">
                            <path d="M10 17s5-4.6 5-9a5 5 0 1 0-10 0c0 4.4 5 9 5 9Z" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="10" cy="8" r="1.8" />
                          </svg>
                        </span>
                        <span className="flex flex-col items-start leading-[1.1]">
                          <span>Find with Google Maps</span>
                          <span className="text-[10px] font-medium text-[#4d7fe0]">Auto-fill your delivery address</span>
                        </span>
                      </button>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Address name<RequiredMark /></label>
                      <input
                        ref={addressNameInputRef}
                        value={addressDraft.locationName}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, locationName: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder="Home, Work, Office"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.addressLine1Label}<RequiredMark /></label>
                      <input
                        ref={streetAddressInputRef}
                        value={addressDraft.streetAddress}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, streetAddress: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder={addressFieldCopy.addressLine1Placeholder}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.addressLine2Label}</label>
                      <input
                        value={addressDraft.addressLine2}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, addressLine2: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder={addressFieldCopy.addressLine2Placeholder}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.suburbLabel}<RequiredMark /></label>
                      <input
                        value={addressDraft.suburb}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, suburb: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder={addressFieldCopy.suburbPlaceholder}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.cityLabel}<RequiredMark /></label>
                      <input
                        value={addressDraft.city}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, city: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder={addressFieldCopy.cityPlaceholder}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.regionLabel}<RequiredMark /></label>
                      <input
                        value={addressDraft.stateProvinceRegion}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, stateProvinceRegion: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder={addressFieldCopy.regionPlaceholder}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.postalLabel}<RequiredMark /></label>
                      <input
                        value={addressDraft.postalCode}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, postalCode: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder={addressFieldCopy.postalPlaceholder}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.countryLabel}<RequiredMark /></label>
                      <select
                        value={addressDraft.country}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, country: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      >
                        <option value="">{addressFieldCopy.countryPlaceholder}</option>
                        {countryOptions.map((option) => (
                          <option key={option.iso} value={option.name}>
                            {`${option.flag} ${option.name}`.trim()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2 rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-3 text-[12px] text-[#57636c]">
                      {addressDraft.latitude && addressDraft.longitude
                        ? `Pinned location: ${addressDraft.latitude}, ${addressDraft.longitude}`
                        : "No map pin selected yet. Use the map search above for more accurate delivery matching."}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Delivery notes</label>
                      <input
                        value={addressDraft.instructions}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, instructions: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder="Anything the driver should know?"
                      />
                    </div>
                  </div>
                  {isAuthenticated ? (
                    <label className="mt-3 inline-flex items-center gap-2 text-[12px] text-[#57636c]">
                      <input
                        type="checkbox"
                        checked={addressDraft.is_default}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, is_default: event.target.checked }))}
                        className="h-4 w-4 rounded border-black/20"
                      />
                      Set this as my default delivery address
                    </label>
                  ) : null}
                </div>
              )}
            </section>

            <section ref={paymentSectionRef} className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[18px] font-semibold text-[#202020]">Payment method{!canUseSavedCard ? <RequiredMark /> : null}</h2>
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={() => setCardsModalOpen(true)}
                    className="text-[12px] font-semibold text-[#907d4c]"
                  >
                    Manage cards
                  </button>
                ) : (
                  <span className="text-[12px] font-semibold text-[#7a8594]">Guest payment</span>
                )}
              </div>
              <div className="mt-4 inline-flex rounded-[8px] bg-[#f6f3eb] p-1">
                <button
                  type="button"
                  onClick={() => setPaymentMode("saved")}
                  disabled={!cards.length}
                  className={
                    paymentMode === "saved"
                      ? "rounded-[8px] bg-white px-3 py-2 text-[12px] font-semibold text-[#202020] shadow-[0_4px_10px_rgba(20,24,27,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                      : "rounded-[8px] px-3 py-2 text-[12px] font-semibold text-[#7a7a7a] disabled:cursor-not-allowed disabled:opacity-50"
                  }
                >
                  Saved card
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode("new")}
                  className={
                    paymentMode === "new"
                      ? "rounded-[8px] bg-white px-3 py-2 text-[12px] font-semibold text-[#202020] shadow-[0_4px_10px_rgba(20,24,27,0.08)]"
                      : "rounded-[8px] px-3 py-2 text-[12px] font-semibold text-[#7a7a7a]"
                  }
                >
                  New card
                </button>
              </div>

              {paymentMode === "saved" && cards.length ? (
                <div className="mt-4 space-y-3">
                  <div className="select-none">
                    <div className="relative mx-auto w-full max-w-[760px]">
                      <div className="relative mx-auto aspect-[1.42/1] w-full max-w-[680px] overflow-hidden rounded-[22px] sm:aspect-[1.92/1] sm:rounded-[30px]">
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(151,114,255,0.14),rgba(255,255,255,0)_62%)]" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-full overflow-hidden px-2 sm:px-0" ref={emblaRef}>
                            <div className="flex items-center">
                              {cards.map((card, index) => {
                                const cardId = String(card?.id || "");
                                const isSelected = cardId === selectedCardId;
                                return (
                                  <div
                                    key={cardId || index}
                                    className="min-w-0 flex-[0_0_84%] px-2 sm:flex-[0_0_56%] sm:px-4"
                                    style={{ perspective: "1400px" }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => emblaApi?.scrollTo(index)}
                                      aria-label={formatCard(card)}
                                      className="relative block aspect-[1.586/1] w-full overflow-hidden rounded-[18px] text-left sm:rounded-[22px]"
                                    >
                                      <div
                                        data-card-shell
                                        className="h-full w-full will-change-transform transition-[transform,opacity,filter,box-shadow] duration-200 ease-out"
                                      >
                                        <PremiumCardFace
                                          brand={String(card?.brand || "Piessang").toUpperCase()}
                                          cardholder={String(profile?.accountName || profile?.displayName || "Piessang shopper").trim() || "Piessang shopper"}
                                          number={maskPreviewNumber(card?.last4)}
                                          expiry={formatPreviewExpiry(card?.expiryMonth, card?.expiryYear)}
                                          themeKey={card?.themeKey || `${String(card?.id || "")}:${String(card?.brand || "Piessang").toUpperCase()}:${card?.last4 || ""}`}
                                          compact={!isSelected}
                                          selected={isSelected}
                                        />
                                      </div>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                      {cards.length > 1 ? (
                        <>
                          <button
                            type="button"
                            onClick={() => rotateSavedCard(-1)}
                            className="absolute left-[6px] top-1/2 z-40 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/18 bg-black/18 text-white shadow-[0_14px_28px_rgba(20,24,27,0.2)] backdrop-blur-md transition-all duration-300 ease-out hover:scale-[1.05] hover:bg-black/24 active:scale-[0.96] sm:left-[11%] sm:h-11 sm:w-11"
                            aria-label="Show previous saved card"
                          >
                            <span className="text-[20px] leading-none sm:text-[22px]">‹</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => rotateSavedCard(1)}
                            className="absolute right-[6px] top-1/2 z-40 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/18 bg-black/18 text-white shadow-[0_14px_28px_rgba(20,24,27,0.2)] backdrop-blur-md transition-all duration-300 ease-out hover:scale-[1.05] hover:bg-black/24 active:scale-[0.96] sm:right-[11%] sm:h-11 sm:w-11"
                            aria-label="Show next saved card"
                          >
                            <span className="text-[20px] leading-none sm:text-[22px]">›</span>
                          </button>
                        </>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-col gap-3 sm:mt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[12px] font-semibold text-[#202020]">{selectedCard ? formatCard(selectedCard) : "Saved card"}</p>
                        <p className="mt-1 text-[12px] text-[#57636c]">
                          {cards.length > 1 ? "Swipe or tap the stack to choose a different saved card." : "Saved for faster checkout."}
                        </p>
                      </div>
                      {cards.length > 1 ? (
                        <div className="flex items-center justify-between gap-3 sm:justify-start">
                          <span className="text-[11px] font-medium text-[#57636c]">Swipe or use arrows</span>
                          <div className="inline-flex items-center gap-1.5">
                            {cards.slice(0, Math.min(cards.length, 6)).map((card, index) => (
                              <span
                                key={`${String(card?.id || "")}-${index}`}
                                className={
                                  String(card?.id || "") === selectedCardId
                                    ? "h-2.5 w-6 rounded-full bg-[#202020]"
                                    : "h-2.5 w-2.5 rounded-full bg-black/15"
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : paymentMode === "saved" ? (
                <div className="mt-4 rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-4 text-[13px] text-[#57636c]">
                  You do not have a saved card yet. Add one before completing checkout.
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className={`sm:col-span-2 rounded-[22px] p-4 sm:p-5 ${previewCardTheme.frameClass}`}>
                    <div className="mx-auto w-full max-w-[430px]">
                      <div className="relative aspect-[1.586/1] w-full">
                        <PremiumCardFace
                          brand={previewCardBrand}
                          cardholder={previewCardholder}
                          number={previewCardNumber}
                          expiry={previewCardExpiry}
                          themeKey={previewCardThemeKey}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Card holder<RequiredMark /></label>
                    <input
                      ref={cardHolderInputRef}
                      value={newCard.holder}
                      onChange={(event) => setNewCard((current) => ({ ...current, holder: event.target.value }))}
                      onBlur={() => setCardTouched((current) => ({ ...current, holder: true }))}
                      className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      placeholder="Name on card"
                    />
                    {cardTouched.holder && cardErrors.holder ? <p className="mt-2 text-[12px] text-[#b91c1c]">{cardErrors.holder}</p> : null}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Card number<RequiredMark /></label>
                    <div className="mt-2 flex h-11 w-full items-center rounded-[10px] border border-black/10 bg-white px-3">
                      <div id="piessang-card-number" className="w-full" />
                    </div>
                    <p className="mt-2 text-[12px] text-[#7a7a7a]">Securely captured by Stripe inside Piessang</p>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Expiry<RequiredMark /></label>
                    <div className="mt-2 flex h-11 w-full items-center rounded-[10px] border border-black/10 bg-white px-3">
                      <div id="piessang-card-expiry" className="w-full" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">CVV<RequiredMark /></label>
                    <div className="mt-2 flex h-11 w-full items-center rounded-[10px] border border-black/10 bg-white px-3">
                      <div id="piessang-card-cvc" className="w-full" />
                    </div>
                  </div>
                  <label className="sm:col-span-2 mt-1 inline-flex items-center gap-2 text-[12px] text-[#57636c]">
                    <input
                      type="checkbox"
                      checked={newCard.saveCard}
                      onChange={(event) => setNewCard((current) => ({ ...current, saveCard: event.target.checked }))}
                      className="h-4 w-4 rounded border-black/20"
                    />
                    Save this card for faster checkout next time
                  </label>
                  {stripeCheckout ? (
                    <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-[8px] border border-[rgba(203,178,107,0.35)] bg-[rgba(203,178,107,0.08)] px-4 py-3 text-[12px] text-[#6b5b34]">
                      <span>{stripeLoading ? "Loading secure card fields..." : "Secure payment is ready. Complete the payment below."}</span>
                      <button
                        type="button"
                        onClick={() => void cancelEmbeddedStripeCheckout()}
                        className="font-semibold text-[#202020]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
              <h2 className="text-[18px] font-semibold text-[#202020]">Items in your order</h2>
              <div className="mt-4 space-y-3">
                {sellerGroups.map((group) => (
                  <div key={group.seller} className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
                    {(() => {
                      const summary = sellerDeliverySummaries.find((entry) => entry.sellerKey === group.sellerKey)?.summary;
                      const sellerBlockedByDelivery = hasSelectedDeliveryAddress && summary?.isUnavailable === true;
                      const failureReasons = Array.isArray(summary?.reasons) ? summary.reasons : [];
                      return sellerBlockedByDelivery ? (
                        <div className="mb-4 rounded-[10px] border border-[#fecaca] bg-[#fff1f2] px-4 py-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#b91c1c]">Shipping unavailable</p>
                              <p className="mt-2 text-[14px] font-semibold text-[#7f1d1d]">
                                {group.seller} does not ship these items to your selected address right now.
                              </p>
                              <p className="mt-1 text-[13px] leading-[1.6] text-[#991b1b]">
                                Change your delivery address or remove this seller&apos;s items to continue.
                              </p>
                              {failureReasons.length ? (
                                <div className="mt-3 space-y-1">
                                  {failureReasons.map((reason: string, reasonIndex: number) => (
                                    <p key={`${group.sellerKey}-reason-${reasonIndex}`} className="text-[12px] leading-[1.5] text-[#991b1b]">
                                      {reason}
                                    </p>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => void removeSellerGroupItems(group.items, group.seller)}
                              disabled={submitting}
                              className="inline-flex h-10 shrink-0 items-center justify-center rounded-[8px] border border-[#ef4444]/20 bg-white px-4 text-[12px] font-semibold text-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {submitting ? "Updating..." : "Remove seller items"}
                            </button>
                          </div>
                        </div>
                      ) : null;
                    })()}
                    <div className="border-b border-black/5 pb-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Sold by</p>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[16px] font-semibold text-[#202020]">{group.seller}</p>
                        <div className="text-right">
                          <p className="text-[12px] text-[#57636c]">{getSellerFulfillmentSummary(group.items)}</p>
                          {(() => {
                            const summaryLabel = String(
                              sellerDeliverySummaries.find((entry) => entry.sellerKey === group.sellerKey)?.summary?.label || "",
                            ).trim();
                            return summaryLabel ? (
                            <p className="mt-1 text-[12px] font-semibold text-[#202020]">
                              {summaryLabel}
                            </p>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-3">
                      {group.items.map((item, index) => (
                        <div key={`${item?.product_snapshot?.product?.title || "item"}-${index}`} className="rounded-[10px] border border-black/5 bg-white p-3 sm:p-4">
                          <div className="space-y-3 sm:flex sm:items-start sm:justify-between sm:gap-3 sm:space-y-0">
                            <div className="flex items-start gap-3">
                              <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[10px] border border-black/5 bg-[#fafafa] sm:h-16 sm:w-16 sm:rounded-[8px]">
                                <BlurhashImage
                                  src={
                                    item?.selected_variant_snapshot?.media?.images?.[0]?.imageUrl ||
                                    item?.product_snapshot?.media?.images?.[0]?.imageUrl ||
                                    null
                                  }
                                  blurHash={
                                    item?.selected_variant_snapshot?.media?.images?.[0]?.blurHashUrl ||
                                    item?.product_snapshot?.media?.images?.[0]?.blurHashUrl ||
                                    null
                                  }
                                  alt={item?.product_snapshot?.product?.title || "Product"}
                                  sizes="(max-width: 640px) 72px, 64px"
                                  className="h-full w-full"
                                  imageClassName="object-cover"
                                />
                              </div>
                              <div className="min-w-0 space-y-1">
                                <p
                                  className="text-[14px] font-semibold leading-[1.45] text-[#202020] sm:text-[14px]"
                                  style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                  }}
                                >
                                  {item?.product_snapshot?.product?.title || "Product"}
                                </p>
                                <p className="text-[12px] leading-[1.5] text-[#57636c]">
                                  {item?.selected_variant_snapshot?.label || "Selected variant"}
                                </p>
                                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#7b8690] sm:hidden">
                                  Qty {Math.max(0, Number(item?.qty ?? item?.quantity ?? 0))}
                                </p>
                                <p className="text-[18px] font-semibold leading-none text-[#202020] sm:hidden">
                                  {formatMoney(item?.line_totals?.final_incl || 0)}
                                </p>
                              </div>
                            </div>
                            <div className="hidden min-w-[68px] flex-col items-end justify-start gap-1 text-right sm:flex">
                              <p className="text-[12px] text-[#57636c]">
                                Qty {Math.max(0, Number(item?.qty ?? item?.quantity ?? 0))}
                              </p>
                              <p className="mt-1 text-[14px] font-semibold text-[#202020]">
                                {formatMoney(item?.line_totals?.final_incl || 0)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)] lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-[14px] bg-[linear-gradient(145deg,#202020_0%,#2c333a_60%,#3d4650_100%)] p-5 text-white shadow-[0_16px_40px_rgba(20,24,27,0.18)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/72">Order summary</p>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[12px] text-white/72">Amount to pay</p>
                  <p className="mt-1 text-[32px] font-semibold tracking-[-0.04em] text-white">{formatMoney(payableIncl)}</p>
                </div>
                <div className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/88">
                  {getItemCount(cart)} item{getItemCount(cart) === 1 ? "" : "s"}
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-[12px] text-white/78">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[2]">
                      <path d="M10 2.5 4.5 5v4.3c0 3.1 2.2 6 5.5 7.2 3.3-1.2 5.5-4.1 5.5-7.2V5L10 2.5Z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="m7.7 9.9 1.6 1.6 3-3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span>Secure checkout via Stripe</span>
                </div>
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[2]">
                      <path d="M3 10h14" strokeLinecap="round" />
                      <path d="M10 3v14" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span>Delivery updates sent after purchase</span>
                </div>
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[2]">
                      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v4A2.5 2.5 0 0 1 13.5 13h-4l-3 3V6.5Z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span>Support is available if anything changes</span>
                </div>
              </div>
            </div>

            {selectedLocation ? (
              <div className="mt-5 rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Delivering to</p>
                <p className="mt-2 text-[14px] font-semibold text-[#202020]">
                  {contactDraft.recipientName || resolveLocationTitle(selectedLocation, selectedLocationIndex)}
                </p>
                <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">{formatAddress(selectedLocation)}</p>
                {contactDraft.phoneNumber ? (
                  <p className="mt-2 text-[12px] font-semibold text-[#202020]">
                    {combinePhoneNumber(contactDraft.phoneCountryCode, contactDraft.phoneNumber)}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-5 space-y-3 text-[13px] text-[#57636c]">
              <div className="flex items-center justify-between gap-3">
                <span>Items</span>
                <span className="font-semibold text-[#202020]">{getItemCount(cart)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Products total</span>
                <span className="font-semibold text-[#202020]">{formatMoney(productsTotalIncl)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Shipping base total</span>
                <span className="font-semibold text-[#202020]">
                  {shippingPreviewLoading ? "Calculating..." : formatMoney(canonicalShippingBaseTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Shipping total</span>
                <span className="font-semibold text-[#202020]">
                  {shippingPreviewLoading ? "Calculating..." : formatMoney(canonicalShippingFinalTotal)}
                </span>
              </div>
              {sellerDeliverySummaries.length ? (
                <div className="rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#907d4c]">Seller shipping</p>
                  <div className="mt-2 space-y-2">
                    {sellerDeliverySummaries.map((entry) => (
                      <div key={entry.sellerKey || entry.seller} className="rounded-[8px] border border-black/5 bg-white px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <span>{entry.seller}</span>
                          <span className={`text-right font-semibold ${entry.summary?.isUnavailable ? "text-[#991b1b]" : "text-[#202020]"}`}>
                            {entry.summary?.label}
                          </span>
                        </div>
                        {entry.summary?.isUnavailable ? (
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <p className="text-[12px] leading-[1.5] text-[#991b1b]">
                              {entry.summary?.reasons?.[0] || "Change your address or remove this seller's items to continue."}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                const group = sellerGroups.find((candidate) => candidate.sellerKey === entry.sellerKey);
                                if (group) void removeSellerGroupItems(group.items, group.seller);
                              }}
                              disabled={submitting}
                              className="shrink-0 text-[12px] font-semibold text-[#b91c1c] disabled:opacity-50"
                            >
                              Remove items
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 border-t border-black/5 pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-semibold text-[#202020]">Amount to pay</span>
                <span className="text-[22px] font-semibold text-[#202020]">{formatMoney(payableIncl)}</span>
              </div>
            </div>

            {deliveryBlocked ? (
              <div className="mt-4 rounded-[10px] border border-[#fecaca] bg-[#fff1f2] px-4 py-4 text-[13px] text-[#991b1b]">
                <p className="font-semibold text-[#7f1d1d]">Checkout is blocked for this address.</p>
                <p className="mt-2 leading-[1.6]">
                  One or more seller groups do not ship to your selected address. Remove the affected seller items or change your address before placing your order.
                </p>
                <div className="mt-3 space-y-2">
                  {sellerGroups
                    .filter((group) => blockedSellerKeys.has(group.sellerKey))
                    .map((group, index) => {
                      const localSummary = sellerDeliverySummaries.find((entry) => entry.sellerKey === group.sellerKey)?.summary;
                      return (
                        <div key={`${group.sellerKey || group.seller}-${index}`} className="rounded-[8px] border border-[#fecaca] bg-white px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <span className="font-medium text-[#7f1d1d]">{group.seller || "Seller"}</span>
                            <span className="text-right font-semibold text-[#991b1b]">
                              {localSummary?.label || "Shipping unavailable for this address"}
                            </span>
                          </div>
                          {localSummary?.reasons?.length ? (
                            <div className="mt-2 space-y-1">
                              {localSummary.reasons.map((reason: string, reasonIndex: number) => (
                                <p key={`${group.sellerKey}-blocked-reason-${reasonIndex}`} className="text-[12px] leading-[1.5] text-[#991b1b]">
                                  {reason}
                                </p>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => void removeSellerGroupItems(group.items, group.seller)}
                              disabled={submitting}
                              className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[#ef4444]/20 bg-white px-4 text-[12px] font-semibold text-[#b91c1c] disabled:opacity-50"
                            >
                              {submitting ? "Updating..." : "Remove seller items"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : deliveryBlockError ? (
              <div className="mt-4 rounded-[10px] border border-[rgba(185,28,28,0.18)] bg-[rgba(185,28,28,0.05)] px-4 py-4 text-[#7f1d1d]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#b91c1c]">
                  {deliveryBlockError.title}
                </p>
                <p className="mt-2 text-[12px] leading-[1.5] text-[#991b1b]">
                  {deliveryBlockError.message}
                </p>
                {deliveryBlockError.sellers.length ? (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold text-[#7f1d1d]">Affected sellers</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {deliveryBlockError.sellers.map((seller) => (
                        <span
                          key={seller}
                          className="rounded-full border border-[rgba(185,28,28,0.16)] bg-white px-3 py-1 text-[11px] font-semibold text-[#991b1b]"
                        >
                          {seller}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {deliveryBlockError.reasons.length ? (
                  <div className="mt-3 space-y-1.5">
                    {Array.from(new Set(deliveryBlockError.reasons)).map((reason) => (
                      <p key={reason} className="text-[11px] leading-[1.45] text-[#7f1d1d]">
                        {reason}
                      </p>
                    ))}
                  </div>
                ) : null}
                <p className="mt-3 text-[11px] leading-[1.45] text-[#7f1d1d]">
                  Change the delivery address or remove that seller’s items before trying again.
                </p>
              </div>
            ) : errorMessage ? (
              <div className="mt-4 rounded-[8px] border border-[rgba(185,28,28,0.16)] bg-[rgba(185,28,28,0.05)] px-4 py-3 text-[12px] text-[#b91c1c]">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-5 rounded-[12px] border border-[#d8eadf] bg-[#f4fbf6] px-4 py-4 text-[#24543b]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#198754]">Ready to complete</p>
              <div className="mt-3 space-y-2 text-[12px] leading-[1.6] text-[#3a5d49]">
                <div className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-[2px] inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#d9f3e3] text-[#198754]">
                    <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current stroke-[2.2]">
                      <path d="m3.5 8.3 2.4 2.4 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span>Your payment is encrypted and handled securely.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-[2px] inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#d9f3e3] text-[#198754]">
                    <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current stroke-[2.2]">
                      <path d="m3.5 8.3 2.4 2.4 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span>We’ll email your receipt and order updates right away.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-[2px] inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#d9f3e3] text-[#198754]">
                    <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current stroke-[2.2]">
                      <path d="m3.5 8.3 2.4 2.4 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span>Your reserved stock stays held while you finish checkout.</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleCheckout()}
              disabled={checkoutCtaDisabled}
              className="relative mt-5 hidden h-12 w-full items-center justify-center overflow-hidden rounded-[8px] border border-[#b89335] bg-[#c9a64b] px-4 text-[13px] font-semibold text-[#201a12] shadow-[0_12px_24px_rgba(201,166,75,0.22)] transition hover:bg-[#b89335] disabled:cursor-not-allowed disabled:opacity-50 lg:inline-flex"
            >
              {checkoutIsProcessing ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[8px] opacity-[0.22]"
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.02) 18%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.02) 82%, rgba(255,255,255,0.18) 100%), url('/backgrounds/piessang-repeat-background.png')",
                    backgroundSize: "220% 100%, 340px auto",
                    backgroundRepeat: "no-repeat, repeat",
                    animation: "piessang-checkout-progress 1.9s linear infinite",
                  }}
                />
              ) : null}
              <span className="relative z-[1]">{checkoutCtaLabel}</span>
            </button>

            <Link href="/cart" className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]">
              Back to cart
            </Link>
          </aside>
        </div>
    </section>
    <div className="fixed inset-x-0 bottom-0 z-[95] border-t border-black/10 bg-white/95 px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(20,24,27,0.12)] backdrop-blur lg:hidden">
      <div className="mx-auto max-w-[640px]">
        {mobileStickyFulfillmentLabel ? (
          <p className="mb-3 text-[12px] font-medium text-[#57636c]">{mobileStickyFulfillmentLabel}</p>
        ) : null}
        <button
          type="button"
          onClick={() => void handleCheckout()}
          disabled={checkoutCtaDisabled}
          className="relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-[8px] border border-[#b89335] bg-[#c9a64b] px-5 text-[13px] font-semibold text-[#201a12] shadow-[0_12px_24px_rgba(201,166,75,0.22)] transition hover:bg-[#b89335] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checkoutIsProcessing ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[8px] opacity-[0.22]"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.02) 18%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.02) 82%, rgba(255,255,255,0.18) 100%), url('/backgrounds/piessang-repeat-background.png')",
                backgroundSize: "220% 100%, 340px auto",
                backgroundRepeat: "no-repeat, repeat",
                animation: "piessang-checkout-progress 1.9s linear infinite",
              }}
            />
          ) : null}
          <span className="relative z-[1]">{submitting ? "Processing..." : `Place order • ${formatMoney(payableIncl)}`}</span>
        </button>
      </div>
    </div>
    {paymentOverlay.open ? (
      <div className="fixed inset-0 z-[180] flex items-center justify-center bg-[rgba(20,24,27,0.55)] px-4 py-6" role="dialog" aria-modal="true">
        <div className="w-full max-w-[560px] overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_24px_80px_rgba(20,24,27,0.24)]">
          <div className="relative overflow-hidden bg-[linear-gradient(135deg,#202020_0%,#2d3743_52%,#d5aa22_160%)] px-6 py-6 text-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 2px, transparent 2px, transparent 22px)",
              }}
            />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-white/14 bg-white/10 shadow-[0_10px_24px_rgba(20,24,27,0.18)] backdrop-blur-sm">
                  <Image
                    src="/logo/piessang-icon-only.png"
                    alt="Piessang"
                    fill
                    sizes="44px"
                    className="object-contain p-2"
                  />
                </div>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/85">
                  Secure checkout
                </span>
              </div>
              <div
                className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${
                  paymentOverlay.tone === "success" ? "bg-white text-[#15803d]" : "bg-white/12 text-white"
                }`}
              >
                {paymentOverlay.tone === "success" ? (
                  <svg viewBox="0 0 20 20" className="h-6 w-6 fill-none stroke-current stroke-[2.2]">
                    <path d="M4 10.5l3.5 3.5L16 5.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-6 w-6 animate-spin fill-none stroke-current stroke-[2]">
                    <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <div className="relative mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/68">
                {paymentOverlay.tone === "success" ? "Piessang payment complete" : "Piessang payment in progress"}
              </p>
              <h3 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-white">{paymentOverlay.title}</h3>
              <p className="mt-3 max-w-[46ch] text-[14px] leading-[1.7] text-white/82">{paymentOverlay.message}</p>
            </div>
          </div>
          <div className="px-6 py-6">
            {paymentOverlay.detail ? (
              <div className="rounded-[16px] border border-black/6 bg-[#f7f7f8] px-4 py-4 text-[13px] leading-[1.7] text-[#57636c]">
                {paymentOverlay.detail}
              </div>
            ) : null}
            <div className="mt-4 flex justify-center sm:justify-start">
              <div className="relative h-[56px] w-[220px] overflow-hidden rounded-[12px] border border-black/6 bg-white px-2 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
                <Image
                  src="/badges/Stripe Secure Checkout Badge.png"
                  alt="Stripe Secure Checkout"
                  fill
                  sizes="220px"
                  className="object-contain p-2"
                />
              </div>
            </div>
            {paymentOverlay.tone !== "success" ? (
              <div className="mt-4 rounded-[16px] border border-black/6 bg-white px-4 py-4 text-[12px] leading-[1.7] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.05)]">
                If your bank requires 3D Secure, Stripe may open an authentication step. Do not close this page while your payment is being confirmed.
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[12px] text-[#57636c]">Automatic redirect in about 5 seconds.</p>
                <button
                  type="button"
                  onClick={() => {
                    if (!successRedirectHref) return;
                    router.replace(successRedirectHref);
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
                >
                  Continue to success page
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null}
    <AppSnackbar notice={snackbarMessage ? { tone: "info", message: snackbarMessage } : null} />
    <GooglePlacePickerModal
      open={addressPickerOpen}
      title="Choose your delivery address"
      initialValue={{
        country: addressDraft.country,
        region: addressDraft.stateProvinceRegion,
        city: addressDraft.city,
        suburb: addressDraft.suburb,
        postalCode: addressDraft.postalCode,
        latitude: Number.isFinite(Number(addressDraft.latitude)) ? Number(addressDraft.latitude) : null,
        longitude: Number.isFinite(Number(addressDraft.longitude)) ? Number(addressDraft.longitude) : null,
      }}
      onClose={() => setAddressPickerOpen(false)}
      onSelect={(value) => {
        setAddressDraft((current) => ({
          ...current,
          locationName: current.locationName || deriveAddressNameFromPlace(value),
          streetAddress: String(value.streetAddress || value.formattedAddress || current.streetAddress),
          addressLine2: String(value.addressLine2 || current.addressLine2),
          country: String(value.country || current.country),
          stateProvinceRegion: String(value.region || current.stateProvinceRegion),
          city: String(value.city || current.city),
          suburb: String(value.suburb || current.suburb),
          postalCode: String(value.postalCode || current.postalCode),
          latitude: value.latitude == null ? "" : String(value.latitude),
          longitude: value.longitude == null ? "" : String(value.longitude),
        }));
        setAddressPickerOpen(false);
      }}
    />
    {cardsModalOpen ? (
      <div className="fixed inset-0 z-[130] flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label="Close saved cards modal"
          className="absolute inset-0 bg-black/45"
          onClick={() => setCardsModalOpen(false)}
        />
        <div className="relative w-full max-w-[560px] rounded-[8px] bg-white shadow-[0_24px_60px_rgba(20,24,27,0.22)]">
          <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Saved cards</p>
              <h3 className="mt-1 text-[22px] font-semibold text-[#202020]">Manage your payment methods</h3>
            </div>
            <button
              type="button"
              onClick={() => setCardsModalOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c]"
              aria-label="Close saved cards modal"
            >
              ×
            </button>
          </div>
          <div className="max-h-[70svh] overflow-y-auto px-5 py-4">
            {cards.length ? (
              <div className="space-y-3">
                {cards.map((card) => {
                  const cardId = String(card?.id || "");
                  return (
                    <div key={cardId} className="flex items-center justify-between gap-3 rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-[#202020]">{formatCard(card)}</p>
                        <p className="mt-1 text-[12px] text-[#57636c]">
                          {cardId === selectedCardId ? "Selected for this checkout" : "Saved for faster checkout"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteCardId(cardId)}
                        disabled={deletingCardId === cardId}
                        className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[rgba(185,28,28,0.16)] bg-white px-4 text-[12px] font-semibold text-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingCardId === cardId ? "Removing..." : "Delete"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-5 text-[13px] text-[#57636c]">
                You do not have any saved cards yet.
              </div>
            )}
          </div>
          <div className="flex items-center justify-end border-t border-black/5 px-5 py-4">
            <button
              type="button"
              onClick={() => setCardsModalOpen(false)}
              className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    ) : null}
    <ConfirmModal
      open={Boolean(cardsModalOpen && pendingDeleteCardId)}
      eyebrow="Delete saved card"
      title="Are you sure?"
      description="This payment method will be removed from your saved cards and won’t be available for faster checkout anymore."
      confirmLabel={deletingCardId === pendingDeleteCardId ? "Removing..." : "Delete card"}
      busy={deletingCardId === pendingDeleteCardId}
      onClose={() => setPendingDeleteCardId("")}
      onConfirm={async () => {
        const cardId = pendingDeleteCardId;
        setPendingDeleteCardId("");
        await handleDeleteSavedCard(cardId);
      }}
    />
    {addressesModalOpen ? (
      <div className="fixed inset-0 z-[130] flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label="Close saved addresses modal"
          className="absolute inset-0 bg-black/45"
          onClick={() => {
            setAddressesModalOpen(false);
            setEditingLocationId("");
            setAddressDraft(defaultAddressDraft(profile ?? undefined));
          }}
        />
        <div className="relative flex max-h-[75svh] w-full max-w-[760px] flex-col overflow-hidden rounded-[8px] bg-white shadow-[0_24px_60px_rgba(20,24,27,0.22)]">
          <div className="flex items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Saved addresses</p>
              <h3 className="mt-1 text-[22px] font-semibold text-[#202020]">Manage your delivery addresses</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setAddressesModalOpen(false);
                setEditingLocationId("");
                setAddressDraft(defaultAddressDraft(profile ?? undefined));
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c]"
              aria-label="Close saved addresses modal"
            >
              ×
            </button>
          </div>
          <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[300px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-y-auto border-r border-black/5 p-4">
              <div className="space-y-3">
                {locations.length ? locations.map((location, index) => {
                  const locationId = String((location as any)?.id || "");
                  const selected = String(locationId) === String(editingLocationId);
                  return (
                    <button
                      key={`${locationId || location.label || "address"}-${index}`}
                      type="button"
                      onClick={() => {
                        const nextPhone = splitPhoneNumber(location.phoneNumber || "", location.phoneCountryCode || "27");
                        setEditingLocationId(locationId);
                        setAddressDraft({
                          locationName: (location as any)?.locationName || location.label || "",
                          recipientName: location.recipientName || "",
                          streetAddress: location.streetAddress || "",
                          addressLine2: location.addressLine2 || "",
                          suburb: location.suburb || "",
                          city: location.city || "",
                          stateProvinceRegion: location.stateProvinceRegion || location.province || "",
                          postalCode: location.postalCode || "",
                          country: location.country || "",
                          phoneCountryCode: nextPhone.countryCode,
                          phoneNumber: nextPhone.localNumber,
                          instructions: location.instructions || "",
                          is_default: location.is_default === true,
                          latitude: location.latitude == null ? "" : String(location.latitude),
                          longitude: location.longitude == null ? "" : String(location.longitude),
                        });
                      }}
                      className={
                        selected
                          ? "w-full rounded-[8px] border border-[rgba(203,178,107,0.7)] bg-[rgba(203,178,107,0.08)] p-4 text-left"
                          : "w-full rounded-[8px] border border-black/10 bg-[#fafafa] p-4 text-left"
                      }
                    >
                      <p className="text-[14px] font-semibold text-[#202020]">{resolveLocationTitle(location, index)}</p>
                      <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">{formatAddress(location)}</p>
                    </button>
                  );
                }) : (
                  <div className="rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-5 text-[13px] text-[#57636c]">
                    You do not have any saved delivery addresses yet.
                  </div>
                )}
              </div>
            </div>
            <div className="min-h-0 overflow-y-auto p-5">
              {editingLocationId ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-[18px] font-semibold text-[#202020]">Edit address</h4>
                    <button
                      type="button"
                      onClick={() => setAddressPickerOpen(true)}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[rgba(66,133,244,0.28)] bg-[linear-gradient(135deg,rgba(66,133,244,0.12)_0%,rgba(52,168,83,0.08)_100%)] px-4 text-[12px] font-semibold text-[#1a56c6] shadow-[0_8px_18px_rgba(66,133,244,0.12)] transition hover:border-[rgba(66,133,244,0.42)] hover:bg-[linear-gradient(135deg,rgba(66,133,244,0.16)_0%,rgba(52,168,83,0.12)_100%)]"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#4285f4] shadow-[0_4px_10px_rgba(66,133,244,0.18)]"
                      >
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.9]">
                          <path d="M10 17s5-4.6 5-9a5 5 0 1 0-10 0c0 4.4 5 9 5 9Z" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="10" cy="8" r="1.8" />
                        </svg>
                      </span>
                      <span className="flex flex-col items-start leading-[1.1]">
                        <span>Find with Google Maps</span>
                        <span className="text-[10px] font-medium text-[#4d7fe0]">Auto-fill your delivery address</span>
                      </span>
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Address name<RequiredMark /></label>
                      <input
                        value={addressDraft.locationName}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, locationName: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.addressLine1Label}<RequiredMark /></label>
                      <input
                        value={addressDraft.streetAddress}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, streetAddress: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder={addressFieldCopy.addressLine1Placeholder}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.addressLine2Label}</label>
                      <input
                        value={addressDraft.addressLine2}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, addressLine2: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder={addressFieldCopy.addressLine2Placeholder}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.suburbLabel}<RequiredMark /></label>
                      <input
                        value={addressDraft.suburb}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, suburb: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder={addressFieldCopy.suburbPlaceholder}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.cityLabel}<RequiredMark /></label>
                      <input
                        value={addressDraft.city}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, city: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder={addressFieldCopy.cityPlaceholder}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.regionLabel}<RequiredMark /></label>
                      <input
                        value={addressDraft.stateProvinceRegion}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, stateProvinceRegion: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder={addressFieldCopy.regionPlaceholder}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.postalLabel}<RequiredMark /></label>
                      <input
                        value={addressDraft.postalCode}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, postalCode: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                        placeholder={addressFieldCopy.postalPlaceholder}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">{addressFieldCopy.countryLabel}<RequiredMark /></label>
                      <select
                        value={addressDraft.country}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, country: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      >
                        <option value="">{addressFieldCopy.countryPlaceholder}</option>
                        {countryOptions.map((option) => (
                          <option key={option.iso} value={option.name}>
                            {`${option.flag} ${option.name}`.trim()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7d7d7d]">Delivery notes</label>
                      <input
                        value={addressDraft.instructions}
                        onChange={(event) => setAddressDraft((current) => ({ ...current, instructions: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-[10px] border border-black/10 bg-white px-3 text-[14px] text-[#202020] outline-none transition focus:border-[#907d4c]"
                      />
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-[12px] text-[#57636c]">
                    <input
                      type="checkbox"
                      checked={addressDraft.is_default}
                      onChange={(event) => setAddressDraft((current) => ({ ...current, is_default: event.target.checked }))}
                      className="h-4 w-4 rounded border-black/20"
                    />
                    Set this as my default delivery address
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleUpdateAddress()}
                      disabled={addressEditing}
                      className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {addressEditing ? "Saving..." : "Save changes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLocationId("");
                        setAddressDraft(defaultAddressDraft(profile ?? undefined));
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-5 text-[13px] text-[#57636c]">
                  Select an address on the left to edit it.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
