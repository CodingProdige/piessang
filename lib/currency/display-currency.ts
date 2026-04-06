import { normalizeMoneyAmount } from "@/lib/money";

export const BASE_CURRENCY = "ZAR";
export const DISPLAY_CURRENCY_STORAGE_KEY = "piessang-display-currency";

export const SUPPORTED_DISPLAY_CURRENCIES = [
  { code: "ZAR", label: "South African Rand", symbol: "R", flag: "ZA" },
  { code: "USD", label: "US Dollar", symbol: "$", flag: "US" },
  { code: "EUR", label: "Euro", symbol: "EUR", flag: "EU" },
  { code: "GBP", label: "British Pound", symbol: "GBP", flag: "GB" },
  { code: "AED", label: "UAE Dirham", symbol: "AED", flag: "AE" },
] as const;

export type SupportedDisplayCurrencyCode = (typeof SUPPORTED_DISPLAY_CURRENCIES)[number]["code"];

export function isSupportedDisplayCurrency(value: string): value is SupportedDisplayCurrencyCode {
  return SUPPORTED_DISPLAY_CURRENCIES.some((currency) => currency.code === value);
}

export function getDisplayCurrencyMeta(code: string) {
  return SUPPORTED_DISPLAY_CURRENCIES.find((currency) => currency.code === code) || SUPPORTED_DISPLAY_CURRENCIES[0];
}

export function getFlagEmoji(flagCode: string) {
  if (!flagCode || flagCode.length !== 2) return "";
  return Array.from(flagCode.toUpperCase())
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

export function suggestDisplayCurrencyFromCountry(country: string) {
  const normalized = String(country || "").trim().toLowerCase();
  if (!normalized) return BASE_CURRENCY;
  if (["south africa", "za"].includes(normalized)) return "ZAR";
  if (["united states", "usa", "us"].includes(normalized)) return "USD";
  if (["united kingdom", "uk", "great britain", "gb", "england"].includes(normalized)) return "GBP";
  if (["united arab emirates", "uae", "ae"].includes(normalized)) return "AED";
  if (
    [
      "germany",
      "france",
      "spain",
      "italy",
      "netherlands",
      "belgium",
      "portugal",
      "ireland",
      "austria",
      "finland",
      "greece",
      "european union",
      "eu",
    ].includes(normalized)
  ) {
    return "EUR";
  }
  return BASE_CURRENCY;
}

export function formatDisplayMoney(amountZar: number, currencyCode: string, rates: Record<string, number> | null) {
  const safeAmount = Number.isFinite(Number(amountZar)) ? Number(amountZar) : 0;
  const code = isSupportedDisplayCurrency(currencyCode) ? currencyCode : BASE_CURRENCY;
  const rate = code === BASE_CURRENCY ? 1 : Number(rates?.[code] || 0);
  const converted = code === BASE_CURRENCY || !Number.isFinite(rate) || rate <= 0 ? safeAmount : safeAmount * rate;
  return new Intl.NumberFormat(code === "ZAR" ? "en-ZA" : "en", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalizeMoneyAmount(converted));
}
