import { normalizeMoneyAmount } from "@/lib/money";
import { getFulfillmentFee, type FulfillmentFeeTable } from "@/lib/marketplace/fulfillment-fees";

export type MarketplaceFeeRule =
  | {
      kind: "fixed";
      percent: number;
      label?: string;
      note?: string;
    }
  | {
      kind: "range";
      minPercent: number;
      maxPercent: number;
      estimatePercent?: number;
      label?: string;
      note?: string;
    }
  | {
      kind: "tiers";
      tiers: Array<{
        minPriceIncl?: number;
        maxPriceIncl?: number;
        percent: number;
        label?: string;
      }>;
      label?: string;
      note?: string;
    };

export type MarketplaceFeeTier = {
  minPriceIncl?: number;
  maxPriceIncl?: number;
  percent: number;
  label?: string;
};

export type MarketplaceVariantLogistics = {
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  monthlySales30d: number;
  stockQty: number;
  warehouseId: string | null;
  parcelPreset?: string | null;
  shippingClass?: string | null;
};

export type MarketplaceSubCategory = {
  slug: string;
  title: string;
  feeRule?: MarketplaceFeeRule;
  note?: string;
};

export type MarketplaceCategory = {
  slug: string;
  title: string;
  feeRule?: MarketplaceFeeRule;
  subCategories: MarketplaceSubCategory[];
};

export type MarketplaceFeeConfig = {
  version: string;
  currency: string;
  handlingFeeIncl: number;
  stockCoverThresholdDays: number;
  categories: MarketplaceCategory[];
  fulfilment: {
    handlingFeeIncl: number;
    rows?: Array<{
      id?: string;
      label: string;
      minVolumeCm3?: number;
      maxVolumeCm3?: number;
      prices: {
        light: number;
        heavy: number;
        heavyPlus: number;
        veryHeavy: number;
      };
      isActive?: boolean;
    }>;
  };
  storage: {
    thresholdDays: number;
    bands: Array<{
      label: string;
      minVolumeCm3?: number;
      maxVolumeCm3?: number;
      overstockedFeeIncl: number;
    }>;
  };
};

export type MarketplaceFeeSnapshot = {
  successFeePercent: number;
  successFeeIncl: number;
  successFeeVatIncl: number;
  fulfilmentFeeIncl: number;
  fulfilmentFeeExclVat: number;
  handlingFeeIncl: number;
  storageFeeIncl: number;
  storageFeeExclVat: number;
  totalFeesIncl: number;
  totalMarketplaceFees: number;
  totalWarehouseFeesExclVat: number;
  volumeCm3: number;
  sizeBand: string | null;
  weightBand: string | null;
  storageBand: string | null;
  stockCoverDays: number | null;
  overstocked: boolean;
  successFeeRule: MarketplaceFeeRule;
  fulfillmentMode: "seller" | "bevgo";
  configVersion: string | null;
};

const fixed = (percent: number, label?: string, note?: string): MarketplaceFeeRule => ({
  kind: "fixed",
  percent,
  label,
  note,
});

const range = (minPercent: number, maxPercent: number, estimatePercent?: number, label?: string, note?: string): MarketplaceFeeRule => ({
  kind: "range",
  minPercent,
  maxPercent,
  estimatePercent,
  label,
  note,
});

const tiers = (
  tierList: MarketplaceFeeTier[],
  label?: string,
  note?: string,
): MarketplaceFeeRule => ({
  kind: "tiers",
  tiers: tierList,
  label,
  note,
});

export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  {
    slug: "beverages",
    title: "Beverages",
    feeRule: fixed(8, "Beverages"),
    subCategories: [
      { slug: "soft-drinks", title: "Soft Drinks", feeRule: fixed(8) },
      { slug: "water", title: "Water", feeRule: fixed(8) },
      { slug: "juices", title: "Juices", feeRule: fixed(8) },
      { slug: "energy-drinks", title: "Energy Drinks", feeRule: fixed(8) },
      { slug: "sport-drinks", title: "Sport Drinks", feeRule: fixed(8) },
      { slug: "mixers", title: "Mixers", feeRule: fixed(8) },
      { slug: "coffee-tea", title: "Coffee & Tea", feeRule: fixed(10) },
      { slug: "milk-drinks", title: "Milk Drinks", feeRule: fixed(8) },
      { slug: "cordials-syrups", title: "Cordials & Syrups", feeRule: fixed(8) },
    ],
  },
  {
    slug: "alcohol-liquor",
    title: "Alcohol & Liquor",
    feeRule: fixed(7, "Alcohol & Liquor"),
    subCategories: [
      { slug: "beer", title: "Beer", feeRule: fixed(7) },
      { slug: "cider", title: "Cider", feeRule: fixed(7) },
      { slug: "wine", title: "Wine", feeRule: fixed(7) },
      { slug: "spirits", title: "Spirits", feeRule: fixed(7) },
      { slug: "whisky", title: "Whisky", feeRule: fixed(7) },
      { slug: "whiskey", title: "Whiskey", feeRule: fixed(7) },
      { slug: "vodka", title: "Vodka", feeRule: fixed(7) },
      { slug: "gin", title: "Gin", feeRule: fixed(7) },
      { slug: "rum", title: "Rum", feeRule: fixed(7) },
      { slug: "tequila", title: "Tequila", feeRule: fixed(7) },
      { slug: "brandy", title: "Brandy", feeRule: fixed(7) },
      { slug: "cognac", title: "Cognac", feeRule: fixed(10) },
      { slug: "liqueurs", title: "Liqueurs", feeRule: fixed(7) },
      { slug: "aperitifs", title: "Aperitifs", feeRule: fixed(7) },
      { slug: "fortified-wine", title: "Fortified Wine", feeRule: fixed(7) },
      { slug: "ready-to-drink", title: "Ready to Drink", feeRule: fixed(7) },
      { slug: "craft-beer", title: "Craft Beer", feeRule: fixed(7) },
      { slug: "imported-beer", title: "Imported Beer", feeRule: fixed(7) },
      { slug: "sparkling-wine", title: "Sparkling Wine", feeRule: fixed(7) },
      { slug: "champagne", title: "Champagne", feeRule: fixed(7) },
      { slug: "sake", title: "Sake", feeRule: fixed(7) },
    ],
  },
  {
    slug: "groceries-snacks",
    title: "Groceries & Snacks",
    feeRule: fixed(8, "Groceries & Snacks"),
    subCategories: [
      { slug: "snacks", title: "Snacks", feeRule: fixed(8) },
      { slug: "crisps-chips", title: "Crisps & Chips", feeRule: fixed(8) },
      { slug: "biscuits-cookies", title: "Biscuits & Cookies", feeRule: fixed(8) },
      { slug: "nuts-dried-fruit", title: "Nuts & Dried Fruit", feeRule: fixed(8) },
      { slug: "pantry", title: "Pantry", feeRule: fixed(8) },
      { slug: "breakfast", title: "Breakfast", feeRule: fixed(8) },
      { slug: "confectionery", title: "Confectionery", feeRule: fixed(8) },
      { slug: "sauces-condiments", title: "Sauces & Condiments", feeRule: fixed(8) },
      { slug: "oil-vinegar", title: "Oil & Vinegar", feeRule: fixed(8) },
      { slug: "rice-grains", title: "Rice & Grains", feeRule: fixed(8) },
      { slug: "pasta-noodles", title: "Pasta & Noodles", feeRule: fixed(8) },
      { slug: "canned-food", title: "Canned Food", feeRule: fixed(8) },
      { slug: "spreads-jams", title: "Spreads & Jams", feeRule: fixed(8) },
      { slug: "baking", title: "Baking", feeRule: fixed(8) },
      { slug: "dairy", title: "Dairy", feeRule: fixed(8) },
      { slug: "plant-based", title: "Plant Based", feeRule: fixed(8) },
      { slug: "frozen", title: "Frozen", feeRule: fixed(8) },
    ],
  },
  {
    slug: "household-cleaning",
    title: "Household & Cleaning",
    feeRule: fixed(8, "Household & Cleaning"),
    subCategories: [
      { slug: "cleaning", title: "Cleaning", feeRule: fixed(8) },
      { slug: "paper-products", title: "Paper Products", feeRule: fixed(8) },
      { slug: "disposables", title: "Disposables", feeRule: fixed(8) },
      { slug: "laundry", title: "Laundry", feeRule: fixed(8) },
      { slug: "bathroom", title: "Bathroom", feeRule: fixed(8) },
      { slug: "air-fresheners", title: "Air Fresheners", feeRule: fixed(8) },
      { slug: "dishwashing", title: "Dishwashing", feeRule: fixed(8) },
      { slug: "chemicals", title: "Chemicals", feeRule: fixed(8) },
      { slug: "bin-bags", title: "Bin Bags", feeRule: fixed(8) },
      { slug: "kitchen-cleaning", title: "Kitchen Cleaning", feeRule: fixed(8) },
    ],
  },
  {
    slug: "health-personal-care",
    title: "Health & Personal Care",
    feeRule: range(10, 14, 12, "Health & Personal Care"),
    subCategories: [
      { slug: "personal-care", title: "Personal Care", feeRule: fixed(10) },
      { slug: "oral-care", title: "Oral Care", feeRule: fixed(10) },
      { slug: "first-aid", title: "First Aid", feeRule: fixed(11) },
      { slug: "wellness", title: "Wellness", feeRule: fixed(12) },
      { slug: "beauty", title: "Beauty", feeRule: fixed(12) },
      { slug: "baby-care", title: "Baby Care", feeRule: fixed(12) },
      { slug: "feminine-care", title: "Feminine Care", feeRule: fixed(10) },
      { slug: "shaving-grooming", title: "Shaving & Grooming", feeRule: fixed(12) },
    ],
  },
  {
    slug: "baby-toddler",
    title: "Baby & Toddler",
    feeRule: range(12, 15, 14, "Baby & Toddler"),
    subCategories: [
      { slug: "baby-care", title: "Baby Care", feeRule: fixed(14) },
      { slug: "feeding", title: "Feeding", feeRule: fixed(14) },
      { slug: "nappies-wipes", title: "Nappies & Wipes", feeRule: fixed(14) },
      { slug: "toys", title: "Toys", feeRule: fixed(12) },
      { slug: "baby-food", title: "Baby Food", feeRule: fixed(12) },
      { slug: "baby-bath", title: "Baby Bath", feeRule: fixed(14) },
      { slug: "baby-health", title: "Baby Health", feeRule: fixed(14) },
      { slug: "baby-clothing", title: "Baby Clothing", feeRule: fixed(15) },
    ],
  },
  {
    slug: "office-stationery",
    title: "Office & Stationery",
    feeRule: range(10, 14, 10, "Office & Stationery"),
    subCategories: [
      { slug: "stationery", title: "Stationery", feeRule: fixed(10) },
      { slug: "paper", title: "Paper", feeRule: fixed(10) },
      { slug: "office-supplies", title: "Office Supplies", feeRule: fixed(10) },
      { slug: "printing", title: "Printing", feeRule: fixed(12) },
      { slug: "packaging", title: "Packaging", feeRule: fixed(10) },
      { slug: "ink-toner", title: "Ink & Toner", feeRule: fixed(10) },
      { slug: "filing", title: "Filing", feeRule: fixed(10) },
      { slug: "writing-tools", title: "Writing Tools", feeRule: fixed(10) },
    ],
  },
  {
    slug: "bar-hospitality-supplies",
    title: "Bar & Hospitality Supplies",
    feeRule: fixed(10, "Bar & Hospitality Supplies"),
    subCategories: [
      { slug: "glassware", title: "Glassware", feeRule: fixed(10) },
      { slug: "glass-bottles", title: "Glass Bottles", feeRule: fixed(10) },
      { slug: "bar-tools", title: "Bar Tools", feeRule: fixed(10) },
      { slug: "cocktail-accessories", title: "Cocktail Accessories", feeRule: fixed(10) },
      { slug: "straws-stirrers", title: "Straws & Stirrers", feeRule: fixed(10) },
      { slug: "serviceware", title: "Serviceware", feeRule: fixed(10) },
      { slug: "catering-disposables", title: "Catering Disposables", feeRule: fixed(10) },
      { slug: "ice-buckets", title: "Ice Buckets", feeRule: fixed(10) },
      { slug: "serveware", title: "Serveware", feeRule: fixed(10) },
      { slug: "tableware", title: "Tableware", feeRule: fixed(10) },
      { slug: "napkins-serviettes", title: "Napkins & Serviettes", feeRule: fixed(10) },
    ],
  },
  {
    slug: "equipment-appliances",
    title: "Equipment & Appliances",
    feeRule: range(10, 12, 10, "Equipment & Appliances"),
    subCategories: [
      { slug: "beverage-equipment", title: "Beverage Equipment", feeRule: fixed(10) },
      { slug: "coffee-machines", title: "Coffee Machines", feeRule: fixed(10) },
      { slug: "refrigeration", title: "Refrigeration", feeRule: fixed(10) },
      { slug: "ice-machines", title: "Ice Machines", feeRule: fixed(10) },
      { slug: "kitchen-equipment", title: "Kitchen Equipment", feeRule: fixed(10) },
      { slug: "small-appliances", title: "Small Appliances", feeRule: fixed(10) },
      { slug: "pos-accessories", title: "POS & Accessories", feeRule: fixed(10) },
      { slug: "dispensers", title: "Dispensers", feeRule: fixed(10) },
      { slug: "water-dispensers", title: "Water Dispensers", feeRule: fixed(10) },
    ],
  },
  {
    slug: "electronics-accessories",
    title: "Electronics & Accessories",
    feeRule: fixed(12, "Electronics & Accessories"),
    subCategories: [
      { slug: "accessories", title: "Accessories", feeRule: fixed(12) },
      { slug: "audio", title: "Audio", feeRule: fixed(12) },
      { slug: "computing", title: "Computing", feeRule: fixed(12) },
      { slug: "charging", title: "Charging", feeRule: fixed(12) },
      { slug: "networking", title: "Networking", feeRule: fixed(12) },
      { slug: "cables-adapters", title: "Cables & Adapters", feeRule: fixed(12) },
      { slug: "headphones", title: "Headphones", feeRule: fixed(12) },
    ],
  },
  {
    slug: "audio-visual-electronics",
    title: "Audio & Visual Electronics",
    feeRule: range(6, 12, 8, "Audio & Visual Electronics"),
    subCategories: [
      { slug: "radio", title: "Radio", feeRule: fixed(6) },
      { slug: "amplifiers", title: "Amplifiers", feeRule: fixed(7) },
      { slug: "microphones", title: "Microphones", feeRule: fixed(7) },
      { slug: "mp3-players", title: "MP3 Players", feeRule: fixed(7) },
      { slug: "hi-fi-related", title: "Hi-Fi Related", feeRule: fixed(8) },
      { slug: "home-audio", title: "Home Audio", feeRule: fixed(8) },
      { slug: "speakers", title: "Speakers", feeRule: fixed(8) },
      { slug: "headphones-headsets", title: "Headphones & Headsets", feeRule: fixed(12) },
      {
        slug: "tv-audio",
        title: "TV & Audio",
        feeRule: tiers(
          [
            { maxPriceIncl: 2999, percent: 5.5 },
            { minPriceIncl: 3000, maxPriceIncl: 29999, percent: 7 },
            { minPriceIncl: 30000, maxPriceIncl: 49999, percent: 8.5 },
            { minPriceIncl: 50000, percent: 9.5 },
          ],
          "TV & Audio",
        ),
      },
    ],
  },
  {
    slug: "baby",
    title: "Baby",
    feeRule: range(12, 15, 14, "Baby"),
    subCategories: [
      { slug: "baby-food", title: "Baby Food", feeRule: fixed(12) },
      { slug: "mom-baby-care", title: "Mom & Baby Care", feeRule: fixed(12) },
      { slug: "baby-food-nutrition", title: "Baby Food & Nutrition", feeRule: fixed(12) },
      { slug: "baby-equipment-furniture", title: "Baby Equipment & Furniture", feeRule: fixed(14) },
      { slug: "nappies-changing", title: "Nappies & Changing", feeRule: fixed(14) },
      { slug: "baby-clothing", title: "Baby Clothing", feeRule: fixed(15) },
      { slug: "other", title: "Other", feeRule: fixed(14) },
    ],
  },
  {
    slug: "beauty-personal-care",
    title: "Beauty & Personal Care",
    feeRule: range(12, 15, 12, "Beauty & Personal Care"),
    subCategories: [
      { slug: "body-care", title: "Body Care", feeRule: fixed(12) },
      { slug: "hair-care", title: "Hair Care", feeRule: fixed(12) },
      { slug: "skin-care", title: "Skin Care", feeRule: fixed(12) },
      { slug: "cosmetics", title: "Cosmetics", feeRule: fixed(14) },
      { slug: "fragrances", title: "Fragrances", feeRule: fixed(15) },
      { slug: "other", title: "Other", feeRule: fixed(12) },
    ],
  },
  {
    slug: "binoculars-scopes",
    title: "Binoculars & Scopes",
    feeRule: range(8, 12, 10, "Binoculars & Scopes"),
    subCategories: [
      { slug: "microscopes", title: "Microscopes", feeRule: fixed(8) },
      { slug: "monoculars", title: "Monoculars", feeRule: fixed(8) },
      { slug: "spotting-scopes", title: "Spotting Scopes", feeRule: fixed(8) },
      { slug: "telescopes", title: "Telescopes", feeRule: fixed(8) },
      { slug: "binoculars", title: "Binoculars", feeRule: fixed(10) },
      { slug: "range-finders", title: "Range Finders", feeRule: fixed(10) },
      { slug: "accessories", title: "Accessories", feeRule: fixed(12) },
      { slug: "other", title: "Other", feeRule: fixed(12) },
    ],
  },
  {
    slug: "certified-pre-owned-electronics",
    title: "Certified Pre-Owned Electronics",
    feeRule: fixed(10, "Certified Pre-Owned Electronics"),
    subCategories: [
      { slug: "audio", title: "Certified Pre-Owned Audio", feeRule: fixed(10) },
      { slug: "camera", title: "Certified Pre-Owned Camera", feeRule: fixed(10) },
      { slug: "camera-lenses", title: "Certified Pre-Owned Camera Lenses", feeRule: fixed(10) },
      { slug: "laptops", title: "Certified Pre-Owned Laptops", feeRule: fixed(10) },
      { slug: "mobile-devices", title: "Certified Pre-Owned Mobile Devices", feeRule: fixed(10) },
      { slug: "pcs", title: "Certified Pre-Owned PC’s", feeRule: fixed(10) },
      { slug: "printers", title: "Certified Pre-Owned Printers", feeRule: fixed(10) },
      { slug: "wearables", title: "Certified Pre-Owned Wearables", feeRule: fixed(10) },
      { slug: "other", title: "Other", feeRule: fixed(10) },
    ],
  },
  {
    slug: "pre-loved",
    title: "Pre-Loved",
    feeRule: fixed(10, "Pre-Loved"),
    subCategories: [
      { slug: "electronics", title: "Electronics", feeRule: fixed(10) },
      { slug: "fashion-accessories", title: "Fashion & Accessories", feeRule: fixed(10) },
      { slug: "home-living", title: "Home & Living", feeRule: fixed(10) },
      { slug: "collectibles", title: "Collectibles", feeRule: fixed(10) },
      { slug: "books-media", title: "Books & Media", feeRule: fixed(10) },
      { slug: "sports-outdoor", title: "Sports & Outdoor", feeRule: fixed(10) },
      { slug: "baby-kids", title: "Baby & Kids", feeRule: fixed(10) },
      { slug: "other", title: "Other", feeRule: fixed(10) },
    ],
  },
  {
    slug: "computers-hardware",
    title: "Computers & Hardware",
    feeRule: range(5, 10, 7, "Computers & Hardware"),
    subCategories: [
      { slug: "computer-components", title: "Computer Components", feeRule: fixed(7) },
      { slug: "computer-monitors-accessories", title: "Computer Monitors & Accessories", feeRule: fixed(6) },
      { slug: "computers-laptops", title: "Computers & Laptops", feeRule: fixed(6) },
      { slug: "data-storage", title: "Data Storage", feeRule: fixed(8) },
      { slug: "desktop-computers-workstations", title: "Desktop Computers & Workstations", feeRule: fixed(7) },
      { slug: "laptop-accessories", title: "Laptop Accessories", feeRule: fixed(10) },
      { slug: "networking", title: "Networking", feeRule: fixed(7) },
      { slug: "software", title: "Software", feeRule: fixed(5) },
      { slug: "other", title: "Other", feeRule: fixed(7) },
    ],
  },
  {
    slug: "device-accessories-addons",
    title: "Device Accessories & Add-ons",
    feeRule: range(12, 14, 12, "Device Accessories & Add-ons"),
    subCategories: [
      { slug: "electronic-accessories", title: "Electronic Accessories", feeRule: fixed(12) },
      { slug: "smart-accessories", title: "Smart Accessories", feeRule: fixed(12) },
      { slug: "tablet-ereader-accessories", title: "Tablet & E-reader Accessories", feeRule: fixed(12) },
      { slug: "other", title: "Other", feeRule: fixed(12) },
    ],
  },
  {
    slug: "fashion-accessories",
    title: "Fashion & Accessories",
    feeRule: fixed(15, "Fashion & Accessories"),
    subCategories: [
      { slug: "clothing-footwear", title: "Clothing & Footwear", feeRule: fixed(15) },
      { slug: "footwear-accessories", title: "Footwear & Accessories", feeRule: fixed(15) },
      { slug: "jewellery-watches", title: "Jewellery & Watches", feeRule: tiers([
        { maxPriceIncl: 950, percent: 18 },
        { minPriceIncl: 951, percent: 10 },
      ], "Jewellery & Watches") },
      { slug: "bags", title: "Bags", feeRule: fixed(15) },
      { slug: "other", title: "Other", feeRule: fixed(15) },
    ],
  },
  {
    slug: "gaming",
    title: "Gaming",
    feeRule: range(5.5, 15, 10, "Gaming"),
    subCategories: [
      { slug: "games", title: "Games", feeRule: fixed(5.5) },
      { slug: "gaming-accessories", title: "Gaming Accessories", feeRule: fixed(10) },
      { slug: "consoles", title: "Consoles", feeRule: fixed(5.5) },
      { slug: "gaming-chairs", title: "Gaming Chairs", feeRule: fixed(12) },
      { slug: "merchandise", title: "Merchandise", feeRule: fixed(15) },
      { slug: "other", title: "Other", feeRule: fixed(10) },
    ],
  },
  {
    slug: "garden-outdoor-living",
    title: "Garden & Outdoor Living",
    feeRule: range(12, 14, 12, "Garden & Outdoor Living"),
    subCategories: [
      { slug: "garden-outdoor-consumables", title: "Garden & Outdoor Consumables", feeRule: fixed(12) },
      { slug: "braais-outdoor-cooking", title: "Braais & Outdoor Cooking", feeRule: fixed(13) },
      { slug: "equipment", title: "Equipment", feeRule: fixed(14) },
      { slug: "patio", title: "Patio", feeRule: fixed(14) },
      { slug: "pool-spa", title: "Pool & Spa", feeRule: fixed(14) },
      { slug: "lawn-mowers-power-tools", title: "Lawn Mowers & Power Tools", feeRule: fixed(12) },
      { slug: "other", title: "Other", feeRule: fixed(14) },
    ],
  },
  {
    slug: "health",
    title: "Health",
    feeRule: range(10, 12, 10, "Health"),
    subCategories: [
      { slug: "health-fmcg", title: "Health FMCG", feeRule: fixed(10) },
      { slug: "personal-care-fmcg", title: "Personal Care FMCG", feeRule: fixed(10) },
      { slug: "health-care-devices", title: "Health Care Devices", feeRule: fixed(11) },
      { slug: "personal-care-devices", title: "Personal Care Devices", feeRule: fixed(12) },
      { slug: "other", title: "Other", feeRule: fixed(10) },
    ],
  },
  {
    slug: "home-living",
    title: "Home & Living",
    feeRule: range(10, 15, 15, "Home & Living"),
    subCategories: [
      { slug: "bedroom", title: "Bedroom", feeRule: fixed(15) },
      { slug: "bathroom", title: "Bathroom", feeRule: fixed(15) },
      { slug: "dining-entertainment", title: "Dining & Entertainment", feeRule: fixed(15) },
      { slug: "furniture", title: "Furniture", feeRule: fixed(15) },
      { slug: "home-decor", title: "Home Decor", feeRule: fixed(15) },
      { slug: "kitchen", title: "Kitchen", feeRule: fixed(15) },
      { slug: "office-accessories", title: "Office Accessories", feeRule: fixed(15) },
      { slug: "large-appliances", title: "Large Appliances", feeRule: fixed(8) },
      { slug: "small-appliances", title: "Small Appliances", feeRule: fixed(10) },
      { slug: "smart-home-connected-living", title: "Smart Home & Connected Living", feeRule: fixed(10) },
      { slug: "lighting-gadgets", title: "Lighting & Gadgets", feeRule: fixed(12) },
      { slug: "other", title: "Other", feeRule: fixed(15) },
    ],
  },
  {
    slug: "luggage-travel",
    title: "Luggage & Travel",
    feeRule: range(7, 15, 15, "Luggage & Travel"),
    subCategories: [
      { slug: "handbags-wallets", title: "Handbags & Wallets", feeRule: fixed(15) },
      { slug: "luggage", title: "Luggage", feeRule: fixed(15) },
      { slug: "travel-accessories", title: "Travel Accessories", feeRule: fixed(15) },
      { slug: "other", title: "Other", feeRule: fixed(7) },
    ],
  },
  {
    slug: "media-entertainment",
    title: "Media & Entertainment",
    feeRule: range(5, 14, 10, "Media & Entertainment"),
    subCategories: [
      { slug: "books", title: "Books", feeRule: fixed(14) },
      { slug: "music-dvd", title: "Music & DVD", feeRule: fixed(10) },
      { slug: "video", title: "Video", feeRule: fixed(10) },
      { slug: "other", title: "Other", feeRule: fixed(10) },
    ],
  },
  {
    slug: "mobile-devices",
    title: "Mobile Devices",
    feeRule: fixed(7.5, "Mobile Devices"),
    subCategories: [
      { slug: "airtime-contracts", title: "Airtime & Contracts", feeRule: fixed(7.5) },
      { slug: "cellphones", title: "Cellphones", feeRule: fixed(7.5) },
      { slug: "tablets-ereaders", title: "Tablets & E-readers", feeRule: fixed(7.5) },
      { slug: "other", title: "Other", feeRule: fixed(8) },
    ],
  },
  {
    slug: "musical-instruments-equipment",
    title: "Musical Instruments & Equipment",
    feeRule: range(8, 12, 8, "Musical Instruments & Equipment"),
    subCategories: [
      { slug: "instruments", title: "Instruments", feeRule: fixed(9) },
      { slug: "guitars", title: "Guitars", feeRule: fixed(8) },
      { slug: "keyboards", title: "Keyboards", feeRule: fixed(9) },
      { slug: "dj-equipment-production", title: "DJ Equipment & Production", feeRule: fixed(8) },
      { slug: "sound-stage", title: "Sound & Stage", feeRule: fixed(8) },
      { slug: "accessories", title: "Accessories", feeRule: fixed(12) },
      { slug: "other", title: "Other", feeRule: fixed(12) },
    ],
  },
  {
    slug: "non-perishable",
    title: "Non-perishable",
    feeRule: fixed(8, "Non-perishable"),
    subCategories: [
      { slug: "food-beverages", title: "Food & Beverages", feeRule: fixed(8) },
      { slug: "groceries", title: "Groceries", feeRule: fixed(8) },
      { slug: "household-cleaning", title: "Household Cleaning", feeRule: fixed(8) },
      { slug: "other", title: "Other", feeRule: fixed(8) },
    ],
  },
  {
    slug: "office-business-equipment",
    title: "Office & Business Equipment",
    feeRule: range(7, 12, 10, "Office & Business Equipment"),
    subCategories: [
      { slug: "office", title: "Office", feeRule: fixed(10) },
      { slug: "office-accessories", title: "Office Accessories", feeRule: fixed(10) },
      { slug: "office-consumables", title: "Office Consumables", feeRule: fixed(10) },
      { slug: "office-furniture-storage", title: "Office Furniture & Storage", feeRule: fixed(10) },
      { slug: "printers-scanner-copier", title: "Printers, Scanner, Copier", feeRule: fixed(10) },
      { slug: "home-office-electronics", title: "Home & Office Electronics", feeRule: fixed(10) },
      { slug: "other", title: "Other", feeRule: fixed(10) },
    ],
  },
  {
    slug: "camping-outdoor",
    title: "Camping & Outdoor",
    feeRule: range(10, 15, 15, "Camping & Outdoor"),
    subCategories: [
      { slug: "outdoor-accessories", title: "Outdoor Accessories", feeRule: fixed(12) },
      { slug: "lighting-gadgets", title: "Lighting & Gadgets", feeRule: fixed(15) },
      { slug: "outdoor-kitchen", title: "Outdoor Kitchen", feeRule: fixed(12) },
      { slug: "storage-packs", title: "Storage & Packs", feeRule: fixed(15) },
      { slug: "camping-outdoor", title: "Camping & Outdoor", feeRule: fixed(15) },
      { slug: "other", title: "Other", feeRule: fixed(15) },
    ],
  },
  {
    slug: "pets",
    title: "Pets",
    feeRule: fixed(10, "Pets"),
    subCategories: [
      { slug: "equipment-accessories", title: "Equipment & Accessories", feeRule: fixed(10) },
      { slug: "food-treats", title: "Food & Treats", feeRule: fixed(10) },
      { slug: "pet-care-supplies", title: "Pet Care Supplies", feeRule: fixed(10) },
      { slug: "other", title: "Other", feeRule: fixed(10) },
    ],
  },
  {
    slug: "photography-video-equipment",
    title: "Photography & Video Equipment",
    feeRule: range(4, 12, 12, "Photography & Video Equipment"),
    subCategories: [
      { slug: "action-cams-drones", title: "Action Cams & Drones", feeRule: fixed(12) },
      { slug: "cameras", title: "Cameras", feeRule: fixed(4) },
      { slug: "cameras-lenses", title: "Cameras & Lenses", feeRule: fixed(4) },
      { slug: "video-cameras", title: "Video Cameras", feeRule: fixed(6) },
      { slug: "other", title: "Other", feeRule: fixed(12) },
    ],
  },
  {
    slug: "software",
    title: "Software",
    feeRule: fixed(5, "Software"),
    subCategories: [
      { slug: "business-office", title: "Business & Office", feeRule: fixed(5) },
      { slug: "downloads", title: "Downloads", feeRule: fixed(5) },
      { slug: "multimedia", title: "Multimedia", feeRule: fixed(5) },
      { slug: "security-antivirus", title: "Security & Anti-Virus", feeRule: fixed(5) },
      { slug: "design-creative", title: "Design & Creative Software", feeRule: fixed(5) },
      { slug: "educational", title: "Educational", feeRule: fixed(5) },
      { slug: "other", title: "Other", feeRule: fixed(5) },
    ],
  },
  {
    slug: "sport",
    title: "Sport",
    feeRule: range(12, 15, 13, "Sport"),
    subCategories: [
      { slug: "consumables", title: "Consumables", feeRule: fixed(12) },
      { slug: "equipment", title: "Equipment", feeRule: fixed(13) },
      { slug: "accessories", title: "Accessories", feeRule: fixed(15) },
      { slug: "clothing", title: "Clothing", feeRule: fixed(15) },
      { slug: "footwear", title: "Footwear", feeRule: fixed(15) },
      { slug: "other", title: "Other", feeRule: fixed(15) },
    ],
  },
  {
    slug: "stationery",
    title: "Stationery",
    feeRule: range(10, 14, 10, "Stationery"),
    subCategories: [
      { slug: "files-tags-labelling-binders", title: "Files, Tags, Labelling & Binders", feeRule: fixed(10) },
      { slug: "writing-drawing-tools", title: "Writing & Drawing Tools", feeRule: fixed(10) },
      { slug: "adhesives", title: "Adhesives", feeRule: fixed(10) },
      { slug: "paper", title: "Paper", feeRule: fixed(10) },
      { slug: "gifting", title: "Gifting", feeRule: fixed(10) },
      { slug: "scrapbooking-papercraft", title: "Scrapbooking & Papercraft", feeRule: fixed(10) },
      { slug: "art-craft-supplies", title: "Art & Craft Supplies", feeRule: fixed(10) },
      { slug: "general-stationery", title: "General Stationery", feeRule: fixed(10) },
      { slug: "christmas", title: "Christmas", feeRule: fixed(14) },
      { slug: "other", title: "Other", feeRule: fixed(10) },
    ],
  },
  {
    slug: "diy-automotive",
    title: "DIY & Automotive",
    feeRule: range(10, 12, 10, "DIY & Automotive"),
    subCategories: [
      { slug: "automotive-parts-accessories", title: "Automotive Parts & Accessories", feeRule: fixed(10) },
      { slug: "motorcycle-parts-accessories", title: "Motorcycle Parts & Accessories", feeRule: fixed(10) },
      { slug: "workshop-maintenance", title: "Workshop & Maintenance", feeRule: fixed(10) },
      { slug: "tools-machinery", title: "Tools & Machinery", feeRule: fixed(10) },
      { slug: "home-improvement", title: "Home Improvement", feeRule: fixed(11) },
      { slug: "other", title: "Other", feeRule: fixed(10) },
    ],
  },
  {
    slug: "toys",
    title: "Toys",
    feeRule: fixed(12, "Toys"),
    subCategories: [
      { slug: "games-puzzles", title: "Games & Puzzles", feeRule: fixed(12) },
      { slug: "indoor-play", title: "Indoor Play", feeRule: fixed(12) },
      { slug: "outdoor-play", title: "Outdoor Play", feeRule: fixed(12) },
      { slug: "smart-toys", title: "Smart Toys", feeRule: fixed(12) },
      { slug: "other", title: "Other", feeRule: fixed(12) },
    ],
  },
  {
    slug: "wearable",
    title: "Wearable",
    feeRule: range(7, 15, 12, "Wearable"),
    subCategories: [
      { slug: "security-tracker-devices", title: "Security Tracker Devices", feeRule: fixed(12) },
      { slug: "fitness-activity-smart-watches", title: "Fitness & Activity Smart Watches", feeRule: tiers([
        { maxPriceIncl: 1450, percent: 15 },
        { minPriceIncl: 1451, percent: 10 },
      ]) },
      { slug: "health-tracker-devices", title: "Health Tracker Devices", feeRule: tiers([
        { maxPriceIncl: 1450, percent: 15 },
        { minPriceIncl: 1451, percent: 10 },
      ]) },
      { slug: "other", title: "Other", feeRule: fixed(7) },
    ],
  },
  {
    slug: "fashion",
    title: "Fashion",
    feeRule: fixed(15, "Fashion"),
    subCategories: [
      { slug: "clothing-footwear", title: "Clothing & Footwear", feeRule: fixed(15) },
      { slug: "accessories", title: "Accessories", feeRule: fixed(15) },
      { slug: "jewellery-watches", title: "Jewellery & Watches", feeRule: fixed(15) },
      { slug: "other", title: "Other", feeRule: fixed(15) },
    ],
  },
  {
    slug: "home-and-office-electronics",
    title: "Home & Office Electronics",
    feeRule: range(7, 12, 10, "Home & Office Electronics"),
    subCategories: [
      { slug: "phones-voip", title: "Phones & VOIP", feeRule: fixed(10) },
      { slug: "point-of-sale-equipment", title: "Point-of-Sale Equipment", feeRule: fixed(10) },
      { slug: "projectors", title: "Projectors", feeRule: fixed(7) },
      { slug: "shredders", title: "Shredders", feeRule: fixed(7) },
      { slug: "label-makers", title: "Label Makers", feeRule: fixed(10) },
      { slug: "calculators", title: "Calculators", feeRule: fixed(12) },
      { slug: "other", title: "Other", feeRule: fixed(10) },
    ],
  },
];

export const MARKETPLACE_CATEGORY_SLUGS = MARKETPLACE_CATEGORIES.map((category) => category.slug);

export const DEFAULT_MARKETPLACE_FEE_CONFIG: MarketplaceFeeConfig = {
  version: "marketplace-fees-v1",
  currency: "ZAR",
  handlingFeeIncl: 0,
  stockCoverThresholdDays: 35,
  categories: MARKETPLACE_CATEGORIES,
  fulfilment: {
    handlingFeeIncl: 0,
    rows: [
      { label: "Small", maxVolumeCm3: 60000, prices: { light: 20, heavy: 47, heavyPlus: 100, veryHeavy: 100 } },
      { label: "Standard", minVolumeCm3: 60000, maxVolumeCm3: 130000, prices: { light: 42, heavy: 47, heavyPlus: 100, veryHeavy: 100 } },
      { label: "Large", minVolumeCm3: 130000, maxVolumeCm3: 200000, prices: { light: 55, heavy: 60, heavyPlus: 100, veryHeavy: 110 } },
      { label: "Extra Large", minVolumeCm3: 200000, maxVolumeCm3: 275000, prices: { light: 55, heavy: 60, heavyPlus: 100, veryHeavy: 110 } },
      { label: "Oversize", minVolumeCm3: 275000, maxVolumeCm3: 545000, prices: { light: 100, heavy: 120, heavyPlus: 150, veryHeavy: 110 } },
      { label: "Bulky", minVolumeCm3: 545000, maxVolumeCm3: 775000, prices: { light: 100, heavy: 135, heavyPlus: 150, veryHeavy: 160 } },
      { label: "Extra Bulky", minVolumeCm3: 775000, prices: { light: 250, heavy: 250, heavyPlus: 300, veryHeavy: 360 } },
    ],
  },
  storage: {
    thresholdDays: 35,
    bands: [
      { label: "Small", maxVolumeCm3: 60000, overstockedFeeIncl: 2 },
      { label: "Standard", minVolumeCm3: 60001, maxVolumeCm3: 130000, overstockedFeeIncl: 6 },
      { label: "Large", minVolumeCm3: 130001, maxVolumeCm3: 200000, overstockedFeeIncl: 12.5 },
      { label: "Extra Large", minVolumeCm3: 200001, maxVolumeCm3: 275000, overstockedFeeIncl: 22.5 },
      { label: "Oversize", minVolumeCm3: 275001, maxVolumeCm3: 545000, overstockedFeeIncl: 75 },
      { label: "Bulky", minVolumeCm3: 545001, maxVolumeCm3: 775000, overstockedFeeIncl: 125 },
      { label: "Extra Bulky", minVolumeCm3: 775001, overstockedFeeIncl: 225 },
    ],
  },
};

export function getMarketplaceCatalogueCategory(
  slug: string,
  categories: MarketplaceCategory[] = MARKETPLACE_CATEGORIES,
) {
  const normalized = String(slug ?? "").trim().toLowerCase();
  return categories.find((category) => category.slug === normalized) ?? null;
}

export function getMarketplaceCatalogueSubCategories(
  categorySlug: string,
  categories: MarketplaceCategory[] = MARKETPLACE_CATEGORIES,
) {
  return getMarketplaceCatalogueCategory(categorySlug, categories)?.subCategories ?? [];
}

function normalizeRule(rule?: MarketplaceFeeRule | null) {
  if (!rule) return null;
  return rule;
}

export function resolveMarketplaceSuccessFeeRule(
  categorySlug: string,
  subCategorySlug?: string | null,
  categories: MarketplaceCategory[] = MARKETPLACE_CATEGORIES,
) {
  const category = getMarketplaceCatalogueCategory(categorySlug, categories);
  const subCategory = getMarketplaceCatalogueSubCategories(categorySlug, categories).find(
    (item) => item.slug === String(subCategorySlug ?? "").trim().toLowerCase(),
  );

  const rule = normalizeRule(subCategory?.feeRule) || normalizeRule(category?.feeRule) || fixed(12, "Marketplace default");
  return {
    rule,
    category,
    subCategory: subCategory ?? null,
  };
}

export function describeMarketplaceFeeRule(rule?: MarketplaceFeeRule | null) {
  if (!rule) return "Not set";
  if (rule.kind === "fixed") return `${rule.percent}%`;
  if (rule.kind === "range") return `${rule.minPercent}% - ${rule.maxPercent}%`;
  if (rule.kind === "tiers") {
    const labels = rule.tiers
      .map((tier) => {
        if (tier.minPriceIncl != null && tier.maxPriceIncl != null) {
          return `R${tier.minPriceIncl.toLocaleString("en-ZA")} - R${tier.maxPriceIncl.toLocaleString("en-ZA")} @ ${tier.percent}%`;
        }
        if (tier.minPriceIncl != null) {
          return `R${tier.minPriceIncl.toLocaleString("en-ZA")}+ @ ${tier.percent}%`;
        }
        if (tier.maxPriceIncl != null) {
          return `Up to R${tier.maxPriceIncl.toLocaleString("en-ZA")} @ ${tier.percent}%`;
        }
        return `${tier.percent}%`;
      })
      .join(", ");
    return labels || "Tiered";
  }
  return "Not set";
}

export function estimateMarketplaceSuccessFeePercent(
  rule?: MarketplaceFeeRule | null,
  priceIncl?: number | string | null,
) {
  const price = Number(priceIncl || 0);
  if (!Number.isFinite(price) || price <= 0) {
    if (!rule) return 0;
    if (rule.kind === "fixed") return rule.percent;
    if (rule.kind === "range") return rule.estimatePercent ?? (rule.minPercent + rule.maxPercent) / 2;
    if (rule.kind === "tiers") return rule.tiers[0]?.percent ?? 0;
    return 0;
  }

  if (!rule) return 0;
  if (rule.kind === "fixed") return rule.percent;
  if (rule.kind === "range") return rule.estimatePercent ?? (rule.minPercent + rule.maxPercent) / 2;
  if (rule.kind === "tiers") {
    const matched = rule.tiers.find((tier) => {
      const minOk = tier.minPriceIncl == null || price >= tier.minPriceIncl;
      const maxOk = tier.maxPriceIncl == null || price <= tier.maxPriceIncl;
      return minOk && maxOk;
    });
    return matched?.percent ?? rule.tiers.at(-1)?.percent ?? 0;
  }
  return 0;
}

export function estimateMarketplaceSuccessFeeAmount(
  rule?: MarketplaceFeeRule | null,
  priceIncl?: number | string | null,
) {
  const price = Number(priceIncl || 0);
  const percent = estimateMarketplaceSuccessFeePercent(rule, price);
  return Number.isFinite(price) && price > 0 ? normalizeMoneyAmount(price * (percent / 100)) : 0;
}

export function getMarketplaceWeightBand(weightKg: number) {
  const weight = Number(weightKg || 0);
  if (weight > 0 && weight <= 7) return "light";
  if (weight > 7 && weight <= 25) return "heavy";
  if (weight > 25 && weight <= 40) return "heavyPlus";
  if (weight > 40 && weight <= 70) return "veryHeavy";
  return null;
}

export function getMarketplaceVolumeBand(
  volumeCm3: number,
  config: MarketplaceFeeConfig = DEFAULT_MARKETPLACE_FEE_CONFIG,
) {
  const volume = Number(volumeCm3 || 0);
  const bands = Array.isArray(config?.storage?.bands) && config.storage.bands.length
    ? config.storage.bands
    : DEFAULT_MARKETPLACE_FEE_CONFIG.storage.bands;
  const sorted = [...bands].sort((a, b) => (a.minVolumeCm3 ?? 0) - (b.minVolumeCm3 ?? 0));
  const matched = sorted.find((band) => {
    const minOk = band.minVolumeCm3 == null || volume >= band.minVolumeCm3;
    const maxOk = band.maxVolumeCm3 == null || volume <= band.maxVolumeCm3;
    return minOk && maxOk;
  });
  return matched ?? sorted.at(-1) ?? DEFAULT_MARKETPLACE_FEE_CONFIG.storage.bands.at(-1)!;
}

export function estimateMarketplaceFulfilmentFee({
  volumeCm3,
  weightKg,
  config = DEFAULT_MARKETPLACE_FEE_CONFIG,
}: {
  categorySlug: string;
  volumeCm3: number;
  weightKg: number;
  config?: MarketplaceFeeConfig;
}) {
  const weightTiers: FulfillmentFeeTable["weightTiers"] = [
    { code: "light", title: "Light", minKg: 0, maxKg: 7 },
    { code: "heavy", title: "Heavy", minKg: 7, maxKg: 25 },
    { code: "heavyPlus", title: "Heavy Plus", minKg: 25, maxKg: 40 },
    { code: "veryHeavy", title: "Very Heavy", minKg: 40, maxKg: 70 },
  ];

  const configuredRows = Array.isArray(config?.fulfilment?.rows)
    ? config.fulfilment.rows.filter((item) => item?.isActive !== false)
    : [];
  const fallbackRows = DEFAULT_MARKETPLACE_FEE_CONFIG.fulfilment.rows || [];
  const feeRows = configuredRows.length ? configuredRows : fallbackRows;
  const sizeTiers: FulfillmentFeeTable["sizeTiers"] = feeRows.map((row) => ({
    code: String(row.label || "").trim() || "unknown",
    title: String(row.label || "").trim() || "Unknown",
    minVolumeCm3: row.minVolumeCm3 ?? undefined,
    maxVolumeCm3: row.maxVolumeCm3 ?? undefined,
    prices: row.prices || { light: 0, heavy: 0, heavyPlus: 0, veryHeavy: 0 },
  }));

  const feeResult = getFulfillmentFee({
    weightKg: Number(weightKg || 0),
    volumeCm3: Number(volumeCm3 || 0),
    table: {
      weightTiers,
      sizeTiers,
    },
  });

  const weightBand = feeResult.ok ? feeResult.data.weightTier : getMarketplaceWeightBand(weightKg);
  const fulfilmentFeeIncl = feeResult.ok ? normalizeMoneyAmount(feeResult.data.fee) : 0;
  const sizeBandLabel = feeResult.ok ? feeResult.data.sizeTier : null;

  return {
    fulfilmentFeeIncl,
    handlingFeeIncl: 0,
    totalFeeIncl: fulfilmentFeeIncl,
    sizeBand: sizeBandLabel,
    weightBand,
    fulfilmentClass: null,
  };
}

export function estimateMarketplaceStorageFee({
  volumeCm3,
  stockQty,
  monthlySales30d,
  config = DEFAULT_MARKETPLACE_FEE_CONFIG,
}: {
  volumeCm3: number;
  stockQty: number;
  monthlySales30d: number;
  config?: MarketplaceFeeConfig;
}) {
  const band = getMarketplaceVolumeBand(volumeCm3, config);
  const stock = Number(stockQty || 0);
  const sales30d = Number(monthlySales30d || 0);
  if (!(stock > 0) || !(sales30d > 0)) {
    return {
      storageFeeIncl: 0,
      stockCoverDays: null as number | null,
      sizeBand: band.label,
      overstocked: false,
    };
  }

  const thresholdDays = Number(config?.stockCoverThresholdDays ?? DEFAULT_MARKETPLACE_FEE_CONFIG.stockCoverThresholdDays);
  const stockCoverDays = normalizeMoneyAmount((stock / sales30d) * 30);
  const overstocked = stockCoverDays > thresholdDays;
  return {
    storageFeeIncl: overstocked ? normalizeMoneyAmount(Number(band.overstockedFeeIncl || 0)) : 0,
    stockCoverDays,
    sizeBand: band.label,
    overstocked,
  };
}

export function deriveMarketplaceVolumeCm3({
  lengthCm,
  widthCm,
  heightCm,
}: {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}) {
  const length = Number(lengthCm || 0);
  const width = Number(widthCm || 0);
  const height = Number(heightCm || 0);
  if (!(length > 0) || !(width > 0) || !(height > 0)) return 0;
  return normalizeMoneyAmount(length * width * height);
}

export function buildMarketplaceFeeSnapshot({
  categorySlug,
  subCategorySlug,
  sellingPriceIncl,
  weightKg,
  lengthCm,
  widthCm,
  heightCm,
  stockQty,
  monthlySales30d,
  fulfillmentMode = "bevgo",
  config = DEFAULT_MARKETPLACE_FEE_CONFIG,
}: {
  categorySlug: string;
  subCategorySlug?: string | null;
  sellingPriceIncl: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  stockQty: number;
  monthlySales30d: number;
  fulfillmentMode?: "seller" | "bevgo";
  config?: MarketplaceFeeConfig;
}): MarketplaceFeeSnapshot {
  const success = resolveMarketplaceSuccessFeeRule(categorySlug, subCategorySlug ?? null, config.categories);
  const successFeePercent = estimateMarketplaceSuccessFeePercent(success.rule, sellingPriceIncl);
  const successFeeIncl = estimateMarketplaceSuccessFeeAmount(success.rule, sellingPriceIncl);
  const volumeCm3 = deriveMarketplaceVolumeCm3({ lengthCm, widthCm, heightCm });
  const fulfilment = estimateMarketplaceFulfilmentFee({ categorySlug, volumeCm3, weightKg, config });
  const storage = estimateMarketplaceStorageFee({ volumeCm3, stockQty, monthlySales30d, config });
  const requiresFulfilmentFees = fulfillmentMode === "bevgo";
  const fulfilmentFeeIncl = requiresFulfilmentFees ? fulfilment.fulfilmentFeeIncl : 0;
  const handlingFeeIncl = 0;
  const storageFeeIncl = requiresFulfilmentFees ? storage.storageFeeIncl : 0;
  const totalFeesIncl = normalizeMoneyAmount(successFeeIncl + fulfilmentFeeIncl + storageFeeIncl);
  return {
    successFeePercent,
    successFeeIncl,
    successFeeVatIncl: successFeeIncl,
    fulfilmentFeeIncl,
    fulfilmentFeeExclVat: fulfilmentFeeIncl,
    handlingFeeIncl,
    storageFeeIncl,
    storageFeeExclVat: storageFeeIncl,
    totalFeesIncl,
    totalMarketplaceFees: totalFeesIncl,
    totalWarehouseFeesExclVat: normalizeMoneyAmount(fulfilmentFeeIncl + storageFeeIncl),
    volumeCm3,
    sizeBand: fulfilment.sizeBand,
    weightBand: fulfilment.weightBand,
    storageBand: storage.sizeBand,
    stockCoverDays: storage.stockCoverDays,
    overstocked: storage.overstocked,
    successFeeRule: success.rule,
    fulfillmentMode,
    configVersion: config?.version || null,
  };
}

export function normalizeMarketplaceVariantLogistics(input: Partial<MarketplaceVariantLogistics> | Record<string, unknown> | null | undefined) {
  const source = (input || {}) as Record<string, unknown> & Partial<MarketplaceVariantLogistics>;
  const weightKg = Number(source.weightKg ?? source.weight_kg ?? source.weight ?? 0);
  const lengthCm = Number(source.lengthCm ?? source.length_cm ?? source.length ?? 0);
  const widthCm = Number(source.widthCm ?? source.width_cm ?? source.width ?? 0);
  const heightCm = Number(source.heightCm ?? source.height_cm ?? source.height ?? 0);
  const monthlySales30d = Number(source.monthlySales30d ?? source.monthly_sales_30d ?? source.sales30d ?? source.projectedMonthlySales30d ?? 0);
  const stockQty = Number(source.stockQty ?? source.stock_qty ?? source.inventoryQty ?? source.inventory_qty ?? 0);
  const warehouseId = source.warehouseId ?? source.warehouse_id ?? null;
  const parcelPreset = source.parcelPreset ?? source.parcel_preset ?? null;
  const shippingClass = source.shippingClass ?? source.shipping_class ?? null;

  return {
    weightKg: Number.isFinite(weightKg) ? normalizeMoneyAmount(weightKg) : 0,
    lengthCm: Number.isFinite(lengthCm) ? normalizeMoneyAmount(lengthCm) : 0,
    widthCm: Number.isFinite(widthCm) ? normalizeMoneyAmount(widthCm) : 0,
    heightCm: Number.isFinite(heightCm) ? normalizeMoneyAmount(heightCm) : 0,
    monthlySales30d: Number.isFinite(monthlySales30d) ? Math.max(0, Math.trunc(monthlySales30d)) : 0,
    stockQty: Number.isFinite(stockQty) ? Math.max(0, Math.trunc(stockQty)) : 0,
    warehouseId: warehouseId == null ? null : String(warehouseId).trim() || null,
    parcelPreset: parcelPreset == null ? null : String(parcelPreset).trim() || null,
    shippingClass: shippingClass == null ? null : String(shippingClass).trim() || null,
  } satisfies MarketplaceVariantLogistics;
}

export function marketplaceVariantLogisticsComplete(
  logistics: Partial<MarketplaceVariantLogistics> | null | undefined,
) {
  const normalized = normalizeMarketplaceVariantLogistics(logistics || null);
  return Boolean(
    normalized.weightKg > 0 &&
      normalized.lengthCm > 0 &&
      normalized.widthCm > 0 &&
      normalized.heightCm > 0 &&
      normalized.monthlySales30d > 0 &&
      normalized.stockQty > 0 &&
      normalized.warehouseId,
  );
}
