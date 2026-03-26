export const SUPPORTED_PAYOUT_COUNTRIES = [
  { code: "ZA", label: "South Africa" },
  { code: "KE", label: "Kenya" },
  { code: "MU", label: "Mauritius" },
  { code: "GB", label: "United Kingdom" },
  { code: "US", label: "United States" },
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

export const PEACH_LIVE_PAYOUT_COUNTRIES = new Set(["ZA"]);
export const PEACH_LIVE_PAYOUT_CURRENCIES = new Set(["ZAR"]);

