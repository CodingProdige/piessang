import {
  SUPPORTED_MARKETPLACE_CHECKOUT_COUNTRIES,
  normalizeCountryCode,
} from "@/lib/marketplace/country-config";
import { buildShippingSettingsFromLegacySeller } from "@/lib/shipping/settings";
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
  const shippingSettings =
    input?.seller?.shippingSettings && typeof input.seller.shippingSettings === "object"
      ? buildShippingSettingsFromLegacySeller({ shippingSettings: input.seller.shippingSettings })
      : input?.shippingSettings && typeof input.shippingSettings === "object"
        ? buildShippingSettingsFromLegacySeller({ shippingSettings: input.shippingSettings })
        : input?.seller && typeof input.seller === "object"
          ? buildShippingSettingsFromLegacySeller(input.seller)
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

  if (shippingSettings) {
    addCountry(shippingSettings?.shipsFrom?.countryCode);
    if (shippingSettings?.localDelivery?.enabled) {
      addCountry(shippingSettings?.shipsFrom?.countryCode);
    }
    if (Array.isArray(shippingSettings?.zones)) {
      for (const zone of shippingSettings.zones) {
        if (zone?.enabled === false) continue;
        addCountry(zone?.countryCode);
      }
    }
  }

  return Array.from(countries);
}
