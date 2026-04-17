export type VariantAxisKey =
  | "color"
  | "size"
  | "storageCapacity"
  | "memoryRam"
  | "cpuModel"
  | "graphicsModel"
  | "screenSize"
  | "screenResolution"
  | "refreshRate"
  | "operatingSystem"
  | "batteryCapacity"
  | "powerOutput"
  | "cameraSpec"
  | "lensSpec"
  | "chipsetModel"
  | "ports"
  | "wirelessStandard"
  | "voltage"
  | "capacitySpec"
  | "dimensionsSpec"
  | "includedInBox"
  | "connectivity"
  | "compatibility"
  | "fit"
  | "lengthSpec"
  | "sleeveLength"
  | "neckline"
  | "rise"
  | "inseam"
  | "pattern"
  | "occasion"
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
  | "flavor"
  | "abv"
  | "containerType"
  | "caffeineLevel"
  | "sweetenerType"
  | "sizeSystem"
  | "material"
  | "ringSize"
  | "strapLength"
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
  | "luggageCapacity"
  | "shellType"
  | "wheelCount"
  | "closureType"
  | "cameraMount"
  | "sensorFormat"
  | "lensMount"
  | "stabilization"
  | "megapixels"
  | "instrumentType"
  | "keyCount"
  | "stringCount"
  | "bodySize"
  | "pickupType"
  | "ageRange"
  | "modelFitment"
  | "sizeRange"
  | "feedingStage"
  | "safetyStandard"
  | "engineCode"
  | "sidePosition"
  | "axlePosition"
  | "threadSize"
  | "vehicleMake"
  | "energyRating"
  | "installationType"
  | "fuelType"
  | "loadCapacity"
  | "waterPressure"
  | "waterUsage"
  | "noiseLevel";

export type VariantAxisDisplay = "image_tile" | "swatch" | "pill" | "card";

export type VariantLike = {
  variant_id?: string | number | null;
  color?: string | null;
  size?: string | null;
  storageCapacity?: string | null;
  memoryRam?: string | null;
  cpuModel?: string | null;
  graphicsModel?: string | null;
  screenSize?: string | null;
  screenResolution?: string | null;
  refreshRate?: string | null;
  operatingSystem?: string | null;
  batteryCapacity?: string | null;
  powerOutput?: string | null;
  cameraSpec?: string | null;
  lensSpec?: string | null;
  chipsetModel?: string | null;
  ports?: string | null;
  wirelessStandard?: string | null;
  voltage?: string | null;
  capacitySpec?: string | null;
  dimensionsSpec?: string | null;
  includedInBox?: string | null;
  connectivity?: string | null;
  compatibility?: string | null;
  fit?: string | null;
  lengthSpec?: string | null;
  sleeveLength?: string | null;
  neckline?: string | null;
  rise?: string | null;
  inseam?: string | null;
  pattern?: string | null;
  occasion?: string | null;
  shade?: string | null;
  scent?: string | null;
  finish?: string | null;
  spf?: string | null;
  fragranceFamily?: string | null;
  texture?: string | null;
  undertone?: string | null;
  coverage?: string | null;
  skinType?: string | null;
  hairType?: string | null;
  flavor?: string | null;
  abv?: string | null;
  containerType?: string | null;
  caffeineLevel?: string | null;
  sweetenerType?: string | null;
  sizeSystem?: string | null;
  material?: string | null;
  ringSize?: string | null;
  strapLength?: string | null;
  heelHeight?: string | null;
  stoneType?: string | null;
  bookFormat?: string | null;
  language?: string | null;
  readingAge?: string | null;
  subtitleLanguage?: string | null;
  editionType?: string | null;
  gamePlatform?: string | null;
  gameEdition?: string | null;
  genre?: string | null;
  regionCode?: string | null;
  ageRating?: string | null;
  petSize?: string | null;
  petLifeStage?: string | null;
  breedSize?: string | null;
  petFoodType?: string | null;
  activityLevel?: string | null;
  luggageSize?: string | null;
  luggageCapacity?: string | null;
  shellType?: string | null;
  wheelCount?: string | null;
  closureType?: string | null;
  cameraMount?: string | null;
  sensorFormat?: string | null;
  lensMount?: string | null;
  stabilization?: string | null;
  megapixels?: string | null;
  instrumentType?: string | null;
  keyCount?: string | null;
  stringCount?: string | null;
  bodySize?: string | null;
  pickupType?: string | null;
  ageRange?: string | null;
  modelFitment?: string | null;
  sizeRange?: string | null;
  feedingStage?: string | null;
  safetyStandard?: string | null;
  engineCode?: string | null;
  sidePosition?: string | null;
  axlePosition?: string | null;
  threadSize?: string | null;
  vehicleMake?: string | null;
  energyRating?: string | null;
  installationType?: string | null;
  fuelType?: string | null;
  loadCapacity?: string | null;
  waterPressure?: string | null;
  waterUsage?: string | null;
  noiseLevel?: string | null;
};

export type VariantSelection = Partial<Record<VariantAxisKey, string>>;

type AxisConfig = {
  key: VariantAxisKey;
  label: string;
  display: VariantAxisDisplay;
  alias?: string[];
};

export type VariantAxisOption = {
  key: string;
  rawValue: string;
  label: string;
  representativeVariantIndex: number;
  matchingVariantIndices: number[];
};

export type VariantAxis = {
  key: VariantAxisKey;
  label: string;
  display: VariantAxisDisplay;
  options: VariantAxisOption[];
};

export type VariantOptionMatrix = {
  axes: VariantAxis[];
};

const AXIS_CONFIGS: AxisConfig[] = [
  { key: "color", label: "Color", display: "image_tile", alias: ["colour"] },
  { key: "size", label: "Size", display: "pill" },
  { key: "storageCapacity", label: "Storage", display: "card" },
  { key: "memoryRam", label: "Memory", display: "card" },
  { key: "cpuModel", label: "CPU", display: "card" },
  { key: "graphicsModel", label: "Graphics", display: "card" },
  { key: "screenSize", label: "Screen Size", display: "card" },
  { key: "screenResolution", label: "Resolution", display: "card" },
  { key: "refreshRate", label: "Refresh Rate", display: "card" },
  { key: "operatingSystem", label: "Operating System", display: "card" },
  { key: "batteryCapacity", label: "Battery", display: "card" },
  { key: "powerOutput", label: "Power Output", display: "card" },
  { key: "cameraSpec", label: "Camera", display: "card" },
  { key: "lensSpec", label: "Lens", display: "card" },
  { key: "chipsetModel", label: "Chipset", display: "card" },
  { key: "ports", label: "Ports", display: "card" },
  { key: "wirelessStandard", label: "Wireless Standard", display: "card" },
  { key: "voltage", label: "Voltage", display: "card" },
  { key: "capacitySpec", label: "Capacity", display: "card" },
  { key: "dimensionsSpec", label: "Dimensions", display: "card" },
  { key: "includedInBox", label: "In The Box", display: "card" },
  { key: "connectivity", label: "Connectivity", display: "card" },
  { key: "compatibility", label: "Compatibility", display: "card" },
  { key: "fit", label: "Fit", display: "pill" },
  { key: "lengthSpec", label: "Length", display: "card" },
  { key: "sleeveLength", label: "Sleeve Length", display: "pill" },
  { key: "neckline", label: "Neckline", display: "pill" },
  { key: "rise", label: "Rise", display: "pill" },
  { key: "inseam", label: "Inseam", display: "card" },
  { key: "pattern", label: "Pattern", display: "pill" },
  { key: "occasion", label: "Occasion", display: "pill" },
  { key: "shade", label: "Shade", display: "swatch" },
  { key: "scent", label: "Scent", display: "pill" },
  { key: "finish", label: "Finish", display: "pill" },
  { key: "spf", label: "SPF", display: "card" },
  { key: "fragranceFamily", label: "Fragrance Family", display: "pill" },
  { key: "texture", label: "Texture", display: "pill" },
  { key: "undertone", label: "Undertone", display: "pill" },
  { key: "coverage", label: "Coverage", display: "pill" },
  { key: "skinType", label: "Skin Type", display: "pill" },
  { key: "hairType", label: "Hair Type", display: "pill" },
  { key: "flavor", label: "Flavor", display: "pill" },
  { key: "abv", label: "ABV", display: "card" },
  { key: "containerType", label: "Container", display: "card" },
  { key: "caffeineLevel", label: "Caffeine", display: "pill" },
  { key: "sweetenerType", label: "Sweetener", display: "pill" },
  { key: "sizeSystem", label: "Size System", display: "card" },
  { key: "material", label: "Material", display: "card" },
  { key: "ringSize", label: "Ring Size", display: "card" },
  { key: "strapLength", label: "Strap Length", display: "card" },
  { key: "heelHeight", label: "Heel Height", display: "card" },
  { key: "stoneType", label: "Stone Type", display: "pill" },
  { key: "bookFormat", label: "Format", display: "card" },
  { key: "language", label: "Language", display: "card" },
  { key: "readingAge", label: "Reading Age", display: "card" },
  { key: "subtitleLanguage", label: "Subtitle Language", display: "card" },
  { key: "editionType", label: "Edition", display: "card" },
  { key: "gamePlatform", label: "Platform", display: "card" },
  { key: "gameEdition", label: "Edition", display: "card" },
  { key: "genre", label: "Genre", display: "pill" },
  { key: "regionCode", label: "Region", display: "card" },
  { key: "ageRating", label: "Age Rating", display: "card" },
  { key: "petSize", label: "Pet Size", display: "pill" },
  { key: "petLifeStage", label: "Life Stage", display: "pill" },
  { key: "breedSize", label: "Breed Size", display: "pill" },
  { key: "petFoodType", label: "Food Type", display: "pill" },
  { key: "activityLevel", label: "Activity Level", display: "pill" },
  { key: "luggageSize", label: "Luggage Size", display: "card" },
  { key: "luggageCapacity", label: "Capacity", display: "card" },
  { key: "shellType", label: "Shell Type", display: "pill" },
  { key: "wheelCount", label: "Wheel Count", display: "card" },
  { key: "closureType", label: "Closure", display: "pill" },
  { key: "cameraMount", label: "Camera Mount", display: "card" },
  { key: "sensorFormat", label: "Sensor Format", display: "card" },
  { key: "lensMount", label: "Lens Mount", display: "card" },
  { key: "stabilization", label: "Stabilization", display: "pill" },
  { key: "megapixels", label: "Megapixels", display: "card" },
  { key: "instrumentType", label: "Instrument Type", display: "pill" },
  { key: "keyCount", label: "Key Count", display: "card" },
  { key: "stringCount", label: "String Count", display: "card" },
  { key: "bodySize", label: "Body Size", display: "pill" },
  { key: "pickupType", label: "Pickup Type", display: "pill" },
  { key: "ageRange", label: "Age Range", display: "card" },
  { key: "modelFitment", label: "Fitment", display: "card" },
  { key: "sizeRange", label: "Size Range", display: "card" },
  { key: "feedingStage", label: "Feeding Stage", display: "pill" },
  { key: "safetyStandard", label: "Safety Standard", display: "card" },
  { key: "engineCode", label: "Engine Code", display: "card" },
  { key: "sidePosition", label: "Side / Position", display: "card" },
  { key: "axlePosition", label: "Axle", display: "card" },
  { key: "threadSize", label: "Thread Size", display: "card" },
  { key: "vehicleMake", label: "Vehicle Make", display: "pill" },
  { key: "energyRating", label: "Energy Rating", display: "card" },
  { key: "installationType", label: "Installation Type", display: "card" },
  { key: "fuelType", label: "Fuel Type", display: "card" },
  { key: "loadCapacity", label: "Load Capacity", display: "card" },
  { key: "waterPressure", label: "Water Pressure", display: "card" },
  { key: "waterUsage", label: "Water Usage", display: "card" },
  { key: "noiseLevel", label: "Noise Level", display: "card" },
];

function normalizeOptionValue(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function formatColorValue(value?: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  if (lower === "#ffffff" || lower === "#fff") return "White";
  if (lower === "#000000" || lower === "#000") return "Black";
  if (lower === "#ff0000") return "Red";
  if (lower === "#00ff00") return "Green";
  if (lower === "#0000ff") return "Blue";
  return normalized;
}

export function formatVariantAxisValue(axisKey: VariantAxisKey, value?: string | null) {
  if (axisKey === "color") return formatColorValue(value);
  return String(value ?? "").trim();
}

function getAxisRawValue(variant: VariantLike, axisKey: VariantAxisKey) {
  return String(variant?.[axisKey] ?? "").trim();
}

export function buildVariantOptionMatrix(variants: VariantLike[] = []): VariantOptionMatrix {
  const axes: VariantAxis[] = AXIS_CONFIGS.map((config) => {
    const optionMap = new Map<string, VariantAxisOption>();
    variants.forEach((variant, index) => {
      const rawValue = getAxisRawValue(variant, config.key);
      if (!rawValue) return;
      const key = normalizeOptionValue(rawValue);
      const existing = optionMap.get(key);
      if (existing) {
        existing.matchingVariantIndices.push(index);
        return;
      }
      optionMap.set(key, {
        key,
        rawValue,
        label: formatVariantAxisValue(config.key, rawValue) || rawValue,
        representativeVariantIndex: index,
        matchingVariantIndices: [index],
      });
    });

    return {
      key: config.key,
      label: config.label,
      display: config.display,
      options: Array.from(optionMap.values()),
    };
  }).filter((axis) => axis.options.length > 1);

  return { axes };
}

export function getVariantSelectionFromVariant(
  variant: VariantLike | null | undefined,
  axes: VariantAxis[] = [],
): VariantSelection {
  const selection: VariantSelection = {};
  axes.forEach((axis) => {
    const rawValue = getAxisRawValue(variant ?? {}, axis.key);
    if (!rawValue) return;
    selection[axis.key] = normalizeOptionValue(rawValue);
  });
  return selection;
}

export function variantMatchesSelection(
  variant: VariantLike | null | undefined,
  selection: VariantSelection,
  axes: VariantAxis[] = [],
  ignoredAxisKey?: VariantAxisKey,
) {
  if (!variant) return false;
  return axes.every((axis) => {
    if (axis.key === ignoredAxisKey) return true;
    const wanted = selection[axis.key];
    if (!wanted) return true;
    return normalizeOptionValue(getAxisRawValue(variant, axis.key)) === wanted;
  });
}

export function getAvailableVariantIndexForOption(
  variants: VariantLike[] = [],
  axes: VariantAxis[] = [],
  selection: VariantSelection,
  axisKey: VariantAxisKey,
  optionKey: string,
) {
  const exactIndex = variants.findIndex((variant) => {
    if (!variantMatchesSelection(variant, selection, axes, axisKey)) return false;
    return normalizeOptionValue(getAxisRawValue(variant, axisKey)) === optionKey;
  });
  if (exactIndex >= 0) return exactIndex;

  return variants.findIndex(
    (variant) => normalizeOptionValue(getAxisRawValue(variant, axisKey)) === optionKey,
  );
}

export function isOptionAvailableForSelection(
  variants: VariantLike[] = [],
  axes: VariantAxis[] = [],
  selection: VariantSelection,
  axisKey: VariantAxisKey,
  optionKey: string,
) {
  return variants.some((variant) => {
    if (!variantMatchesSelection(variant, selection, axes, axisKey)) return false;
    return normalizeOptionValue(getAxisRawValue(variant, axisKey)) === optionKey;
  });
}
