function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export type EasyshipCategoryMapping = {
  itemCategory: string | null;
  hsSearchTerm: string | null;
  supportLevel: "supported" | "restricted" | "review";
  sellerMessage: string | null;
};

export type ReviewedHsFallback = {
  code: string;
  description: string;
  confidence: "reviewed";
};

export const EASYSHIP_CUSTOMS_CATEGORY_FALLBACK_OPTIONS = [
  "Audio/Video",
  "Books & Collectibles",
  "Computers & Laptops",
  "Documents",
  "Dry Food & Supplements",
  "Fashion",
  "Health & Beauty",
  "Home Appliances",
  "Home Decor",
  "Jewellery",
  "Sport & Leisure",
  "Toys",
] as const;

const DEFAULT_MAPPING: EasyshipCategoryMapping = {
  itemCategory: "Home Decor",
  hsSearchTerm: "home decor",
  supportLevel: "review",
  sellerMessage: "Piessang could not confidently match this product to a courier customs category. Review the customs category and HS code before relying on international shipping.",
};

const CATEGORY_MAP: Record<string, EasyshipCategoryMapping> = {
  beverages: {
    itemCategory: "Dry Food & Supplements",
    hsSearchTerm: "beverages",
    supportLevel: "review",
    sellerMessage: "Beverages often face courier and customs restrictions. Review the final courier options carefully before promising international shipping.",
  },
  "alcohol-liquor": {
    itemCategory: null,
    hsSearchTerm: null,
    supportLevel: "restricted",
    sellerMessage: "Alcoholic beverages are commonly prohibited or tightly restricted by couriers and customs. Do not rely on Piessang courier shipping for this category.",
  },
  "groceries-snacks": {
    itemCategory: "Dry Food & Supplements",
    hsSearchTerm: "food",
    supportLevel: "review",
    sellerMessage: "Food and consumables can be destination-restricted. Piessang will still validate courier support at checkout.",
  },
  "household-cleaning": {
    itemCategory: "Home Decor",
    hsSearchTerm: "household products",
    supportLevel: "review",
    sellerMessage: "Cleaning and chemical products can be restricted for international shipping. Double-check courier availability and declaration requirements.",
  },
  "health-personal-care": {
    itemCategory: "Health & Beauty",
    hsSearchTerm: "health beauty",
    supportLevel: "review",
    sellerMessage: "Health and beauty products may require additional declaration for liquids, cosmetics, or regulated ingredients.",
  },
  "baby-toddler": {
    itemCategory: "Toys",
    hsSearchTerm: "baby products",
    supportLevel: "supported",
    sellerMessage: "Baby and toddler products can usually ship internationally, but Piessang will still validate the courier route at checkout.",
  },
  "office-stationery": {
    itemCategory: "Documents",
    hsSearchTerm: "stationery",
    supportLevel: "supported",
    sellerMessage: null,
  },
  "bar-hospitality-supplies": {
    itemCategory: "Home Decor",
    hsSearchTerm: "glassware",
    supportLevel: "review",
    sellerMessage: "Glassware and hospitality items may need fragile-safe courier services and may not be supported for every destination.",
  },
  "equipment-appliances": {
    itemCategory: "Home Appliances",
    hsSearchTerm: "appliances",
    supportLevel: "review",
    sellerMessage: "Appliances and equipment can trigger battery, voltage, or bulky-shipment restrictions depending on the product.",
  },
  "fashion-accessories": {
    itemCategory: "Fashion",
    hsSearchTerm: "fashion accessories",
    supportLevel: "supported",
    sellerMessage: null,
  },
  fashion: {
    itemCategory: "Fashion",
    hsSearchTerm: "fashion",
    supportLevel: "supported",
    sellerMessage: null,
  },
  footwear: {
    itemCategory: "Fashion",
    hsSearchTerm: "footwear",
    supportLevel: "supported",
    sellerMessage: null,
  },
  jewellery: {
    itemCategory: "Jewellery",
    hsSearchTerm: "jewellery",
    supportLevel: "review",
    sellerMessage: "Jewellery often has destination-specific customs sensitivity and higher declared value exposure.",
  },
  electronics: {
    itemCategory: "Computers & Laptops",
    hsSearchTerm: "electronics",
    supportLevel: "review",
    sellerMessage: "Electronics may need battery-related declarations and some courier services may be unavailable for certain destinations.",
  },
  books: {
    itemCategory: "Books & Collectibles",
    hsSearchTerm: "books",
    supportLevel: "supported",
    sellerMessage: null,
  },
  media: {
    itemCategory: "Audio/Video",
    hsSearchTerm: "audio video media",
    supportLevel: "supported",
    sellerMessage: null,
  },
  toys: {
    itemCategory: "Toys",
    hsSearchTerm: "toys",
    supportLevel: "supported",
    sellerMessage: null,
  },
  sports: {
    itemCategory: "Sport & Leisure",
    hsSearchTerm: "sport equipment",
    supportLevel: "supported",
    sellerMessage: null,
  },
  home: {
    itemCategory: "Home Decor",
    hsSearchTerm: "home decor",
    supportLevel: "supported",
    sellerMessage: null,
  },
  beauty: {
    itemCategory: "Health & Beauty",
    hsSearchTerm: "beauty products",
    supportLevel: "review",
    sellerMessage: "Beauty products can require extra declaration for liquids, aerosols, or restricted ingredients.",
  },
};

const SUBCATEGORY_MAP: Record<string, EasyshipCategoryMapping> = {
  "baby-clothing": CATEGORY_MAP.fashion,
  "coffee-machines": CATEGORY_MAP["equipment-appliances"],
  refrigeration: CATEGORY_MAP["equipment-appliances"],
  "ice-machines": CATEGORY_MAP["equipment-appliances"],
  "small-appliances": CATEGORY_MAP["equipment-appliances"],
  "glass-bottles": CATEGORY_MAP["bar-hospitality-supplies"],
  glassware: CATEGORY_MAP["bar-hospitality-supplies"],
  beauty: CATEGORY_MAP.beauty,
  "personal-care": CATEGORY_MAP["health-personal-care"],
  "oral-care": CATEGORY_MAP["health-personal-care"],
  "feminine-care": CATEGORY_MAP["health-personal-care"],
  "shaving-grooming": CATEGORY_MAP["health-personal-care"],
  "soft-drinks": CATEGORY_MAP.beverages,
  "energy-drinks": CATEGORY_MAP.beverages,
  "sport-drinks": CATEGORY_MAP.beverages,
  "coffee-tea": CATEGORY_MAP.beverages,
  beer: CATEGORY_MAP["alcohol-liquor"],
  wine: CATEGORY_MAP["alcohol-liquor"],
  whisky: CATEGORY_MAP["alcohol-liquor"],
  whiskey: CATEGORY_MAP["alcohol-liquor"],
  vodka: CATEGORY_MAP["alcohol-liquor"],
  gin: CATEGORY_MAP["alcohol-liquor"],
  rum: CATEGORY_MAP["alcohol-liquor"],
  tequila: CATEGORY_MAP["alcohol-liquor"],
  brandy: CATEGORY_MAP["alcohol-liquor"],
  cognac: CATEGORY_MAP["alcohol-liquor"],
  liqueurs: CATEGORY_MAP["alcohol-liquor"],
  champagne: CATEGORY_MAP["alcohol-liquor"],
  "sparkling-wine": CATEGORY_MAP["alcohol-liquor"],
};

const CATEGORY_HS_FALLBACK_MAP: Record<string, ReviewedHsFallback> = {
  beverages: {
    code: "220299",
    description: "Non-alcoholic beverages, not elsewhere specified",
    confidence: "reviewed",
  },
  "groceries-snacks": {
    code: "210690",
    description: "Food preparations not elsewhere specified",
    confidence: "reviewed",
  },
  "health-personal-care": {
    code: "330499",
    description: "Beauty or skin-care preparations",
    confidence: "reviewed",
  },
  "baby-toddler": {
    code: "950300",
    description: "Toys and similar articles",
    confidence: "reviewed",
  },
  "office-stationery": {
    code: "482010",
    description: "Registers, notebooks and similar articles of paper",
    confidence: "reviewed",
  },
  "equipment-appliances": {
    code: "850980",
    description: "Electro-mechanical domestic appliances, other",
    confidence: "reviewed",
  },
  "fashion-accessories": {
    code: "621710",
    description: "Made-up clothing accessories",
    confidence: "reviewed",
  },
  fashion: {
    code: "620349",
    description: "Articles of apparel, of textile materials",
    confidence: "reviewed",
  },
  footwear: {
    code: "640399",
    description: "Footwear with outer soles of rubber, plastics or leather",
    confidence: "reviewed",
  },
  jewellery: {
    code: "711790",
    description: "Imitation jewellery",
    confidence: "reviewed",
  },
  electronics: {
    code: "854370",
    description: "Electrical machines and apparatus with individual functions",
    confidence: "reviewed",
  },
  books: {
    code: "490199",
    description: "Printed books, brochures and similar printed matter",
    confidence: "reviewed",
  },
  media: {
    code: "852349",
    description: "Recorded media and similar storage media",
    confidence: "reviewed",
  },
  toys: {
    code: "950300",
    description: "Toys and similar articles",
    confidence: "reviewed",
  },
  sports: {
    code: "950691",
    description: "Articles and equipment for general physical exercise",
    confidence: "reviewed",
  },
  home: {
    code: "392490",
    description: "Household and domestic articles of plastics",
    confidence: "reviewed",
  },
  beauty: {
    code: "330499",
    description: "Beauty or skin-care preparations",
    confidence: "reviewed",
  },
};

const SUBCATEGORY_HS_FALLBACK_MAP: Record<string, ReviewedHsFallback> = {
  "soft-drinks": CATEGORY_HS_FALLBACK_MAP.beverages,
  "energy-drinks": CATEGORY_HS_FALLBACK_MAP.beverages,
  "sport-drinks": CATEGORY_HS_FALLBACK_MAP.beverages,
  "coffee-tea": {
    code: "090121",
    description: "Roasted coffee or similar beverage preparations",
    confidence: "reviewed",
  },
  beauty: CATEGORY_HS_FALLBACK_MAP.beauty,
  "personal-care": CATEGORY_HS_FALLBACK_MAP["health-personal-care"],
  "oral-care": {
    code: "330610",
    description: "Dentifrices",
    confidence: "reviewed",
  },
  glassware: {
    code: "701399",
    description: "Glassware of a kind used for table, kitchen or similar purposes",
    confidence: "reviewed",
  },
  "glass-bottles": {
    code: "701090",
    description: "Glass containers for conveyance or packing of goods",
    confidence: "reviewed",
  },
  refrigeration: {
    code: "841850",
    description: "Refrigerating or freezing equipment",
    confidence: "reviewed",
  },
};

export function resolveEasyshipCategoryMapping({
  categorySlug,
  subCategorySlug,
}: {
  categorySlug?: string | null;
  subCategorySlug?: string | null;
}) {
  const normalizedSubCategory = toStr(subCategorySlug).toLowerCase();
  const normalizedCategory = toStr(categorySlug).toLowerCase();
  return SUBCATEGORY_MAP[normalizedSubCategory] || CATEGORY_MAP[normalizedSubCategory] || CATEGORY_MAP[normalizedCategory] || DEFAULT_MAPPING;
}

export function resolveReviewedHsFallback({
  categorySlug,
  subCategorySlug,
}: {
  categorySlug?: string | null;
  subCategorySlug?: string | null;
}) {
  const normalizedSubCategory = toStr(subCategorySlug).toLowerCase();
  const normalizedCategory = toStr(categorySlug).toLowerCase();
  return SUBCATEGORY_HS_FALLBACK_MAP[normalizedSubCategory] || CATEGORY_HS_FALLBACK_MAP[normalizedSubCategory] || CATEGORY_HS_FALLBACK_MAP[normalizedCategory] || null;
}

export function buildEasyshipSellerWarnings({
  courierEnabled,
  categorySlug,
  subCategorySlug,
  customsCategory,
  hsCode,
  countryOfOrigin,
}: {
  courierEnabled?: boolean;
  categorySlug?: string | null;
  subCategorySlug?: string | null;
  customsCategory?: string | null;
  hsCode?: string | null;
  countryOfOrigin?: string | null;
}) {
  if (courierEnabled !== true) return [];
  const mapping = resolveEasyshipCategoryMapping({ categorySlug, subCategorySlug });
  const warnings: string[] = [];
  if (mapping.supportLevel === "restricted" && mapping.sellerMessage) warnings.push(mapping.sellerMessage);
  if (!toStr(customsCategory) && mapping.itemCategory) {
    warnings.push(`Piessang will fall back to the courier customs category "${mapping.itemCategory}" if you do not pick one manually.`);
  }
  if (!toStr(hsCode)) {
    warnings.push("HS codes are used for customs clearance and duty/tax calculation. Piessang can suggest one, but you should override it if you know the exact code for your product.");
  }
  if (!toStr(countryOfOrigin)) {
    warnings.push("Set your seller shipping origin in Settings before relying on courier shipping, customs estimates, or duties/taxes.");
  }
  return warnings;
}
