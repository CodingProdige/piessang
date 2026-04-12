type CountryEntry = {
  code: string;
  label: string;
  currency: string;
};

export const COUNTRY_CATALOG: CountryEntry[] = [
  { code: "AE", label: "United Arab Emirates", currency: "AED" },
  { code: "AG", label: "Antigua and Barbuda", currency: "XCD" },
  { code: "AL", label: "Albania", currency: "ALL" },
  { code: "AM", label: "Armenia", currency: "AMD" },
  { code: "AR", label: "Argentina", currency: "ARS" },
  { code: "AT", label: "Austria", currency: "EUR" },
  { code: "AU", label: "Australia", currency: "AUD" },
  { code: "BE", label: "Belgium", currency: "EUR" },
  { code: "BH", label: "Bahrain", currency: "BHD" },
  { code: "BG", label: "Bulgaria", currency: "BGN" },
  { code: "BN", label: "Brunei", currency: "BND" },
  { code: "BR", label: "Brazil", currency: "BRL" },
  { code: "BW", label: "Botswana", currency: "BWP" },
  { code: "CA", label: "Canada", currency: "CAD" },
  { code: "CH", label: "Switzerland", currency: "CHF" },
  { code: "CL", label: "Chile", currency: "CLP" },
  { code: "CN", label: "China", currency: "CNY" },
  { code: "CO", label: "Colombia", currency: "COP" },
  { code: "HR", label: "Croatia", currency: "EUR" },
  { code: "CY", label: "Cyprus", currency: "EUR" },
  { code: "CZ", label: "Czech Republic", currency: "CZK" },
  { code: "DE", label: "Germany", currency: "EUR" },
  { code: "DK", label: "Denmark", currency: "DKK" },
  { code: "DZ", label: "Algeria", currency: "DZD" },
  { code: "EE", label: "Estonia", currency: "EUR" },
  { code: "EG", label: "Egypt", currency: "EGP" },
  { code: "ES", label: "Spain", currency: "EUR" },
  { code: "FI", label: "Finland", currency: "EUR" },
  { code: "FR", label: "France", currency: "EUR" },
  { code: "GB", label: "United Kingdom", currency: "GBP" },
  { code: "GH", label: "Ghana", currency: "GHS" },
  { code: "GM", label: "Gambia", currency: "GMD" },
  { code: "GY", label: "Guyana", currency: "GYD" },
  { code: "HK", label: "Hong Kong", currency: "HKD" },
  { code: "HU", label: "Hungary", currency: "HUF" },
  { code: "ID", label: "Indonesia", currency: "IDR" },
  { code: "IE", label: "Ireland", currency: "EUR" },
  { code: "IL", label: "Israel", currency: "ILS" },
  { code: "IN", label: "India", currency: "INR" },
  { code: "IT", label: "Italy", currency: "EUR" },
  { code: "JM", label: "Jamaica", currency: "JMD" },
  { code: "JO", label: "Jordan", currency: "JOD" },
  { code: "JP", label: "Japan", currency: "JPY" },
  { code: "KE", label: "Kenya", currency: "KES" },
  { code: "KH", label: "Cambodia", currency: "KHR" },
  { code: "KR", label: "South Korea", currency: "KRW" },
  { code: "KW", label: "Kuwait", currency: "KWD" },
  { code: "LK", label: "Sri Lanka", currency: "LKR" },
  { code: "LT", label: "Lithuania", currency: "EUR" },
  { code: "LU", label: "Luxembourg", currency: "EUR" },
  { code: "LV", label: "Latvia", currency: "EUR" },
  { code: "MA", label: "Morocco", currency: "MAD" },
  { code: "MC", label: "Monaco", currency: "EUR" },
  { code: "MG", label: "Madagascar", currency: "MGA" },
  { code: "MT", label: "Malta", currency: "EUR" },
  { code: "MU", label: "Mauritius", currency: "MUR" },
  { code: "MX", label: "Mexico", currency: "MXN" },
  { code: "MY", label: "Malaysia", currency: "MYR" },
  { code: "NG", label: "Nigeria", currency: "NGN" },
  { code: "NL", label: "Netherlands", currency: "EUR" },
  { code: "NO", label: "Norway", currency: "NOK" },
  { code: "NZ", label: "New Zealand", currency: "NZD" },
  { code: "OM", label: "Oman", currency: "OMR" },
  { code: "PE", label: "Peru", currency: "PEN" },
  { code: "PH", label: "Philippines", currency: "PHP" },
  { code: "PL", label: "Poland", currency: "PLN" },
  { code: "PT", label: "Portugal", currency: "EUR" },
  { code: "QA", label: "Qatar", currency: "QAR" },
  { code: "RO", label: "Romania", currency: "RON" },
  { code: "RW", label: "Rwanda", currency: "RWF" },
  { code: "SA", label: "Saudi Arabia", currency: "SAR" },
  { code: "SE", label: "Sweden", currency: "SEK" },
  { code: "SG", label: "Singapore", currency: "SGD" },
  { code: "SI", label: "Slovenia", currency: "EUR" },
  { code: "SK", label: "Slovakia", currency: "EUR" },
  { code: "LC", label: "Saint Lucia", currency: "XCD" },
  { code: "TH", label: "Thailand", currency: "THB" },
  { code: "TN", label: "Trinidad and Tobago", currency: "TTD" },
  { code: "TR", label: "Turkey", currency: "TRY" },
  { code: "TZ", label: "Tanzania", currency: "TZS" },
  { code: "US", label: "United States", currency: "USD" },
  { code: "VN", label: "Vietnam", currency: "VND" },
  { code: "ZA", label: "South Africa", currency: "ZAR" },
];

function pickCountries(codes: string[]) {
  const codeSet = new Set(codes.map((value) => value.trim().toUpperCase()).filter(Boolean));
  return COUNTRY_CATALOG.filter((entry) => codeSet.has(entry.code));
}

function pickCountriesByLabel(labels: string[]) {
  const normalizedLabels = new Set(labels.map((value) => value.trim().toLowerCase()).filter(Boolean));
  return COUNTRY_CATALOG.filter((entry) => normalizedLabels.has(entry.label.trim().toLowerCase()));
}

export const SUPPORTED_SELLER_PAYOUT_COUNTRIES = pickCountries([
  "AE", "AG", "AL", "AM", "AT", "AU", "BE", "BH", "BG", "BN", "BR", "BW",
  "CA", "CH", "HR", "CZ", "DE", "DK", "DZ", "EE", "ES", "FI", "FR", "GB",
  "GM", "GY", "HK", "HU", "IE", "IT", "JM", "JO", "JP", "KE", "KW", "LK",
  "LT", "LU", "LV", "MA", "MC", "MG", "MU", "MX", "MY", "NL", "NO", "NZ",
  "OM", "PL", "PT", "QA", "RO", "RW", "SE", "SG", "SI", "SK", "LC", "TH",
  "TN", "TZ", "US", "VN", "ZA",
]);

export const SUPPORTED_MARKETPLACE_CHECKOUT_COUNTRIES = pickCountries([
  "AE", "AR", "AU", "BR", "CA", "CH", "CL", "CN", "CO", "CZ", "DE", "DK",
  "EG", "ES", "FI", "FR", "GB", "GH", "HK", "ID", "IE", "IL", "IN", "IT",
  "JP", "KE", "KR", "KW", "MA", "MX", "MY", "NG", "NL", "NO", "NZ", "PE",
  "PH", "PL", "QA", "RO", "SA", "SE", "SG", "TH", "TR", "US", "VN", "ZA",
]);

export const SUPPORTED_GOOGLE_MERCHANT_COUNTRIES = pickCountries(["ZA"]);

export const SUPPORTED_PAYOUT_COUNTRIES = SUPPORTED_SELLER_PAYOUT_COUNTRIES;

export const STRIPE_SUPPORTED_SHOPPER_COUNTRIES = pickCountriesByLabel([
  "Australia",
  "Austria",
  "Belgium",
  "Brazil",
  "Bulgaria",
  "Canada",
  "Côte d'Ivoire",
  "Croatia",
  "Cyprus",
  "Czech Republic",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Ghana",
  "Gibraltar",
  "Greece",
  "Hong Kong",
  "Hungary",
  "India",
  "Indonesia",
  "Ireland",
  "Italy",
  "Japan",
  "Kenya",
  "Latvia",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Malaysia",
  "Malta",
  "Mexico",
  "Netherlands",
  "New Zealand",
  "Nigeria",
  "Norway",
  "Poland",
  "Portugal",
  "Romania",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "South Africa",
  "Spain",
  "Sweden",
  "Switzerland",
  "Thailand",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
]);

const CURRENCY_LABELS: Record<string, string> = {
  AED: "UAE dirham",
  ALL: "Albanian lek",
  AMD: "Armenian dram",
  ARS: "Argentine peso",
  AUD: "Australian dollar",
  BGN: "Bulgarian lev",
  BHD: "Bahraini dinar",
  BND: "Brunei dollar",
  BOP: "Bolivian boliviano",
  BRL: "Brazilian real",
  BWP: "Botswana pula",
  CAD: "Canadian dollar",
  CHF: "Swiss franc",
  CLP: "Chilean peso",
  CNY: "Chinese yuan",
  COP: "Colombian peso",
  CZK: "Czech koruna",
  DKK: "Danish krone",
  DZD: "Algerian dinar",
  EGP: "Egyptian pound",
  EUR: "Euro",
  GBP: "British pound",
  GHS: "Ghanaian cedi",
  GMD: "Gambian dalasi",
  GYD: "Guyanese dollar",
  HKD: "Hong Kong dollar",
  HUF: "Hungarian forint",
  IDR: "Indonesian rupiah",
  ILS: "Israeli new shekel",
  INR: "Indian rupee",
  JMD: "Jamaican dollar",
  JOD: "Jordanian dinar",
  JPY: "Japanese yen",
  KES: "Kenyan shilling",
  KHR: "Cambodian riel",
  KRW: "South Korean won",
  KWD: "Kuwaiti dinar",
  LKR: "Sri Lankan rupee",
  MAD: "Moroccan dirham",
  MGA: "Malagasy ariary",
  MUR: "Mauritian rupee",
  MXN: "Mexican peso",
  MYR: "Malaysian ringgit",
  NGN: "Nigerian naira",
  NOK: "Norwegian krone",
  NZD: "New Zealand dollar",
  OMR: "Omani rial",
  PEN: "Peruvian sol",
  PHP: "Philippine peso",
  PLN: "Polish zloty",
  QAR: "Qatari riyal",
  RON: "Romanian leu",
  RWF: "Rwandan franc",
  SAR: "Saudi riyal",
  SEK: "Swedish krona",
  SGD: "Singapore dollar",
  THB: "Thai baht",
  TRY: "Turkish lira",
  TTD: "Trinidad and Tobago dollar",
  TZS: "Tanzanian shilling",
  USD: "US dollar",
  VND: "Vietnamese dong",
  XCD: "East Caribbean dollar",
  ZAR: "South African rand",
 };

export const SUPPORTED_PAYOUT_CURRENCIES = Array.from(
  new Map(
    SUPPORTED_SELLER_PAYOUT_COUNTRIES.map((entry) => [
      entry.currency,
      { code: entry.currency, label: CURRENCY_LABELS[entry.currency] || entry.currency },
    ]),
  ).values(),
);

export const COUNTRY_CODE_BY_LABEL = new Map<string, string>(
  COUNTRY_CATALOG.flatMap((entry) => {
    const normalizedLabel = entry.label.toLowerCase();
    const pairs: Array<[string, string]> = [[normalizedLabel, entry.code], [entry.code.toLowerCase(), entry.code]];
    if (entry.code === "GB") {
      pairs.push(["uk", "GB"], ["great britain", "GB"], ["england", "GB"]);
    }
    if (entry.code === "US") {
      pairs.push(["usa", "US"]);
    }
    if (entry.code === "AE") {
      pairs.push(["uae", "AE"]);
    }
    return pairs;
  }),
);

export function normalizeCountryCode(value: unknown) {
  const input = value == null ? "" : String(value).trim().toLowerCase();
  if (!input) return null;
  if (COUNTRY_CODE_BY_LABEL.has(input)) return COUNTRY_CODE_BY_LABEL.get(input) || null;
  if (/^[a-z]{2}$/i.test(input)) return input.toUpperCase();
  return null;
}

export function normalizeCountryLabel(
  value: unknown,
  supportedCountries: readonly CountryEntry[],
  fallback = "",
) {
  const code = normalizeCountryCode(value);
  if (!code) return fallback;
  return supportedCountries.find((entry) => entry.code === code)?.label || fallback;
}

export function getDefaultPayoutCurrency(countryCode: unknown, fallback = "USD") {
  const normalizedCode = normalizeCountryCode(countryCode);
  if (!normalizedCode) return fallback;
  return COUNTRY_CATALOG.find((entry) => entry.code === normalizedCode)?.currency || fallback;
}
