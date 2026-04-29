function toFiniteNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNumericString(value) {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  if (!raw) return "0";

  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = raw.replace(/^[+-]/, "");

  if (typeof value !== "number" && /^\d*\.?\d+$/.test(unsigned)) {
    const [wholeRaw, decimalRaw = ""] = unsigned.split(".");
    const whole = wholeRaw || "0";
    const decimal = `${decimalRaw}00`.slice(0, 2);
    return `${sign}${whole}.${decimal}`;
  }

  const numeric = toFiniteNumber(value);
  const cents = numeric * 100;
  const nearestCent = Math.round(cents);
  const canonicalCents =
    Math.abs(cents - nearestCent) < 0.0001
      ? nearestCent
      : numeric < 0
        ? Math.ceil(cents)
        : Math.floor(cents);
  const safeAmount = Object.is(canonicalCents, -0) ? 0 : canonicalCents / 100;
  return safeAmount.toFixed(2);
}

export function normalizeMoneyAmount(value) {
  const normalized = normalizeNumericString(value);
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMoneyExact(value, { currencySymbol = "R", space = false } = {}) {
  const normalized = normalizeNumericString(value);
  const sign = normalized.startsWith("-") ? "-" : "";
  const absolute = sign ? normalized.slice(1) : normalized;
  return `${sign}${currencySymbol}${space ? " " : ""}${absolute}`;
}

export function formatCurrencyExact(value, currency = "ZAR", locale = "en-ZA") {
  const normalized = normalizeMoneyAmount(value);
  const sign = normalized < 0 ? "-" : "";
  const absolute = Math.abs(normalized);
  const [wholePart, decimalPart = "00"] = normalizeNumericString(absolute).split(".");
  const wholeFormatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(wholePart || 0));
  const symbol = currency === "ZAR" ? "R" : `${currency} `;
  return `${sign}${symbol}${wholeFormatted}.${decimalPart}`;
}
