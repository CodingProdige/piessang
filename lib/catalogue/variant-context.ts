export function normalizeCatalogueSlug(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/['".]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const BEAUTY_SLUGS = new Set([
  "beauty-personal-care",
  "health-personal-care",
  "health",
  "beauty",
  "skin-care",
  "makeup",
  "fragrance",
  "hair-care",
]);
const BEVERAGE_SLUGS = new Set([
  "beverages",
  "alcohol-liquor",
  "groceries-snacks",
  "non-perishable",
  "water",
  "soft-drinks",
  "juice",
  "coffee-tea",
  "energy-drinks",
]);
const ELECTRONICS_SLUGS = new Set([
  "electronics-accessories",
  "audio-visual-electronics",
  "computers-hardware",
  "mobile-devices",
  "wearable",
  "photography-video-equipment",
  "home-and-office-electronics",
  "device-accessories-addons",
]);
const APPAREL_SLUGS = new Set([
  "fashion",
  "fashion-accessories",
  "clothing",
  "footwear",
  "sport",
  "camping-outdoor",
  "garden-outdoor-living",
  "luggage-travel",
]);
const BOOK_MEDIA_SLUGS = new Set(["media-entertainment", "books-media", "books", "movies", "music"]);
const GAME_SLUGS = new Set(["gaming", "games", "games-entertainment", "consoles", "games-puzzles", "software"]);
const BABY_SLUGS = new Set(["baby", "baby-toddler", "baby-kids"]);
const FITMENT_SLUGS = new Set(["diy-automotive", "automotive-parts-accessories", "motorcycle-parts-accessories", "tools-machinery"]);
const HOME_SLUGS = new Set([
  "home-living",
  "household-cleaning",
  "equipment-appliances",
  "office-business-equipment",
  "bar-hospitality-supplies",
  "office-stationery",
  "stationery",
]);
const JEWELLERY_SLUGS = new Set(["jewellery", "jewelry"]);
const PET_SLUGS = new Set(["pets"]);
const INSTRUMENT_SLUGS = new Set(["musical-instruments-equipment"]);

const EXTRA_HOME_CATEGORY_SLUGS = new Set([
  "equipment-appliances",
  "household-cleaning",
  "home-living",
  "office-stationery",
  "stationery",
  "office-business-equipment",
  "bar-hospitality-supplies",
]);
const EXTRA_ELECTRONICS_CATEGORY_SLUGS = new Set([
  "binoculars-scopes",
  "device-accessories-addons",
  "mobile-devices",
  "wearable",
  "photography-video-equipment",
  "musical-instruments-equipment",
  "home-and-office-electronics",
]);
const HOSPITALITY_SUBCATEGORY_SLUGS = new Set([
  "glassware",
  "glass-bottles",
  "bar-tools",
  "cocktail-accessories",
  "straws-stirrers",
  "serviceware",
  "catering-disposables",
  "ice-buckets",
  "serveware",
  "tableware",
  "napkins-serviettes",
]);

function matches(set: Set<string>, categorySlug: string, subCategorySlug: string) {
  return set.has(categorySlug) || set.has(subCategorySlug);
}

export function getRelevantVariantMetadataGroups(category?: string | null, subCategory?: string | null) {
  const groups = new Set<string>(["Core options"]);
  const categorySlug = normalizeCatalogueSlug(category);
  const subCategorySlug = normalizeCatalogueSlug(subCategory);

  if (matches(BEAUTY_SLUGS, categorySlug, subCategorySlug)) groups.add("Beauty & personal care");
  if (matches(BEVERAGE_SLUGS, categorySlug, subCategorySlug)) groups.add("Beverages & grocery");
  if (matches(ELECTRONICS_SLUGS, categorySlug, subCategorySlug)) groups.add("Electronics & appliances");
  if (matches(APPAREL_SLUGS, categorySlug, subCategorySlug)) groups.add("Fashion & apparel");
  if (categorySlug === "footwear" || JEWELLERY_SLUGS.has(subCategorySlug) || JEWELLERY_SLUGS.has(categorySlug)) groups.add("Footwear & jewellery");
  if (matches(BOOK_MEDIA_SLUGS, categorySlug, subCategorySlug)) groups.add("Books & media");
  if (matches(GAME_SLUGS, categorySlug, subCategorySlug)) groups.add("Games & entertainment");
  if (matches(BABY_SLUGS, categorySlug, subCategorySlug)) groups.add("Baby & fitment");
  if (matches(FITMENT_SLUGS, categorySlug, subCategorySlug)) groups.add("Automotive & tools");

  if (["groceries-snacks", "non-perishable"].includes(categorySlug)) groups.add("Beverages & grocery");
  if (EXTRA_HOME_CATEGORY_SLUGS.has(categorySlug)) groups.add("Home & appliances");
  if (EXTRA_ELECTRONICS_CATEGORY_SLUGS.has(categorySlug)) groups.add("Electronics & appliances");
  if (categorySlug === "software") {
    groups.add("Games & entertainment");
    groups.add("Electronics & appliances");
  }
  if (PET_SLUGS.has(categorySlug)) groups.add("Pets");
  if (categorySlug === "luggage-travel") groups.add("Luggage & travel");
  if (["photography-video-equipment", "binoculars-scopes"].includes(categorySlug)) groups.add("Photography & video");
  if (INSTRUMENT_SLUGS.has(categorySlug)) groups.add("Musical instruments");

  if (["sport", "luggage-travel", "garden-outdoor-living", "camping-outdoor"].includes(categorySlug)) {
    groups.add("Fashion & apparel");
    groups.add("Home & appliances");
  }
  if (["toys", "pets"].includes(categorySlug)) {
    groups.add("Baby & fitment");
    groups.add("Home & appliances");
  }
  if (HOSPITALITY_SUBCATEGORY_SLUGS.has(subCategorySlug)) {
    groups.add("Beverages & grocery");
    groups.add("Home & appliances");
  }

  return groups;
}

const GROUP_FILTER_KEYS: Record<string, string[]> = {
  "Core options": ["color"],
  "Beauty & personal care": ["shade", "scent", "skinType", "hairType"],
  "Beverages & grocery": ["flavor", "abv", "containerType", "caffeineLevel", "sweetenerType"],
  "Electronics & appliances": ["storageCapacity", "memoryRam", "connectivity"],
  "Fashion & apparel": ["size", "material", "fit", "lengthSpec", "sleeveLength", "neckline", "rise", "pattern"],
  "Footwear & jewellery": ["material", "ringSize", "strapLength", "stoneType", "heelHeight", "sizeSystem"],
  "Books & media": ["bookFormat", "language", "readingAge", "subtitleLanguage", "editionType"],
  "Games & entertainment": ["gamePlatform", "gameEdition", "genre", "regionCode", "ageRating"],
  Pets: ["petSize", "petLifeStage", "breedSize", "petFoodType", "activityLevel"],
  "Luggage & travel": ["luggageSize", "shellType", "wheelCount", "closureType"],
  "Photography & video": ["cameraMount", "sensorFormat", "lensMount", "stabilization", "megapixels"],
  "Musical instruments": ["instrumentType", "stringCount", "bodySize", "pickupType"],
  "Baby & fitment": ["ageRange", "sizeRange", "feedingStage", "safetyStandard", "modelFitment"],
  "Automotive & tools": ["modelFitment", "sidePosition", "axlePosition", "vehicleMake"],
  "Home & appliances": ["energyRating", "installationType", "fuelType", "noiseLevel"],
};

export const VARIANT_METADATA_GROUP_ORDER = [
  "Core options",
  "Beauty & personal care",
  "Beverages & grocery",
  "Electronics & appliances",
  "Fashion & apparel",
  "Footwear & jewellery",
  "Books & media",
  "Games & entertainment",
  "Pets",
  "Luggage & travel",
  "Photography & video",
  "Musical instruments",
  "Baby & fitment",
  "Automotive & tools",
  "Home & appliances",
] as const;

export function getAttributeFilterGroup(key: string) {
  for (const [group, keys] of Object.entries(GROUP_FILTER_KEYS)) {
    if (keys.includes(key)) return group;
  }
  return "Core options";
}

export function getRelevantAttributeFilterKeys(category?: string | null, subCategory?: string | null) {
  const categorySlug = normalizeCatalogueSlug(category);
  const subCategorySlug = normalizeCatalogueSlug(subCategory);
  if (!categorySlug && !subCategorySlug) return null;

  const keys = new Set<string>();
  for (const group of getRelevantVariantMetadataGroups(category, subCategory)) {
    for (const key of GROUP_FILTER_KEYS[group] ?? []) keys.add(key);
  }
  keys.add("color");
  return keys;
}
