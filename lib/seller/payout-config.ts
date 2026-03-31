export const SUPPORTED_PAYOUT_COUNTRIES = [
  { code: "US", label: "United States" },
  { code: "ZA", label: "South Africa" },
  { code: "KE", label: "Kenya" },
  { code: "MU", label: "Mauritius" },
  { code: "GB", label: "United Kingdom" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "DE", label: "Germany" },
  { code: "NL", label: "Netherlands" },
] as const;

export const SUPPORTED_PAYOUT_CURRENCIES = [
  { code: "ZAR", label: "South African rand" },
  { code: "KES", label: "Kenyan shilling" },
  { code: "MUR", label: "Mauritian rupee" },
  { code: "USD", label: "US dollar" },
  { code: "GBP", label: "British pound" },
  { code: "EUR", label: "Euro" },
  { code: "AED", label: "UAE dirham" },
] as const;

export const STRIPE_GLOBAL_PAYOUT_COUNTRIES = new Set(
  SUPPORTED_PAYOUT_COUNTRIES.map((entry) => entry.code),
);
export const STRIPE_GLOBAL_PAYOUT_CURRENCIES = new Set(
  SUPPORTED_PAYOUT_CURRENCIES.map((entry) => entry.code),
);
