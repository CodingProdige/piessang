import {
  SUPPORTED_MARKETPLACE_CHECKOUT_COUNTRIES,
  normalizeCountryCode,
} from "@/lib/marketplace/country-config";
import { loadGoogleMerchantSettings } from "@/lib/platform/google-merchant-settings";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export function resolveMarketplaceSeller(input = {}) {
  const sellerCode = toStr(
    input?.product?.sellerCode ||
      input?.seller?.sellerCode ||
      input?.sellerCode ||
      ""
  );
  const sellerSlug = toStr(
    input?.product?.sellerSlug ||
      input?.seller?.sellerSlug ||
      input?.seller?.activeSellerSlug ||
      input?.seller?.groupSellerSlug ||
      input?.sellerSlug ||
      ""
  );
  const vendorName = toStr(
    input?.seller?.vendorName ||
      input?.product?.vendorName ||
      input?.vendor?.title ||
      input?.vendorName ||
      ""
  );

  const rawExternalSellerId = sellerCode || sellerSlug || vendorName || "piessang-seller";
  const externalSellerId = rawExternalSellerId
    .replace(/[^0-9A-Za-z.~_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "piessang-seller";

  return {
    sellerCode: sellerCode || null,
    sellerSlug: sellerSlug || null,
    vendorName: vendorName || null,
    externalSellerId,
  };
}

export async function resolveGoogleTargetCountries(input = {}) {
  const supportedCheckoutCountries = new Set(
    SUPPORTED_MARKETPLACE_CHECKOUT_COUNTRIES.map((entry) => entry.code),
  );
  const merchantSettings = Array.isArray(input?.merchantCountryCodes)
    ? { countryCodes: input.merchantCountryCodes }
    : await loadGoogleMerchantSettings();
  const supportedMerchantCountries = new Set(
    (merchantSettings?.countryCodes || []).map((entry) => String(entry).trim().toUpperCase()).filter(Boolean),
  );
  const countries = new Set();
  const deliveryProfile =
    input?.seller?.deliveryProfile && typeof input.seller.deliveryProfile === "object"
      ? input.seller.deliveryProfile
      : input?.deliveryProfile && typeof input.deliveryProfile === "object"
        ? input.deliveryProfile
        : null;

  const addCountry = (value) => {
    const code = normalizeCountryCode(value);
    if (!code) return;
    if (!supportedCheckoutCountries.has(code)) return;
    if (!supportedMerchantCountries.has(code)) return;
    countries.add(code);
  };

  addCountry(input?.sellerCountry);
  addCountry(input?.seller?.sellerCountry);

  if (deliveryProfile) {
    addCountry(deliveryProfile?.origin?.country);

    if (Array.isArray(deliveryProfile?.shippingZones)) {
      for (const zone of deliveryProfile.shippingZones) {
        if (zone?.isActive === false) continue;
        if (String(zone?.scopeType || "country").trim().toLowerCase() === "country") {
          addCountry(zone?.country);
        }
      }
    }

    if (deliveryProfile?.directDelivery?.enabled === true) {
      addCountry(deliveryProfile?.origin?.country);
    }
  }

  return Array.from(countries);
}
