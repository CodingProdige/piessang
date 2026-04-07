import {
  SUPPORTED_PAYOUT_COUNTRIES,
  SUPPORTED_PAYOUT_CURRENCIES,
  SUPPORTED_SELLER_PAYOUT_COUNTRIES,
  COUNTRY_CODE_BY_LABEL,
  normalizeCountryCode,
  normalizeCountryLabel,
  getDefaultPayoutCurrency,
} from "@/lib/marketplace/country-config";

export {
  SUPPORTED_PAYOUT_COUNTRIES,
  SUPPORTED_PAYOUT_CURRENCIES,
  SUPPORTED_SELLER_PAYOUT_COUNTRIES,
  COUNTRY_CODE_BY_LABEL,
  normalizeCountryCode,
  normalizeCountryLabel,
  getDefaultPayoutCurrency,
};

export const STRIPE_GLOBAL_PAYOUT_COUNTRIES = new Set(
  SUPPORTED_SELLER_PAYOUT_COUNTRIES.map((entry) => entry.code),
);

export const STRIPE_GLOBAL_PAYOUT_CURRENCIES = new Set(
  SUPPORTED_PAYOUT_CURRENCIES.map((entry) => entry.code),
);
