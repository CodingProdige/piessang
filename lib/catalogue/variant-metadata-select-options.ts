export type SelectableVariantMetadataKey =
  | "size"
  | "shade"
  | "scent"
  | "finish"
  | "spf"
  | "fragranceFamily"
  | "texture"
  | "undertone"
  | "coverage"
  | "skinType"
  | "hairType"
  | "containerType"
  | "caffeineLevel"
  | "sweetenerType"
  | "storageCapacity"
  | "memoryRam"
  | "connectivity"
  | "fit"
  | "lengthSpec"
  | "sleeveLength"
  | "neckline"
  | "rise"
  | "pattern"
  | "occasion"
  | "sizeSystem"
  | "material"
  | "heelHeight"
  | "stoneType"
  | "bookFormat"
  | "language"
  | "readingAge"
  | "subtitleLanguage"
  | "editionType"
  | "gamePlatform"
  | "gameEdition"
  | "genre"
  | "regionCode"
  | "ageRating"
  | "petSize"
  | "petLifeStage"
  | "breedSize"
  | "petFoodType"
  | "activityLevel"
  | "luggageSize"
  | "shellType"
  | "wheelCount"
  | "closureType"
  | "cameraMount"
  | "sensorFormat"
  | "lensMount"
  | "stabilization"
  | "megapixels"
  | "instrumentType"
  | "stringCount"
  | "bodySize"
  | "pickupType"
  | "ageRange"
  | "sizeRange"
  | "feedingStage"
  | "safetyStandard"
  | "sidePosition"
  | "axlePosition"
  | "vehicleMake"
  | "energyRating"
  | "installationType"
  | "fuelType"
  | "noiseLevel";

export type VariantMetadataSelectOptionsConfig = Record<SelectableVariantMetadataKey, string[]>;

export const DEFAULT_VARIANT_METADATA_SELECT_OPTIONS: VariantMetadataSelectOptionsConfig = {
  size: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "One Size", "Custom"],
  shade: ["Light", "Medium", "Tan", "Deep", "Clear", "Universal", "Custom"],
  scent: ["Floral", "Fresh", "Citrus", "Woody", "Sweet", "Unscented", "Custom"],
  finish: ["Matte", "Dewy", "Natural", "Radiant", "Satin", "Glossy", "Custom"],
  spf: ["SPF 15", "SPF 30", "SPF 50", "Custom"],
  fragranceFamily: ["Floral", "Fresh", "Woody", "Citrus", "Oriental", "Gourmand", "Custom"],
  texture: ["Cream", "Gel", "Liquid", "Powder", "Stick", "Serum", "Custom"],
  undertone: ["Cool", "Neutral", "Warm", "Olive", "Custom"],
  coverage: ["Sheer", "Light", "Medium", "Full", "Buildable", "Custom"],
  skinType: ["All skin types", "Dry", "Oily", "Combination", "Sensitive", "Mature", "Custom"],
  hairType: ["All hair types", "Straight", "Wavy", "Curly", "Coily", "Dry or damaged", "Custom"],
  containerType: ["Bottle", "Can", "Carton", "Glass bottle", "Multipack", "Custom"],
  caffeineLevel: ["Caffeine free", "Low caffeine", "Regular caffeine", "High caffeine", "Custom"],
  sweetenerType: ["Sugar", "No added sugar", "Artificial sweetener", "Stevia", "Unsweetened", "Custom"],
  storageCapacity: ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB", "Custom"],
  memoryRam: ["2GB", "4GB", "8GB", "16GB", "32GB", "64GB", "Custom"],
  connectivity: ["Wi-Fi", "4G", "5G", "Bluetooth", "Wired", "Custom"],
  fit: ["Slim", "Regular", "Relaxed", "Oversized", "Tailored", "Custom"],
  lengthSpec: ["Crop", "Short", "Midi", "Long", "Floor length", "Custom"],
  sleeveLength: ["Sleeveless", "Short sleeve", "Three-quarter", "Long sleeve", "Custom"],
  neckline: ["Crew neck", "V-neck", "Collared", "Square neck", "Halter", "Off-shoulder", "Custom"],
  rise: ["Low rise", "Mid rise", "High rise", "Custom"],
  pattern: ["Solid", "Striped", "Printed", "Floral", "Check", "Graphic", "Custom"],
  occasion: ["Casual", "Formal", "Workwear", "Evening", "Sportswear", "Outdoor", "Custom"],
  sizeSystem: ["UK", "US", "EU", "CM", "Custom"],
  material: ["Leather", "Gold", "Silver", "Stainless steel", "Cotton", "Synthetic", "Wood", "Custom"],
  heelHeight: ["Flat", "Low heel", "Mid heel", "High heel", "Platform", "Custom"],
  stoneType: ["None", "Diamond", "Cubic zirconia", "Pearl", "Sapphire", "Emerald", "Custom"],
  bookFormat: ["Paperback", "Hardcover", "eBook", "Audiobook", "DVD", "Blu-ray", "CD", "Custom"],
  language: ["English", "Afrikaans", "Zulu", "Xhosa", "French", "Portuguese", "Custom"],
  readingAge: ["0-3 years", "4-7 years", "8-12 years", "Teens", "Adults", "Custom"],
  subtitleLanguage: ["English", "Afrikaans", "Zulu", "Xhosa", "French", "Portuguese", "Multiple", "Custom"],
  editionType: ["Standard", "Illustrated", "Collector's", "Workbook", "Special edition", "Custom"],
  gamePlatform: ["PlayStation 5", "PlayStation 4", "Xbox Series X|S", "Xbox One", "Nintendo Switch", "PC", "Custom"],
  gameEdition: ["Standard", "Deluxe", "Collector's", "Ultimate", "Bundle", "Custom"],
  genre: ["Action", "Adventure", "Racing", "Sports", "RPG", "Strategy", "Simulation", "Custom"],
  regionCode: ["Region Free", "PAL", "NTSC", "Global", "EU", "US", "Custom"],
  ageRating: ["E", "E10+", "T", "M", "18", "PG", "Custom"],
  petSize: ["XS", "Small", "Medium", "Large", "XL", "Custom"],
  petLifeStage: ["Puppy / Kitten", "Adult", "Senior", "All life stages", "Custom"],
  breedSize: ["Toy breed", "Small breed", "Medium breed", "Large breed", "Giant breed", "Custom"],
  petFoodType: ["Dry food", "Wet food", "Treats", "Supplement", "All food types", "Custom"],
  activityLevel: ["Low", "Moderate", "High", "Working / athletic", "Custom"],
  luggageSize: ["Cabin", "Medium", "Large", "Extra large", "Custom"],
  shellType: ["Soft shell", "Hard shell", "Hybrid", "Custom"],
  wheelCount: ["2 wheels", "4 wheels", "8 wheels", "No wheels", "Custom"],
  closureType: ["Zip", "Latch", "Frame", "Roll-top", "Drawstring", "Custom"],
  cameraMount: ["Canon EF", "Canon RF", "Nikon F", "Nikon Z", "Sony E", "Micro Four Thirds", "Fujifilm X", "Custom"],
  sensorFormat: ["Full frame", "APS-C", "Micro Four Thirds", "1-inch", "Medium format", "Custom"],
  lensMount: ["Canon EF", "Canon RF", "Nikon F", "Nikon Z", "Sony E", "Leica L", "Micro Four Thirds", "Custom"],
  stabilization: ["None", "Optical", "Sensor-shift", "Lens-based", "Gimbal", "Custom"],
  megapixels: ["12MP", "24MP", "32MP", "48MP", "64MP", "Custom"],
  instrumentType: ["Keyboard", "Guitar", "Bass", "Drums", "Microphone", "DJ controller", "Studio monitor", "Custom"],
  stringCount: ["4-string", "5-string", "6-string", "7-string", "12-string", "Custom"],
  bodySize: ["3/4", "Full size", "Concert", "Grand auditorium", "Jumbo", "Custom"],
  pickupType: ["None", "Single-coil", "Humbucker", "Piezo", "Active", "Custom"],
  ageRange: ["0-3 months", "3-6 months", "6-12 months", "12-24 months", "2-4 years", "Custom"],
  sizeRange: ["Newborn", "0-3 months", "3-6 months", "6-12 months", "1-2 years", "Custom"],
  feedingStage: ["Stage 1", "Stage 2", "Stage 3", "Toddler", "Custom"],
  safetyStandard: ["EN 1888", "ECE R129", "SABS approved", "BPA free", "Custom"],
  sidePosition: ["Front left", "Front right", "Rear left", "Rear right", "Front", "Rear", "Left", "Right", "Inner", "Outer", "Custom"],
  axlePosition: ["Front axle", "Rear axle", "Both axles", "Custom"],
  vehicleMake: ["Toyota", "Volkswagen", "Ford", "BMW", "Mercedes-Benz", "Nissan", "Universal", "Custom"],
  energyRating: ["A+++", "A++", "A+", "A", "B", "C", "D", "Custom"],
  installationType: ["Freestanding", "Built-in", "Integrated", "Wall-mounted", "Countertop", "Custom"],
  fuelType: ["Electric", "Gas", "Dual fuel", "Battery", "Solar", "Custom"],
  noiseLevel: ["Quiet", "Low noise", "Standard", "High performance", "Custom"],
};

export const VARIANT_METADATA_SELECT_FIELD_DEFS: Array<{
  key: SelectableVariantMetadataKey;
  label: string;
  group: string;
}> = [
  { key: "size", label: "Size", group: "Core options" },
  { key: "shade", label: "Shade", group: "Beauty & personal care" },
  { key: "scent", label: "Scent", group: "Beauty & personal care" },
  { key: "finish", label: "Finish", group: "Beauty & personal care" },
  { key: "spf", label: "SPF", group: "Beauty & personal care" },
  { key: "fragranceFamily", label: "Fragrance family", group: "Beauty & personal care" },
  { key: "texture", label: "Texture", group: "Beauty & personal care" },
  { key: "undertone", label: "Undertone", group: "Beauty & personal care" },
  { key: "coverage", label: "Coverage", group: "Beauty & personal care" },
  { key: "skinType", label: "Skin type", group: "Beauty & personal care" },
  { key: "hairType", label: "Hair type", group: "Beauty & personal care" },
  { key: "containerType", label: "Container type", group: "Beverages & grocery" },
  { key: "caffeineLevel", label: "Caffeine level", group: "Beverages & grocery" },
  { key: "sweetenerType", label: "Sweetener type", group: "Beverages & grocery" },
  { key: "storageCapacity", label: "Storage", group: "Electronics & appliances" },
  { key: "memoryRam", label: "Memory (RAM)", group: "Electronics & appliances" },
  { key: "connectivity", label: "Connectivity", group: "Electronics & appliances" },
  { key: "fit", label: "Fit", group: "Fashion & apparel" },
  { key: "lengthSpec", label: "Length", group: "Fashion & apparel" },
  { key: "sleeveLength", label: "Sleeve length", group: "Fashion & apparel" },
  { key: "neckline", label: "Neckline", group: "Fashion & apparel" },
  { key: "rise", label: "Rise", group: "Fashion & apparel" },
  { key: "pattern", label: "Pattern", group: "Fashion & apparel" },
  { key: "occasion", label: "Occasion", group: "Fashion & apparel" },
  { key: "sizeSystem", label: "Size system", group: "Footwear & jewellery" },
  { key: "material", label: "Material", group: "Footwear & jewellery" },
  { key: "heelHeight", label: "Heel height", group: "Footwear & jewellery" },
  { key: "stoneType", label: "Stone type", group: "Footwear & jewellery" },
  { key: "bookFormat", label: "Format", group: "Books & media" },
  { key: "language", label: "Language", group: "Books & media" },
  { key: "readingAge", label: "Reading age", group: "Books & media" },
  { key: "subtitleLanguage", label: "Subtitle language", group: "Books & media" },
  { key: "editionType", label: "Edition type", group: "Books & media" },
  { key: "gamePlatform", label: "Platform", group: "Games & entertainment" },
  { key: "gameEdition", label: "Edition", group: "Games & entertainment" },
  { key: "genre", label: "Genre", group: "Games & entertainment" },
  { key: "regionCode", label: "Region", group: "Games & entertainment" },
  { key: "ageRating", label: "Age rating", group: "Games & entertainment" },
  { key: "petSize", label: "Pet size", group: "Pets" },
  { key: "petLifeStage", label: "Life stage", group: "Pets" },
  { key: "breedSize", label: "Breed size", group: "Pets" },
  { key: "petFoodType", label: "Food type", group: "Pets" },
  { key: "activityLevel", label: "Activity level", group: "Pets" },
  { key: "luggageSize", label: "Luggage size", group: "Luggage & travel" },
  { key: "shellType", label: "Shell type", group: "Luggage & travel" },
  { key: "wheelCount", label: "Wheel count", group: "Luggage & travel" },
  { key: "closureType", label: "Closure type", group: "Luggage & travel" },
  { key: "cameraMount", label: "Camera mount", group: "Photography & video" },
  { key: "sensorFormat", label: "Sensor format", group: "Photography & video" },
  { key: "lensMount", label: "Lens mount", group: "Photography & video" },
  { key: "stabilization", label: "Stabilization", group: "Photography & video" },
  { key: "megapixels", label: "Megapixels", group: "Photography & video" },
  { key: "instrumentType", label: "Instrument type", group: "Musical instruments" },
  { key: "stringCount", label: "String count", group: "Musical instruments" },
  { key: "bodySize", label: "Body size", group: "Musical instruments" },
  { key: "pickupType", label: "Pickup type", group: "Musical instruments" },
  { key: "ageRange", label: "Age range", group: "Baby & fitment" },
  { key: "sizeRange", label: "Size range", group: "Baby & fitment" },
  { key: "feedingStage", label: "Feeding stage", group: "Baby & fitment" },
  { key: "safetyStandard", label: "Safety standard", group: "Baby & fitment" },
  { key: "sidePosition", label: "Side / position", group: "Automotive & tools" },
  { key: "axlePosition", label: "Axle", group: "Automotive & tools" },
  { key: "vehicleMake", label: "Vehicle make", group: "Automotive & tools" },
  { key: "energyRating", label: "Energy rating", group: "Home & appliances" },
  { key: "installationType", label: "Installation type", group: "Home & appliances" },
  { key: "fuelType", label: "Fuel type", group: "Home & appliances" },
  { key: "noiseLevel", label: "Noise level", group: "Home & appliances" },
];

export function sanitizeVariantMetadataSelectOptionsConfig(input?: Partial<Record<string, unknown>>) {
  const result = { ...DEFAULT_VARIANT_METADATA_SELECT_OPTIONS } as VariantMetadataSelectOptionsConfig;
  for (const [key, defaults] of Object.entries(DEFAULT_VARIANT_METADATA_SELECT_OPTIONS) as Array<[SelectableVariantMetadataKey, string[]]>) {
    const source = Array.isArray(input?.[key]) ? (input?.[key] as unknown[]) : defaults;
    const next = source.map((item) => String(item ?? "").trim()).filter(Boolean);
    result[key] = next.length ? next : defaults;
  }
  return result;
}
