function toFiniteNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNumericString(value) {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  if (!raw) return "0";
  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = raw.replace(/^[+-]/, "");

  if (!/^\d*\.?\d+$/.test(unsigned)) {
    return String(toFiniteNumber(value));
  }

  const [wholeRaw, decimalRaw = ""] = unsigned.split(".");
  const whole = wholeRaw || "0";
  const decimal = `${decimalRaw}00`.slice(0, 2);
  return `${sign}${whole}.${decimal}`;
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
