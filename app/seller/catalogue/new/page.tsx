"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { PageBody } from "@/components/layout/page-body";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { SellerPageIntro } from "@/components/seller/page-intro";
import { prepareImageAsset } from "@/lib/client/image-prep";
import { clientStorage } from "@/lib/firebase";
import { getSellerBlockReasonFix, getSellerBlockReasonLabel } from "@/lib/seller/account-status";
import { sellerDeliverySettingsReady as hasSellerDeliverySettings } from "@/lib/seller/delivery-profile";
import { sellerHasWeightBasedShipping } from "@/lib/seller/shipping-weight-requirements";
import {
  buildMarketplaceFeeSnapshot,
  describeMarketplaceFeeRule,
  DEFAULT_MARKETPLACE_FEE_CONFIG,
  getMarketplaceCatalogueSubCategories,
  marketplaceVariantLogisticsComplete,
  normalizeMarketplaceVariantLogistics,
  resolveMarketplaceSuccessFeeRule,
  estimateMarketplaceSuccessFeePercent,
} from "@/lib/marketplace/fees";
import {
  buildVariantShippingProfile,
  inferRecommendedParcelPreset,
  type ParcelPresetKey,
} from "@/lib/shipping/contracts";
import { SELLER_CATALOGUE_CATEGORIES } from "@/lib/seller/catalogue-categories";
import { decode } from "blurhash";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";

type BrandSuggestion = {
  id: string;
  slug: string;
  title: string;
};

type SelectedBrand = BrandSuggestion & {
  exact: boolean;
  mode: "existing" | "new";
};

type CreatedProductSummary = {
  uniqueId: string;
  sku: string;
  title: string;
  titleSlug: string;
  brandSlug: string;
  brandTitle: string;
  vendorName: string;
  moderationStatus: string;
  moderationReason?: string;
};

type ProductImage = {
  imageUrl: string;
  blurHashUrl: string;
  fileName: string;
  altText: string;
};

type ProductVariantItem = {
  variant_id?: string;
  label?: string;
  size?: string | null;
  shade?: string | null;
  scent?: string | null;
  skinType?: string | null;
  hairType?: string | null;
  flavor?: string | null;
  abv?: string | null;
  containerType?: string | null;
  storageCapacity?: string | null;
  memoryRam?: string | null;
  connectivity?: string | null;
  compatibility?: string | null;
  sizeSystem?: string | null;
  material?: string | null;
  ringSize?: string | null;
  strapLength?: string | null;
  bookFormat?: string | null;
  language?: string | null;
  ageRange?: string | null;
  modelFitment?: string | null;
  sku?: string | null;
  barcode?: string | null;
  barcodeImageUrl?: string | null;
  color?: string | null;
  media?: {
    images?: ProductImage[];
  };
  inventory?: Array<{
    warehouse_id?: string | null;
    in_stock_qty?: number | string | null;
  }>;
  placement?: {
    is_default?: boolean;
    isActive?: boolean;
    track_inventory?: boolean;
    continue_selling_out_of_stock?: boolean;
  };
  pack?: {
    unit_count?: number;
    volume?: number;
    volume_unit?: string;
  };
  pricing?: {
    selling_price_incl?: number;
    selling_price_excl?: number;
    sale_price_incl?: number;
    sale_price_excl?: number;
  };
  sale?: {
    is_on_sale?: boolean;
    discount_percent?: number;
    sale_price_incl?: number;
    sale_price_excl?: number;
  };
  logistics?: {
    parcel_preset?: string | null;
    shipping_class?: string | null;
    weight_kg?: number;
    length_cm?: number;
    width_cm?: number;
    height_cm?: number;
    volumetric_weight_kg?: number | null;
    billable_weight_kg?: number | null;
    monthly_sales_30d?: number;
    stock_qty?: number;
    warehouse_id?: string | null;
    volume_cm3?: number;
  };
  fees?: {
    success_fee_percent?: number;
    success_fee_incl?: number;
    success_fee_vat_incl?: number;
    fulfilment_fee_incl?: number;
    fulfilment_fee_excl_vat?: number;
    handling_fee_incl?: number;
    storage_fee_incl?: number;
    storage_fee_excl_vat?: number;
    total_fees_incl?: number;
    total_marketplace_fees?: number;
    total_warehouse_fees_excl_vat?: number;
    size_band?: string | null;
    weight_band?: string | null;
    storage_band?: string | null;
    stock_cover_days?: number | null;
    overstocked?: boolean;
    fulfilment_mode?: "seller" | "bevgo";
    config_version?: string | null;
  };
};

type VariantDraft = {
  variantId: string;
  label: string;
  size: string;
  shade: string;
  scent: string;
  skinType: string;
  hairType: string;
  flavor: string;
  abv: string;
  containerType: string;
  storageCapacity: string;
  memoryRam: string;
  connectivity: string;
  compatibility: string;
  sizeSystem: string;
  material: string;
  ringSize: string;
  strapLength: string;
  bookFormat: string;
  language: string;
  ageRange: string;
  modelFitment: string;
  parcelPreset: string;
  shippingClass: string;
  sku: string;
  barcode: string;
  barcodeImageUrl: string;
  unitCount: string;
  volume: string;
  volumeUnit: string;
  color: string;
  hasColor: boolean;
  sellingPriceIncl: string;
  isOnSale: boolean;
  saleDiscountPercent: string;
  isDefault: boolean;
  isActive: boolean;
  continueSellingOutOfStock: boolean;
  trackInventory: boolean;
  inventoryQty: string;
  warehouseId: string;
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  monthlySales30d: string;
};

type SellerContextItem = {
  sellerSlug: string;
  sellerCode: string;
  vendorName: string;
  status: string | null;
  blockedReasonCode: string | null;
  blockedReasonMessage: string | null;
};

const BRAND_ENDPOINT = "/api/catalogue/v1/brands/get";
const PRODUCT_GET_ENDPOINT = "/api/catalogue/v1/products/product/get";
const PRODUCT_UPDATE_ENDPOINT = "/api/catalogue/v1/products/product/update";
const PRODUCT_DELETE_ENDPOINT = "/api/catalogue/v1/products/product/delete";
const VARIANT_CREATE_ENDPOINT = "/api/catalogue/v1/products/variants/create";
const VARIANT_UPDATE_ENDPOINT = "/api/catalogue/v1/products/variants/update";
const VARIANT_DELETE_ENDPOINT = "/api/catalogue/v1/products/variants/delete";
const VARIANT_GET_ENDPOINT = "/api/catalogue/v1/products/variants/get";
const VARIANT_BARCODE_CHECK_ENDPOINT = "/api/catalogue/v1/products/variants/barcodeCheck";
const VARIANT_BARCODE_GENERATE_UNIQUE_ENDPOINT = "/api/catalogue/v1/products/variants/generateUniqueEanBarcode";
const VARIANT_BARCODE_GENERATE_IMAGE_ENDPOINT = "/api/catalogue/v1/products/variants/generateBarcode";
const SELLER_INBOUND_BOOKINGS_ENDPOINT = "/api/client/v1/accounts/seller/inbound-bookings";
const SELLER_STOCK_UPLIFTMENTS_ENDPOINT = "/api/client/v1/accounts/seller/stock-upliftments";
const UNIQUE_CODE_ENDPOINT = "/api/catalogue/v1/products/generateUniqueCode";
const SKU_ENDPOINT = "/api/catalogue/v1/products/sku/generate";
const SKU_CHECK_ENDPOINT = "/api/catalogue/v1/products/sku/checkSku";
const VAT_RATE = 0.15;
const VOLUME_UNITS = ["kg", "ml", "lt", "g", "small", "medium", "large", "each"];
const PARCEL_PRESET_OPTIONS: Array<{ value: ParcelPresetKey; label: string; description: string }> = [
  { value: "fashion_satchel", label: "Fashion satchel", description: "Best for folded clothing and soft pre-loved fashion." },
  { value: "shoe_box", label: "Shoe box", description: "Best for shoes, sneakers and structured footwear." },
  { value: "small_accessory", label: "Small accessory", description: "Best for jewellery, belts, caps and compact items." },
  { value: "standard_box", label: "Standard box", description: "Best for most general parcels and homeware." },
  { value: "bulky_box", label: "Bulky box", description: "Best for larger items that need a bigger carton." },
];
const APPAREL_SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "One Size", "Custom"];
const BEAUTY_SHADE_OPTIONS = ["Light", "Medium", "Tan", "Deep", "Clear", "Universal", "Custom"];
const BEAUTY_SCENT_OPTIONS = ["Floral", "Fresh", "Citrus", "Woody", "Sweet", "Unscented", "Custom"];
const BEAUTY_SKIN_TYPE_OPTIONS = ["All skin types", "Dry", "Oily", "Combination", "Sensitive", "Mature", "Custom"];
const BEAUTY_HAIR_TYPE_OPTIONS = ["All hair types", "Straight", "Wavy", "Curly", "Coily", "Dry or damaged", "Custom"];
const BEVERAGE_CONTAINER_OPTIONS = ["Bottle", "Can", "Carton", "Glass bottle", "Multipack", "Custom"];
const ELECTRONICS_STORAGE_OPTIONS = ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB", "Custom"];
const ELECTRONICS_MEMORY_OPTIONS = ["2GB", "4GB", "8GB", "16GB", "32GB", "64GB", "Custom"];
const ELECTRONICS_CONNECTIVITY_OPTIONS = ["Wi-Fi", "4G", "5G", "Bluetooth", "Wired", "Custom"];
const FOOTWEAR_SIZE_SYSTEM_OPTIONS = ["UK", "US", "EU", "CM", "Custom"];
const MATERIAL_OPTIONS = ["Leather", "Gold", "Silver", "Stainless steel", "Cotton", "Synthetic", "Wood", "Custom"];
const BOOK_FORMAT_OPTIONS = ["Paperback", "Hardcover", "eBook", "Audiobook", "DVD", "Blu-ray", "CD", "Custom"];
const LANGUAGE_OPTIONS = ["English", "Afrikaans", "Zulu", "Xhosa", "French", "Portuguese", "Custom"];
const BABY_AGE_RANGE_OPTIONS = ["0-3 months", "3-6 months", "6-12 months", "12-24 months", "2-4 years", "Custom"];
const PRE_LOVED_CONDITIONS = [
  { value: "like-new", label: "Like New" },
  { value: "excellent", label: "Excellent" },
  { value: "very-good", label: "Very Good" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
];
const COLOR_SWATCHES = [
  "#ffffff",
  "#000000",
  "#e11d48",
  "#f97316",
  "#facc15",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#a16207",
  "#64748b",
];
const OVERVIEW_MAX_LENGTH = 160;
const DESCRIPTION_MAX_LENGTH = 900;

function normalizeSlug(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/['".]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeText(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function money2(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function inclToExcl(value: string | number) {
  return money2(Number(value) / (1 + VAT_RATE));
}

function exclToIncl(value: string | number) {
  return money2(Number(value) * (1 + VAT_RATE));
}

function hasEnteredReviewFlow(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return ["published", "in_review", "awaiting_stock"].includes(normalized);
}

function ChangeImpactHint({
  mode,
  hasSavedProduct = true,
  className = "",
}: {
  mode: "review" | "live";
  hasSavedProduct?: boolean;
  className?: string;
}) {
  const text = !hasSavedProduct
    ? "This will be saved to your draft first."
    : mode === "review"
      ? "Changes here require review before they go live."
      : "Changes here update the live listing immediately.";
  return (
    <p className={`${mode === "review" ? "text-[#907d4c]" : "text-[#166534]"} text-[11px] font-medium ${className}`.trim()}>
      {text}
    </p>
  );
}

type ProductEditorBaseline = {
  title: string;
  category: string;
  subCategory: string;
  condition: string;
  brandSlug: string;
  brandTitle: string;
  overview: string;
  description: string;
  keywords: string[];
  imageKeys: string[];
  fulfillmentMode: "seller" | "bevgo";
  inventoryTracking: boolean;
};

type VariantEditorBaseline = {
  label: string;
  size: string;
  shade: string;
  scent: string;
  skinType: string;
  hairType: string;
  flavor: string;
  abv: string;
  containerType: string;
  storageCapacity: string;
  memoryRam: string;
  connectivity: string;
  compatibility: string;
  sizeSystem: string;
  material: string;
  ringSize: string;
  strapLength: string;
  bookFormat: string;
  language: string;
  ageRange: string;
  modelFitment: string;
  parcelPreset: string;
  shippingClass: string;
  sku: string;
  barcode: string;
  color: string;
  imageKeys: string[];
  unitCount: string;
  volume: string;
  volumeUnit: string;
  sellingPriceIncl: string;
  saleDiscountPercent: string;
  isOnSale: boolean;
  inventoryQty: string;
  continueSellingOutOfStock: boolean;
  trackInventory: boolean;
  isDefault: boolean;
  isActive: boolean;
};

function createProductEditorBaseline(input: Partial<ProductEditorBaseline>): ProductEditorBaseline {
  return {
    title: String(input.title ?? "").trim(),
    category: String(input.category ?? "").trim(),
    subCategory: String(input.subCategory ?? "").trim(),
    condition: String(input.condition ?? "").trim(),
    brandSlug: String(input.brandSlug ?? "").trim(),
    brandTitle: String(input.brandTitle ?? "").trim(),
    overview: String(input.overview ?? "").trim(),
    description: String(input.description ?? "").trim(),
    keywords: Array.isArray(input.keywords)
      ? input.keywords.map((item) => String(item ?? "").trim().toLowerCase()).filter(Boolean)
      : [],
    imageKeys: Array.isArray(input.imageKeys)
      ? input.imageKeys.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
    fulfillmentMode: input.fulfillmentMode === "bevgo" ? "bevgo" : "seller",
    inventoryTracking: Boolean(input.inventoryTracking),
  };
}

function imageSignatureFromItems(items: ProductImage[]) {
  return items
    .map((item) => String(item?.imageUrl ?? "").trim())
    .filter(Boolean);
}

function createVariantEditorBaseline(input: Partial<VariantEditorBaseline>): VariantEditorBaseline {
  return {
    label: String(input.label ?? "").trim(),
    size: String(input.size ?? "").trim(),
    shade: String(input.shade ?? "").trim(),
    scent: String(input.scent ?? "").trim(),
    skinType: String(input.skinType ?? "").trim(),
    hairType: String(input.hairType ?? "").trim(),
    flavor: String(input.flavor ?? "").trim(),
    abv: String(input.abv ?? "").trim(),
    containerType: String(input.containerType ?? "").trim(),
    storageCapacity: String(input.storageCapacity ?? "").trim(),
    memoryRam: String(input.memoryRam ?? "").trim(),
    connectivity: String(input.connectivity ?? "").trim(),
    compatibility: String(input.compatibility ?? "").trim(),
    sizeSystem: String(input.sizeSystem ?? "").trim(),
    material: String(input.material ?? "").trim(),
    ringSize: String(input.ringSize ?? "").trim(),
    strapLength: String(input.strapLength ?? "").trim(),
    bookFormat: String(input.bookFormat ?? "").trim(),
    language: String(input.language ?? "").trim(),
    ageRange: String(input.ageRange ?? "").trim(),
    modelFitment: String(input.modelFitment ?? "").trim(),
    parcelPreset: String(input.parcelPreset ?? "").trim(),
    shippingClass: String(input.shippingClass ?? "").trim(),
    sku: String(input.sku ?? "").trim(),
    barcode: String(input.barcode ?? "").trim(),
    color: String(input.color ?? "").trim(),
    imageKeys: Array.isArray(input.imageKeys)
      ? input.imageKeys.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
    unitCount: String(input.unitCount ?? "").trim(),
    volume: String(input.volume ?? "").trim(),
    volumeUnit: String(input.volumeUnit ?? "").trim(),
    sellingPriceIncl: String(input.sellingPriceIncl ?? "").trim(),
    saleDiscountPercent: String(input.saleDiscountPercent ?? "").trim(),
    isOnSale: Boolean(input.isOnSale),
    inventoryQty: String(input.inventoryQty ?? "").trim(),
    continueSellingOutOfStock: Boolean(input.continueSellingOutOfStock),
    trackInventory: Boolean(input.trackInventory),
    isDefault: Boolean(input.isDefault),
    isActive: Boolean(input.isActive),
  };
}

function getVariantChangeImpactSummary({
  baseline,
  current,
  hasLiveListing,
  isEditing,
  moderationStatus,
}: {
  baseline: VariantEditorBaseline | null;
  current: VariantEditorBaseline;
  hasLiveListing: boolean;
  isEditing: boolean;
  moderationStatus?: string | null;
}) {
  if (!isEditing) {
    if (!hasLiveListing) {
      return {
        tone: "neutral" as const,
        title: "New variant for this draft",
        message: "You can add this variant to the draft now. Price and stock are operational, while the listing will still be reviewed before it goes live.",
      };
    }
    return {
      tone: "review" as const,
      title: "Adding this variant will require review",
      message: "This is a brand-new variant on a live listing, so Piessang will send the update for review before the new variant goes live.",
    };
  }

  if (!baseline) {
    return {
      tone: "neutral" as const,
      title: "Checking variant change impact",
      message: "Piessang is comparing your current variant edits against the last saved version.",
    };
  }

  const reviewTriggers: string[] = [];
  const liveChanges: string[] = [];

  if (baseline.label !== current.label) reviewTriggers.push("variant label");
  if (baseline.size !== current.size) reviewTriggers.push("size");
  if (baseline.shade !== current.shade) reviewTriggers.push("shade");
  if (baseline.scent !== current.scent) reviewTriggers.push("scent");
  if (baseline.skinType !== current.skinType) reviewTriggers.push("skin type");
  if (baseline.hairType !== current.hairType) reviewTriggers.push("hair type");
  if (baseline.flavor !== current.flavor) reviewTriggers.push("flavour");
  if (baseline.abv !== current.abv) reviewTriggers.push("ABV");
  if (baseline.containerType !== current.containerType) reviewTriggers.push("container type");
  if (baseline.storageCapacity !== current.storageCapacity) reviewTriggers.push("storage capacity");
  if (baseline.memoryRam !== current.memoryRam) reviewTriggers.push("memory");
  if (baseline.connectivity !== current.connectivity) reviewTriggers.push("connectivity");
  if (baseline.compatibility !== current.compatibility) reviewTriggers.push("compatibility");
  if (baseline.sizeSystem !== current.sizeSystem) reviewTriggers.push("size system");
  if (baseline.material !== current.material) reviewTriggers.push("material");
  if (baseline.ringSize !== current.ringSize) reviewTriggers.push("ring size");
  if (baseline.strapLength !== current.strapLength) reviewTriggers.push("strap length");
  if (baseline.bookFormat !== current.bookFormat) reviewTriggers.push("format");
  if (baseline.language !== current.language) reviewTriggers.push("language");
  if (baseline.ageRange !== current.ageRange) reviewTriggers.push("age range");
  if (baseline.modelFitment !== current.modelFitment) reviewTriggers.push("fitment");
  if (baseline.parcelPreset !== current.parcelPreset) reviewTriggers.push("parcel preset");
  if (baseline.shippingClass !== current.shippingClass) reviewTriggers.push("shipping class");
  if (baseline.sku !== current.sku) reviewTriggers.push("SKU");
  if (baseline.barcode !== current.barcode) reviewTriggers.push("barcode");
  if (baseline.color !== current.color) reviewTriggers.push("color");
  if (JSON.stringify(baseline.imageKeys) !== JSON.stringify(current.imageKeys)) reviewTriggers.push("images");
  if (baseline.unitCount !== current.unitCount || baseline.volume !== current.volume || baseline.volumeUnit !== current.volumeUnit) {
    reviewTriggers.push("pack details");
  }
  if (baseline.isDefault !== current.isDefault) reviewTriggers.push("default selection");
  if (baseline.isActive !== current.isActive) reviewTriggers.push("variant visibility");

  if (baseline.sellingPriceIncl !== current.sellingPriceIncl) liveChanges.push("price");
  if (
    baseline.isOnSale !== current.isOnSale ||
    baseline.saleDiscountPercent !== current.saleDiscountPercent
  ) {
    liveChanges.push("sale pricing");
  }
  if (baseline.inventoryQty !== current.inventoryQty) liveChanges.push("stock");
  if (baseline.continueSellingOutOfStock !== current.continueSellingOutOfStock) liveChanges.push("availability handling");
  if (baseline.trackInventory !== current.trackInventory) liveChanges.push("inventory tracking");

  if (reviewTriggers.length) {
    const preview = reviewTriggers.slice(0, 3).join(", ");
    const remaining = reviewTriggers.length > 3 ? ` and ${reviewTriggers.length - 3} more` : "";
    const hasReviewHistory = hasEnteredReviewFlow(moderationStatus) || String(moderationStatus ?? "").trim().toLowerCase() === "published";
    if (!hasReviewHistory) {
      return {
        tone: "neutral" as const,
        title: "Current variant changes will be included in review",
        message: `Your unsaved variant edits affect ${preview}${remaining}. Save them when you are ready. Piessang will only review the listing once you submit it.`,
      };
    }
    return {
      tone: "review" as const,
      title: "Current variant changes will require review",
      message: `Your unsaved variant edits affect ${preview}${remaining}. Save them when you are ready, then re-submit the listing for review.`,
    };
  }

  if (liveChanges.length) {
    return {
      tone: "live" as const,
      title: "Current variant changes can update without re-review",
      message: `Your unsaved variant edits only affect ${liveChanges.join(", ")}. These changes do not trigger another listing review.`,
    };
  }

  return {
    tone: "neutral" as const,
    title: "No unsaved variant changes detected",
    message: "The variant form currently matches the last saved version.",
  };
}

function getProductChangeImpactSummary({
  baseline,
  current,
  hasSavedProduct,
  moderationStatus,
}: {
  baseline: ProductEditorBaseline | null;
  current: ProductEditorBaseline;
  hasSavedProduct: boolean;
  moderationStatus?: string | null;
}) {
  if (!hasSavedProduct) {
    return {
      tone: "neutral" as const,
      title: "Save the draft first",
      message: "Once this product has been saved, Piessang will show whether later edits update live immediately or require review.",
    };
  }

  if (!baseline) {
    return {
      tone: "neutral" as const,
      title: "Checking change impact",
      message: "Piessang is comparing your current edits against the last saved version.",
    };
  }

  const reviewTriggers: string[] = [];
  const liveChanges: string[] = [];

  if (baseline.title !== current.title) reviewTriggers.push("title");
  if (baseline.category !== current.category) reviewTriggers.push("primary category");
  if (baseline.subCategory !== current.subCategory) reviewTriggers.push("sub category");
  if (baseline.condition !== current.condition) reviewTriggers.push("condition");
  if (baseline.brandSlug !== current.brandSlug || baseline.brandTitle !== current.brandTitle) reviewTriggers.push("brand");
  if (baseline.overview !== current.overview) reviewTriggers.push("overview");
  if (baseline.description !== current.description) reviewTriggers.push("description");
  if (JSON.stringify(baseline.keywords) !== JSON.stringify(current.keywords)) reviewTriggers.push("keywords");
  if (JSON.stringify(baseline.imageKeys) !== JSON.stringify(current.imageKeys)) reviewTriggers.push("images");
  if (baseline.fulfillmentMode !== current.fulfillmentMode) reviewTriggers.push("fulfilment mode");

  if (baseline.inventoryTracking !== current.inventoryTracking) {
    liveChanges.push("inventory tracking");
  }

  if (reviewTriggers.length) {
    const preview = reviewTriggers.slice(0, 3).join(", ");
    const remaining = reviewTriggers.length > 3 ? ` and ${reviewTriggers.length - 3} more` : "";
    const normalizedStatus = String(moderationStatus ?? "").trim().toLowerCase();
    const hasReviewHistory = hasEnteredReviewFlow(normalizedStatus) || normalizedStatus === "published";
    if (!hasReviewHistory) {
      return {
        tone: "neutral" as const,
        title: "Current draft changes will be included in review",
        message: `Your unsaved edits affect ${preview}${remaining}. Save them when you are ready. Piessang will only review this listing once you submit it.`,
      };
    }
    return {
      tone: "review" as const,
      title: "Current draft changes will require review",
      message: `Your unsaved edits affect ${preview}${remaining}. Save them when you are ready, then re-submit the listing for review.`,
    };
  }

  if (liveChanges.length) {
    return {
      tone: "live" as const,
      title: "Current draft changes can update without re-review",
      message: `Your unsaved edits only affect ${liveChanges.join(", ")}. These changes do not trigger another product review.`,
    };
  }

  return {
    tone: "neutral" as const,
    title: "No unsaved product changes detected",
    message: "The saved product details and the current product form match right now.",
  };
}

function variantEffectiveSellingPriceIncl(variantLike: {
  pricing?: { selling_price_incl?: number | string | null };
  sale?: { is_on_sale?: boolean; discount_percent?: number | string | null; sale_price_incl?: number | string | null };
}) {
  const basePriceIncl = money2(variantLike?.pricing?.selling_price_incl || 0);
  const salePriceIncl = money2(variantLike?.sale?.sale_price_incl || 0);
  const discountPercent = Math.max(0, Math.min(100, Number(variantLike?.sale?.discount_percent || 0)));
  const isOnSale = Boolean(variantLike?.sale?.is_on_sale) && discountPercent > 0;

  if (isOnSale && salePriceIncl > 0) return salePriceIncl;
  if (isOnSale) return money2(basePriceIncl * (1 - discountPercent / 100));
  return basePriceIncl;
}

function notifyAdminBadgeRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("piessang:refresh-admin-badges"));
}

function normalizeVolumeUnit(value: string) {
  const lower = String(value ?? "").trim().toLowerCase();
  if (["l", "lt", "liter", "litre", "liters", "litres"].includes(lower)) return "lt";
  if (["kg", "kgs", "kilogram", "kilograms"].includes(lower)) return "kg";
  if (["g", "grams", "gram"].includes(lower)) return "g";
  if (["small", "medium", "large", "ml", "each"].includes(lower)) return lower;
  return "each";
}

function isPreLovedCategory(category: string) {
  const normalized = String(category ?? "").trim().toLowerCase();
  return normalized === "pre-loved" || normalized === "preloved";
}

function isApparelProduct(category: string, subCategory: string) {
  const categorySlug = String(category ?? "").trim().toLowerCase();
  const subCategorySlug = String(subCategory ?? "").trim().toLowerCase();
  const apparelSubCategories = new Set([
    "fashion-accessories",
    "clothing-footwear",
    "clothing",
    "footwear",
    "baby-clothing",
  ]);
  return apparelSubCategories.has(subCategorySlug)
    || ["fashion", "fashion-accessories"].includes(categorySlug)
    || (isPreLovedCategory(categorySlug) && subCategorySlug === "fashion-accessories");
}

function isBeautyProduct(category: string, subCategory: string) {
  const categorySlug = String(category ?? "").trim().toLowerCase();
  const subCategorySlug = String(subCategory ?? "").trim().toLowerCase();
  const beautyCategories = new Set(["beauty-personal-care", "health-personal-care"]);
  const beautySubCategories = new Set([
    "beauty",
    "body-care",
    "hair-care",
    "skin-care",
    "cosmetics",
    "fragrances",
    "personal-care",
    "shaving-grooming",
  ]);
  return beautyCategories.has(categorySlug) || beautySubCategories.has(subCategorySlug);
}

function isCosmeticsProduct(subCategory: string) {
  return String(subCategory ?? "").trim().toLowerCase() === "cosmetics";
}

function isFragranceProduct(subCategory: string) {
  return String(subCategory ?? "").trim().toLowerCase() === "fragrances";
}

function isSkinCareProduct(subCategory: string) {
  const normalized = String(subCategory ?? "").trim().toLowerCase();
  return normalized === "skin-care" || normalized === "beauty";
}

function isHairCareProduct(subCategory: string) {
  const normalized = String(subCategory ?? "").trim().toLowerCase();
  return normalized === "hair-care" || normalized === "shaving-grooming";
}

function isBeverageProduct(category: string, subCategory: string) {
  const categorySlug = String(category ?? "").trim().toLowerCase();
  const subCategorySlug = String(subCategory ?? "").trim().toLowerCase();
  const beverageCategories = new Set(["beverages", "alcohol-liquor"]);
  const beverageSubCategories = new Set([
    "soft-drinks",
    "water",
    "juices",
    "beer",
    "wine",
    "spirits",
    "fortified-wine",
    "craft-beer",
    "imported-beer",
    "sparkling-wine",
  ]);
  return beverageCategories.has(categorySlug) || beverageSubCategories.has(subCategorySlug);
}

function isLiquorProduct(category: string, subCategory: string) {
  const categorySlug = String(category ?? "").trim().toLowerCase();
  const subCategorySlug = String(subCategory ?? "").trim().toLowerCase();
  return categorySlug === "alcohol-liquor" || ["beer", "wine", "spirits", "fortified-wine", "craft-beer", "imported-beer", "sparkling-wine"].includes(subCategorySlug);
}

function isElectronicsProduct(category: string, subCategory: string) {
  const categorySlug = String(category ?? "").trim().toLowerCase();
  const subCategorySlug = String(subCategory ?? "").trim().toLowerCase();
  const electronicCategories = new Set([
    "electronics-accessories",
    "audio-visual-electronics",
    "certified-pre-owned-electronics",
    "computers-hardware",
    "gaming",
    "cellphones-tablets",
    "home-and-office-electronics",
  ]);
  const electronicSubCategories = new Set([
    "audio",
    "home-audio",
    "tv-audio",
    "wearables",
    "electronics",
    "computers-laptops",
    "desktop-computers-workstations",
    "gaming-accessories",
    "cellphones",
    "tablets-ereaders",
    "home-office-electronics",
  ]);
  return electronicCategories.has(categorySlug) || electronicSubCategories.has(subCategorySlug);
}

function isPortableElectronicsProduct(subCategory: string) {
  const normalized = String(subCategory ?? "").trim().toLowerCase();
  return ["cellphones", "tablets-ereaders", "wearables", "electronics", "computers-laptops"].includes(normalized);
}

function isFootwearProduct(category: string, subCategory: string) {
  const categorySlug = String(category ?? "").trim().toLowerCase();
  const subCategorySlug = String(subCategory ?? "").trim().toLowerCase();
  return ["footwear", "clothing-footwear", "footwear-accessories"].includes(subCategorySlug)
    || ["fashion", "fashion-accessories"].includes(categorySlug);
}

function isJewelleryProduct(subCategory: string) {
  return String(subCategory ?? "").trim().toLowerCase() === "jewellery-watches";
}

function isBookMediaProduct(category: string, subCategory: string) {
  const categorySlug = String(category ?? "").trim().toLowerCase();
  const subCategorySlug = String(subCategory ?? "").trim().toLowerCase();
  return ["media-entertainment"].includes(categorySlug) || ["books", "books-media"].includes(subCategorySlug);
}

function isBabyProduct(category: string, subCategory: string) {
  const categorySlug = String(category ?? "").trim().toLowerCase();
  const subCategorySlug = String(subCategory ?? "").trim().toLowerCase();
  return ["baby", "baby-toddler"].includes(categorySlug)
    || ["baby-care", "baby-food", "baby-bath", "baby-health", "baby-equipment-furniture", "mom-baby-care", "baby-food-nutrition", "baby-kids"].includes(subCategorySlug);
}

function isFitmentProduct(category: string, subCategory: string) {
  const categorySlug = String(category ?? "").trim().toLowerCase();
  const subCategorySlug = String(subCategory ?? "").trim().toLowerCase();
  return ["diy-automotive"].includes(categorySlug)
    || ["automotive-parts-accessories", "motorcycle-parts-accessories", "tools-machinery"].includes(subCategorySlug);
}

function normalizePreLovedCondition(value: string) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return PRE_LOVED_CONDITIONS.some((item) => item.value === normalized) ? normalized : "";
}

function formatVariantSize(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const upper = normalized.toUpperCase();
  if (APPAREL_SIZE_OPTIONS.some((item) => item.toUpperCase() === upper)) return normalized;
  return normalized;
}

function getParcelPresetMeta(value: string) {
  return PARCEL_PRESET_OPTIONS.find((item) => item.value === value) || null;
}

function variantPriceIncl(value?: ProductVariantItem | null) {
  const explicit = Number(value?.pricing?.selling_price_incl);
  if (Number.isFinite(explicit) && explicit > 0) return money2(explicit);
  const legacy = Number(value?.pricing?.selling_price_excl);
  if (Number.isFinite(legacy) && legacy > 0) return exclToIncl(legacy);
  return 0;
}

function variantSalePriceIncl(value?: ProductVariantItem | null) {
  const explicit = Number(value?.sale?.sale_price_incl);
  if (Number.isFinite(explicit) && explicit > 0) return money2(explicit);
  const legacy = Number(value?.sale?.sale_price_excl);
  if (Number.isFinite(legacy) && legacy > 0) return exclToIncl(legacy);
  return 0;
}

function sanitizeProductTitle(value: string) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 120);
}

function sanitizeKeywords(value: string) {
  return String(value ?? "")
    .split(",")
    .map((item) => sanitizeText(item))
    .filter(Boolean)
    .map((item) => item.toLowerCase())
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 12);
}

function parseKeywordTokens(value: string) {
  return sanitizeKeywords(value).slice(0, 10);
}

function stripHtml(value: string) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function plainTextToHtml(value: string) {
  const safe = String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return safe
    .split(/\n+/)
    .map((part) => `<p>${part.trim() || "<br>"}</p>`)
    .join("");
}

function formatModerationStatus(status: string) {
  const normalized = String(status ?? "").toLowerCase();
  if (!normalized) return "draft";
  if (normalized === "awaiting_stock") return "awaiting stock from supplier";
  if (normalized === "in_review") return "in review";
  if (normalized === "blocked") return "blocked";
  return normalized.replace(/_/g, " ");
}

function SparklesIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 2.75l1.4 4.1a2 2 0 0 0 1.26 1.26l4.1 1.4-4.1 1.4a2 2 0 0 0-1.26 1.26L12 16.25l-1.4-4.1a2 2 0 0 0-1.26-1.26l-4.1-1.4 4.1-1.4a2 2 0 0 0 1.26-1.26L12 2.75Z"
        fill="currentColor"
      />
      <path
        d="M5 14.5l.7 2.05a1 1 0 0 0 .63.63L8.38 18l-2.05.82a1 1 0 0 0-.63.63L5 21.5l-.7-2.05a1 1 0 0 0-.63-.63L1.62 18l2.05-.82a1 1 0 0 0 .63-.63L5 14.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SpinnerIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 3a9 9 0 1 0 9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M20 7L9 18l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

function EyeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M2.8 12s3.4-6.2 9.2-6.2S21.2 12 21.2 12s-3.4 6.2-9.2 6.2S2.8 12 2.8 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ChevronUpIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M6 14l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M6 10l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DragGripIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HelpTip({
  label,
  children,
  className = "",
}: {
  label: string;
  children: string;
  className?: string;
}) {
  return (
    <span className={["group relative inline-flex items-center", className].join(" ")}>
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#907d4c] transition-colors hover:bg-[rgba(203,178,107,0.12)] hover:text-[#6b5a2d]"
        aria-label={label}
      >
        <InfoIcon className="h-4 w-4" />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-64 -translate-x-1/2 rounded-[8px] border border-black/10 bg-[#202020] px-3 py-2 text-left text-[11px] leading-[1.45] text-white shadow-[0_12px_26px_rgba(20,24,27,0.2)] group-hover:block group-focus-within:block">
        {children}
      </span>
    </span>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4.5 6h15M9 6V4.8c0-.44.36-.8.8-.8h4.4c.44 0 .8.36.8.8V6m-7.2 0 .7 12.2c.03.55.49.98 1.04.98h4.88c.55 0 1.01-.43 1.04-.98L15.5 6M10 10v5M14 10v5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BlurHashPreview({ blurhash, className = "" }: { blurhash: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!blurhash || !canvasRef.current) return;

    let active = true;
    let imageData: ImageData | null = null;

    try {
      const width = 32;
      const height = 32;
      const pixels = decode(blurhash, width, height);
      const context = canvasRef.current.getContext("2d");
      if (!context) return;
      imageData = context.createImageData(width, height);
      imageData.data.set(pixels);
      if (!active) return;
      canvasRef.current.width = width;
      canvasRef.current.height = height;
      context.putImageData(imageData, 0, 0);
    } catch {
      const context = canvasRef.current.getContext("2d");
      if (!context) return;
      canvasRef.current.width = 8;
      canvasRef.current.height = 8;
      context.fillStyle = "#f3f1eb";
      context.fillRect(0, 0, 8, 8);
    }

    return () => {
      active = false;
    };
  }, [blurhash]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

function ProductImageCard({
  image,
  index,
  onMove,
  onDropImage,
  onRemove,
  onAltChange,
  onDragStartImage,
  onDragEndImage,
  onDragEnterImage,
  canMoveUp,
  canMoveDown,
  isDragging,
  isDropTarget,
}: {
  image: ProductImage;
  index: number;
  onMove: (index: number, direction: "up" | "down") => void;
  onDropImage: (fromIndex: number, toIndex: number) => void;
  onRemove: (index: number) => void;
  onAltChange: (index: number, altText: string) => void;
  onDragStartImage: (index: number) => void;
  onDragEndImage: () => void;
  onDragEnterImage: (index: number) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [image.imageUrl, image.blurHashUrl]);

  return (
    <div
      className={[
        "w-[148px] shrink-0 rounded-[8px] border bg-white p-2.5 shadow-[0_6px_16px_rgba(20,24,27,0.06)] transition-all",
        isDragging ? "border-[#cbb26b] opacity-70 scale-[0.98]" : "border-black/10",
        isDropTarget ? "ring-2 ring-[#cbb26b] ring-offset-2 ring-offset-white" : "",
      ].join(" ")}
      draggable
      onDragStart={(event) => {
        onDragStartImage(index);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
      }}
      onDragEnd={() => {
        onDragEndImage();
      }}
      onDragEnter={() => {
        onDragEnterImage(index);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const fromIndex = Number(event.dataTransfer.getData("text/plain"));
        if (Number.isFinite(fromIndex)) {
          onDropImage(fromIndex, index);
        }
        onDragEndImage();
      }}
    >
      <div className="relative aspect-square overflow-hidden rounded-[8px] bg-[#f4f4f4]">
        <BlurHashPreview
          blurhash={image.blurHashUrl}
          className={[
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
            loaded ? "opacity-0" : "opacity-100",
          ].join(" ")}
        />
        <img
          src={image.imageUrl}
          alt={image.altText || image.fileName}
          className={[
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          ].join(" ")}
          onLoad={() => setLoaded(true)}
        />
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => onMove(index, "up")}
            disabled={!canMoveUp}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-black/10 bg-white/90 text-[#202020] shadow-[0_4px_12px_rgba(20,24,27,0.08)] transition-colors hover:border-[#cbb26b] hover:text-[#907d4c] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Move image up"
          >
            <ChevronUpIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, "down")}
            disabled={!canMoveDown}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-black/10 bg-white/90 text-[#202020] shadow-[0_4px_12px_rgba(20,24,27,0.08)] transition-colors hover:border-[#cbb26b] hover:text-[#907d4c] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Move image down"
          >
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="absolute left-2 bottom-2 inline-flex items-center gap-1 rounded-[8px] bg-black/72 px-2 py-1 text-[10px] font-semibold text-white">
          <DragGripIcon className="h-3 w-3" />
          <span>Drag</span>
        </div>
      </div>
      <div className="mt-2 space-y-2">
        <p className="truncate text-[11px] font-medium text-[#202020]">{image.fileName}</p>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Alt text</span>
          <input
            value={image.altText}
            onChange={(event) => onAltChange(index, event.target.value)}
            className="w-full rounded-[8px] border border-black/10 bg-white px-2.5 py-2 text-[11px] outline-none transition-colors focus:border-[#cbb26b]"
            placeholder="Describe this image"
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-[8px] border border-black/10 bg-white text-[12px] text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#b91c1c]"
            aria-label={`Remove ${image.fileName}`}
          >
            <TrashIcon className="h-3.5 w-3.5" />
            <span>Remove</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SwatchPicker({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={["flex flex-wrap gap-2", className].join(" ")}>
      {COLOR_SWATCHES.map((swatch) => {
        const selected = value.toLowerCase() === swatch.toLowerCase();
        return (
          <button
            key={swatch}
            type="button"
            onClick={() => onChange(swatch)}
            className={[
              "h-8 w-8 rounded-[8px] border transition-transform hover:scale-[1.04]",
              selected ? "border-[#202020] ring-2 ring-[#cbb26b] ring-offset-2 ring-offset-white" : "border-black/10",
            ].join(" ")}
            style={{ backgroundColor: swatch }}
            aria-label={`Select ${swatch} color`}
          />
        );
      })}
    </div>
  );
}

function RichTextEditor({
  value,
  onChange,
  placeholder,
  editorRef,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  editorRef: RefObject<HTMLDivElement | null>;
  maxLength?: number;
}) {
  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    if (node.innerHTML !== value) {
      node.innerHTML = value || "<p><br></p>";
    }
  }, [editorRef, value]);

  function applyFormat(command: "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList") {
    editorRef.current?.focus();
    document.execCommand(command, false);
    onChange(editorRef.current?.innerHTML ?? "");
  }

  return (
    <div className="overflow-hidden rounded-[8px] border border-black/10 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-black/5 bg-[#fafafa] px-2 py-2">
        {[
          { label: "B", command: "bold" as const },
          { label: "I", command: "italic" as const },
          { label: "U", command: "underline" as const },
          { label: "• List", command: "insertUnorderedList" as const },
          { label: "1. List", command: "insertOrderedList" as const },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => applyFormat(item.command)}
            className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#907d4c]"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => {
          const current = editorRef.current?.innerHTML ?? "";
          if (typeof maxLength === "number") {
            const plain = stripHtml(current);
            if (plain.length > maxLength && editorRef.current) {
              const truncated = plainTextToHtml(plain.slice(0, maxLength));
              editorRef.current.innerHTML = truncated;
              onChange(truncated);
              return;
            }
          }
          onChange(current);
        }}
        className="min-h-[180px] px-4 py-3 text-[13px] leading-[1.6] text-[#202020] outline-none"
        data-placeholder={placeholder}
        style={{ whiteSpace: "pre-wrap" }}
      />
      <style jsx>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #9aa3af;
        }
      `}</style>
    </div>
  );
}

function SellerCatalogueNewPageContent() {
  return <SellerCatalogueEditor />;
}

export default function SellerCatalogueNewPage() {
  return (
    <Suspense
      fallback={
        <PageBody className="px-4 py-6 lg:px-6">
          <div className="mx-auto w-full max-w-[1200px]">
            <SellerPageIntro
              title="Create product"
              description="Loading your product editor..."
            />
          </div>
        </PageBody>
      }
    >
      <SellerCatalogueNewPageContent />
    </Suspense>
  );
}

type SellerCatalogueEditorProps = {
  editorProductIdOverride?: string;
  sellerOverride?: string;
  embeddedMode?: boolean;
};

export function SellerCatalogueEditor({
  editorProductIdOverride,
  sellerOverride,
  embeddedMode = false,
}: SellerCatalogueEditorProps = {}) {
  const { authReady, isAuthenticated, isSeller, profile, openAuthModal, openSellerRegistrationModal } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const variantUploadInputRef = useRef<HTMLInputElement | null>(null);
  const uniqueCodeRequestRef = useRef(0);
  const editorProductId = useMemo(
    () => {
      const nextId =
        editorProductIdOverride ??
        searchParams.get("unique_id")?.trim() ??
        searchParams.get("id")?.trim() ??
        "";
      return String(nextId).trim();
    },
    [editorProductIdOverride, searchParams],
  );
  const hasEditorTarget = useMemo(
    () =>
      Boolean(
        String(editorProductIdOverride ?? "").trim() ||
        searchParams.get("unique_id")?.trim() ||
        searchParams.get("id")?.trim(),
      ),
    [editorProductIdOverride, searchParams],
  );
  const hasEditorTargetRef = useRef(hasEditorTarget);
  useEffect(() => {
    hasEditorTargetRef.current = hasEditorTarget;
    if (hasEditorTarget) {
      uniqueCodeRequestRef.current += 1;
      setGeneratingCode(false);
    }
  }, [hasEditorTarget]);

  const sellerContexts = useMemo<SellerContextItem[]>(() => {
    const items: SellerContextItem[] = [];
    const seen = new Set<string>();
    const add = (sellerSlug: string, sellerCode: string, vendorName: string, status: string | null, blockedReasonCode: string | null, blockedReasonMessage: string | null) => {
      const slug = String(sellerSlug ?? "").trim();
      const code = String(sellerCode ?? "").trim();
      const name = String(vendorName ?? "").trim();
      const key = slug || code;
      if (!key || seen.has(key)) return;
      seen.add(key);
      items.push({
        sellerSlug: slug || code,
        sellerCode: code || slug,
        vendorName: name || slug,
        status,
        blockedReasonCode,
        blockedReasonMessage,
      });
    };

    add(
      profile?.sellerActiveSellerSlug?.trim() || profile?.sellerSlug?.trim() || "",
      profile?.sellerCode?.trim() || "",
      profile?.sellerVendorName ?? profile?.accountName ?? "",
      profile?.sellerStatus ?? null,
      profile?.sellerBlockedReasonCode ?? null,
      profile?.sellerBlockedReasonMessage ?? null,
    );

    for (const managed of profile?.sellerManagedAccounts ?? []) {
      add(
        managed?.sellerSlug?.trim() || "",
        managed?.sellerCode?.trim() || "",
        managed?.vendorName?.trim() || "",
        managed?.status ?? null,
        managed?.blockedReasonCode ?? null,
        managed?.blockedReasonMessage ?? null,
      );
    }

    return items;
  }, [profile?.accountName, profile?.sellerActiveSellerSlug, profile?.sellerCode, profile?.sellerManagedAccounts, profile?.sellerSlug, profile?.sellerVendorName]);

  const activeSellerSlug = useMemo(() => {
    const currentSeller = String(sellerOverride ?? searchParams.get("seller")?.trim() ?? "").trim();
    if (currentSeller && sellerContexts.some((item) => item.sellerSlug === currentSeller)) {
      return currentSeller;
    }
    return sellerContexts[0]?.sellerSlug || profile?.sellerActiveSellerSlug?.trim() || profile?.sellerSlug?.trim() || profile?.sellerCode?.trim() || "";
  }, [profile?.sellerActiveSellerSlug, profile?.sellerCode, profile?.sellerSlug, searchParams, sellerContexts, sellerOverride]);

  const activeSellerContext = useMemo(() => {
    return sellerContexts.find((item) => item.sellerSlug === activeSellerSlug) ?? sellerContexts[0] ?? null;
  }, [activeSellerSlug, sellerContexts]);
  const isSystemAdmin = String(profile?.systemAccessType ?? "").trim().toLowerCase() === "admin";
  const canUseSellerEditor = isSeller || isSystemAdmin;
  const vendorName = activeSellerContext?.vendorName ?? profile?.sellerVendorName ?? "";
  const sellerBlocked = String(activeSellerContext?.status || profile?.sellerStatus || "").trim().toLowerCase() === "blocked";
  const sellerBlockedReasonCode = activeSellerContext?.blockedReasonCode || profile?.sellerBlockedReasonCode || "other";
  const sellerBlockedReasonLabel = getSellerBlockReasonLabel(sellerBlockedReasonCode);
  const sellerBlockedFixHint = getSellerBlockReasonFix(sellerBlockedReasonCode);

  const [uniqueId, setUniqueId] = useState("");
  const [productSku, setProductSku] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [brandName, setBrandName] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<SelectedBrand | null>(null);
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
  const [overview, setOverview] = useState("");
  const [description, setDescription] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordTags, setKeywordTags] = useState<string[]>([]);
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [variantImages, setVariantImages] = useState<ProductImage[]>([]);
  const [variantItems, setVariantItems] = useState<ProductVariantItem[]>([]);
  const [variantDraft, setVariantDraft] = useState<VariantDraft>({
    variantId: "",
    label: "",
    size: "",
    shade: "",
    scent: "",
    skinType: "",
    hairType: "",
    flavor: "",
    abv: "",
    containerType: "",
    storageCapacity: "",
    memoryRam: "",
    connectivity: "",
    compatibility: "",
    sizeSystem: "",
    material: "",
    ringSize: "",
    strapLength: "",
    bookFormat: "",
    language: "",
    ageRange: "",
    modelFitment: "",
    parcelPreset: "",
    shippingClass: "",
    sku: "",
    barcode: "",
    barcodeImageUrl: "",
    unitCount: "1",
    volume: "",
    volumeUnit: "ml",
    color: "",
    hasColor: false,
    sellingPriceIncl: "",
    isOnSale: false,
    saleDiscountPercent: "",
    isDefault: false,
    isActive: true,
    continueSellingOutOfStock: false,
    trackInventory: false,
    inventoryQty: "",
    warehouseId: "",
    weightKg: "",
    lengthCm: "",
    widthCm: "",
    heightCm: "",
    monthlySales30d: "",
  });
  const [inventoryTracking, setInventoryTracking] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState<"seller" | "bevgo">("seller");
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [draggedVariantImageIndex, setDraggedVariantImageIndex] = useState<number | null>(null);
  const [dropTargetVariantImageIndex, setDropTargetVariantImageIndex] = useState<number | null>(null);
  const [brandSuggestions, setBrandSuggestions] = useState<BrandSuggestion[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [generatingOverview, setGeneratingOverview] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [generatingKeywords, setGeneratingKeywords] = useState(false);
  const [generatingSku, setGeneratingSku] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingVariantImages, setUploadingVariantImages] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [variantFormOpen, setVariantFormOpen] = useState(false);
  const [editingVariantIndex, setEditingVariantIndex] = useState<number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showFulfillmentChangeModal, setShowFulfillmentChangeModal] = useState(false);
  const [showDraftImpactModal, setShowDraftImpactModal] = useState(false);
  const [draftImpactModalTitle, setDraftImpactModalTitle] = useState("Confirm changes");
  const [draftImpactModalMessage, setDraftImpactModalMessage] = useState("");
  const [showSidebarSummaryDrawer, setShowSidebarSummaryDrawer] = useState(false);
  const [showPublishDrawer, setShowPublishDrawer] = useState(false);
  const [showMobileToolsDrawer, setShowMobileToolsDrawer] = useState(false);
  const [publishChecklistPulse, setPublishChecklistPulse] = useState(false);
  const [fulfillmentChangeNote, setFulfillmentChangeNote] = useState("");
  const [skuStatus, setSkuStatus] = useState<"idle" | "checking" | "unique" | "taken" | "error">("idle");
  const [variantSkuStatus, setVariantSkuStatus] = useState<"idle" | "checking" | "unique" | "taken" | "error">("idle");
  const [variantBarcodeStatus, setVariantBarcodeStatus] = useState<"idle" | "checking" | "unique" | "taken" | "error">("idle");
  const [generatingVariantBarcode, setGeneratingVariantBarcode] = useState(false);
  const [inboundBookings, setInboundBookings] = useState<any[]>([]);
  const [loadingInboundBookings, setLoadingInboundBookings] = useState(false);
  const [savingInboundBooking, setSavingInboundBooking] = useState(false);
  const [inboundDeliveryDate, setInboundDeliveryDate] = useState("");
  const [inboundNotes, setInboundNotes] = useState("");
  const [inboundQuantities, setInboundQuantities] = useState<Record<string, string>>({});
  const [stockUpliftments, setStockUpliftments] = useState<any[]>([]);
  const [loadingStockUpliftments, setLoadingStockUpliftments] = useState(false);
  const [savingStockUpliftment, setSavingStockUpliftment] = useState(false);
  const [upliftDate, setUpliftDate] = useState("");
  const [upliftNotes, setUpliftNotes] = useState("");
  const [upliftReason, setUpliftReason] = useState("");
  const [upliftQuantities, setUpliftQuantities] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [productDisputeMessage, setProductDisputeMessage] = useState("");
  const [productDisputeSubmitting, setProductDisputeSubmitting] = useState(false);
  const [createdProduct, setCreatedProduct] = useState<CreatedProductSummary | null>(null);
  const [productEditorBaseline, setProductEditorBaseline] = useState<ProductEditorBaseline | null>(null);
  const [loadedProductSku, setLoadedProductSku] = useState("");
  const [loadedProductSellerCode, setLoadedProductSellerCode] = useState("");
  const [loadedProductSellerSlug, setLoadedProductSellerSlug] = useState("");
  const [loadedProductVendorName, setLoadedProductVendorName] = useState("");
  const effectiveSellerSettingsIdentifier = useMemo(
    () =>
      String(
        loadedProductSellerSlug ||
          loadedProductSellerCode ||
          activeSellerContext?.sellerSlug ||
          activeSellerContext?.sellerCode ||
          activeSellerSlug ||
          "",
      ).trim(),
    [activeSellerContext?.sellerCode, activeSellerContext?.sellerSlug, activeSellerSlug, loadedProductSellerCode, loadedProductSellerSlug],
  );
  const [productAccessDenied, setProductAccessDenied] = useState(false);
  const [feeConfig, setFeeConfig] = useState(DEFAULT_MARKETPLACE_FEE_CONFIG);
  const [sellerDeliverySettingsReady, setSellerDeliverySettingsReady] = useState(true);
  const [sellerWeightBasedShippingRequired, setSellerWeightBasedShippingRequired] = useState(false);
  const draftImpactResolverRef = useRef<((value: boolean) => void) | null>(null);
  const marketplaceCategories = useMemo(
    () => (feeConfig?.categories?.length ? feeConfig.categories : SELLER_CATALOGUE_CATEGORIES),
    [feeConfig],
  );
  const subCategories = useMemo(() => getMarketplaceCatalogueSubCategories(category, marketplaceCategories), [category, marketplaceCategories]);
  const isPreLovedProductDraft = useMemo(() => isPreLovedCategory(category), [category]);
  const isApparelProductDraft = useMemo(() => isApparelProduct(category, subCategory), [category, subCategory]);
  const isBeautyProductDraft = useMemo(() => isBeautyProduct(category, subCategory), [category, subCategory]);
  const isCosmeticsProductDraft = useMemo(() => isCosmeticsProduct(subCategory), [subCategory]);
  const isFragranceProductDraft = useMemo(() => isFragranceProduct(subCategory), [subCategory]);
  const isSkinCareProductDraft = useMemo(() => isSkinCareProduct(subCategory), [subCategory]);
  const isHairCareProductDraft = useMemo(() => isHairCareProduct(subCategory), [subCategory]);
  const isBeverageProductDraft = useMemo(() => isBeverageProduct(category, subCategory), [category, subCategory]);
  const isLiquorProductDraft = useMemo(() => isLiquorProduct(category, subCategory), [category, subCategory]);
  const isElectronicsProductDraft = useMemo(() => isElectronicsProduct(category, subCategory), [category, subCategory]);
  const isPortableElectronicsProductDraft = useMemo(() => isPortableElectronicsProduct(subCategory), [subCategory]);
  const isFootwearProductDraft = useMemo(() => isFootwearProduct(category, subCategory), [category, subCategory]);
  const isJewelleryProductDraft = useMemo(() => isJewelleryProduct(subCategory), [subCategory]);
  const isBookMediaProductDraft = useMemo(() => isBookMediaProduct(category, subCategory), [category, subCategory]);
  const isBabyProductDraft = useMemo(() => isBabyProduct(category, subCategory), [category, subCategory]);
  const isFitmentProductDraft = useMemo(() => isFitmentProduct(category, subCategory), [category, subCategory]);

  const descriptionEditorRef = useRef<HTMLDivElement | null>(null);
  const previousReadyRequirementCountRef = useRef(0);
  const productTitleSlug = useMemo(() => normalizeSlug(title), [title]);
  const descriptionPlainText = useMemo(() => stripHtml(description), [description]);
  const titleHasValue = title.trim().length > 0;
  const aiHelpersEnabled = titleHasValue;
  const aiHelperPrompt = "Add a product title first to unlock AI help.";
  const normalizedBrandInput = sanitizeText(brandName).toLowerCase();
  const matchingBrand = useMemo(
    () =>
      brandSuggestions.find((item) => {
        const titleMatch = item.title.trim().toLowerCase() === normalizedBrandInput;
        const slugMatch = item.slug.trim().toLowerCase() === normalizeSlug(brandName);
        return titleMatch || slugMatch;
      }) ?? null,
    [brandName, brandSuggestions, normalizedBrandInput],
  );
  const filteredBrandSuggestions = useMemo(() => {
    const term = sanitizeText(brandName).toLowerCase();
    if (!term) return brandSuggestions.slice(0, 6);
    return brandSuggestions
      .filter((item) => {
        const title = item.title.trim().toLowerCase();
        const slug = item.slug.trim().toLowerCase();
        return title.includes(term) || slug.includes(term);
      })
      .slice(0, 6);
  }, [brandName, brandSuggestions]);
  const brandFieldHasValue = brandName.trim().length > 0;
  const inventoryTrackingRequired = fulfillmentMode === "bevgo";
  const inventoryTrackingEnabled = inventoryTrackingRequired || inventoryTracking;
  const inventoryTrackingForProduct = inventoryTrackingEnabled;
  const continueSellingAvailable = fulfillmentMode === "seller" && !inventoryTrackingEnabled;
  const fulfillmentLocked = Boolean(editorProductId || createdProduct?.uniqueId);
  const activeProcessLabel = useMemo(() => {
    if (submitting) return "Saving product...";
    if (uploadingImages) return "Uploading images...";
    if (uploadingVariantImages) return "Uploading variant images...";
    if (generatingCode) return "Refreshing product code...";
    if (generatingSku) return "Generating SKU...";
    if (generatingOverview) return "Generating overview...";
    if (generatingDescription) return "Generating description...";
    if (generatingKeywords) return "Generating keywords...";
    return "";
  }, [
    generatingCode,
    generatingDescription,
    generatingKeywords,
    generatingOverview,
    generatingSku,
    submitting,
    uploadingImages,
    uploadingVariantImages,
  ]);
  const showInitialEditorSkeleton = Boolean(editorProductId) && (loadingProduct || (loadingVariants && !variantItems.length));
  const activeProductId = createdProduct?.uniqueId || editorProductId || "";
  const productChangeImpact = useMemo(
    () =>
      getProductChangeImpactSummary({
        baseline: productEditorBaseline,
        current: createProductEditorBaseline({
          title,
          category,
          subCategory,
          condition,
          brandSlug: selectedBrand?.slug || "",
          brandTitle: selectedBrand?.title || brandName,
          overview,
          description,
          keywords: keywordTags.slice(0, 10),
          imageKeys: imageSignatureFromItems(productImages),
          fulfillmentMode,
          inventoryTracking,
        }),
        hasSavedProduct: Boolean(activeProductId),
        moderationStatus: createdProduct?.moderationStatus,
      }),
    [
      activeProductId,
      brandName,
      category,
      condition,
      description,
      fulfillmentMode,
      inventoryTracking,
      keywordTags,
      overview,
      productEditorBaseline,
      productImages,
      selectedBrand?.slug,
      selectedBrand?.title,
      subCategory,
      title,
    ],
  );
  const variantChangeImpact = useMemo(() => {
    const editingVariant =
      editingVariantIndex !== null && variantItems[editingVariantIndex]
        ? variantItems[editingVariantIndex]
        : null;

    const baseline = editingVariant
      ? createVariantEditorBaseline({
        label: String(editingVariant.label ?? "").trim(),
        size: String((editingVariant as any).size ?? "").trim(),
        shade: String((editingVariant as any).shade ?? "").trim(),
        scent: String((editingVariant as any).scent ?? "").trim(),
        skinType: String((editingVariant as any).skinType ?? "").trim(),
        hairType: String((editingVariant as any).hairType ?? "").trim(),
        flavor: String((editingVariant as any).flavor ?? "").trim(),
        abv: String((editingVariant as any).abv ?? "").trim(),
        containerType: String((editingVariant as any).containerType ?? "").trim(),
        storageCapacity: String((editingVariant as any).storageCapacity ?? "").trim(),
        memoryRam: String((editingVariant as any).memoryRam ?? "").trim(),
        connectivity: String((editingVariant as any).connectivity ?? "").trim(),
        compatibility: String((editingVariant as any).compatibility ?? "").trim(),
        sizeSystem: String((editingVariant as any).sizeSystem ?? "").trim(),
        material: String((editingVariant as any).material ?? "").trim(),
        ringSize: String((editingVariant as any).ringSize ?? "").trim(),
        strapLength: String((editingVariant as any).strapLength ?? "").trim(),
        bookFormat: String((editingVariant as any).bookFormat ?? "").trim(),
        language: String((editingVariant as any).language ?? "").trim(),
        ageRange: String((editingVariant as any).ageRange ?? "").trim(),
        modelFitment: String((editingVariant as any).modelFitment ?? "").trim(),
        parcelPreset: String(editingVariant.logistics?.parcel_preset ?? "").trim(),
        shippingClass: String(editingVariant.logistics?.shipping_class ?? "").trim(),
        sku: String(editingVariant.sku ?? "").trim(),
          barcode: String(editingVariant.barcode ?? "").trim(),
          color: String(editingVariant.color ?? "").trim(),
          imageKeys: Array.isArray(editingVariant.media?.images)
            ? editingVariant.media.images.map((item: any) => String(item?.imageUrl ?? "").trim()).filter(Boolean)
            : [],
          unitCount: String(editingVariant.pack?.unit_count ?? ""),
          volume: String(editingVariant.pack?.volume ?? ""),
          volumeUnit: normalizeVolumeUnit(String(editingVariant.pack?.volume_unit ?? "ml")),
          sellingPriceIncl: String(editingVariant.pricing?.selling_price_incl ?? ""),
          saleDiscountPercent: String(editingVariant.sale?.discount_percent ?? ""),
          isOnSale: Boolean(editingVariant.sale?.is_on_sale),
          inventoryQty: String(editingVariant.inventory?.[0]?.in_stock_qty ?? ""),
          continueSellingOutOfStock: Boolean(editingVariant.placement?.continue_selling_out_of_stock),
          trackInventory: Boolean(editingVariant.placement?.track_inventory),
          isDefault: Boolean(editingVariant.placement?.is_default),
          isActive: Boolean(editingVariant.placement?.isActive ?? true),
        })
      : null;

    return getVariantChangeImpactSummary({
      baseline,
      current: createVariantEditorBaseline({
        label: variantDraft.label,
        size: variantDraft.size,
        shade: variantDraft.shade,
        scent: variantDraft.scent,
        skinType: variantDraft.skinType,
        hairType: variantDraft.hairType,
        flavor: variantDraft.flavor,
        abv: variantDraft.abv,
        containerType: variantDraft.containerType,
        storageCapacity: variantDraft.storageCapacity,
        memoryRam: variantDraft.memoryRam,
        connectivity: variantDraft.connectivity,
        compatibility: variantDraft.compatibility,
        sizeSystem: variantDraft.sizeSystem,
        material: variantDraft.material,
        ringSize: variantDraft.ringSize,
        strapLength: variantDraft.strapLength,
        bookFormat: variantDraft.bookFormat,
        language: variantDraft.language,
        ageRange: variantDraft.ageRange,
        modelFitment: variantDraft.modelFitment,
        parcelPreset: variantDraft.parcelPreset,
        shippingClass: variantDraft.shippingClass,
        sku: variantDraft.sku,
        barcode: variantDraft.barcode,
        color: variantDraft.hasColor ? variantDraft.color : "",
        imageKeys: imageSignatureFromItems(variantImages),
        unitCount: variantDraft.unitCount,
        volume: variantDraft.volume,
        volumeUnit: normalizeVolumeUnit(variantDraft.volumeUnit || "ml"),
        sellingPriceIncl: variantDraft.sellingPriceIncl,
        saleDiscountPercent: variantDraft.saleDiscountPercent,
        isOnSale: variantDraft.isOnSale,
        inventoryQty: variantDraft.inventoryQty,
        continueSellingOutOfStock: variantDraft.continueSellingOutOfStock,
        trackInventory: variantDraft.trackInventory,
        isDefault: variantDraft.isDefault,
        isActive: variantDraft.isActive,
      }),
      hasLiveListing: String(createdProduct?.moderationStatus ?? "").trim().toLowerCase() === "published",
      isEditing: editingVariantIndex !== null,
      moderationStatus: createdProduct?.moderationStatus,
    });
  }, [
    createdProduct?.moderationStatus,
    editingVariantIndex,
    variantDraft.barcode,
    variantDraft.color,
    variantDraft.compatibility,
    variantDraft.connectivity,
    variantDraft.continueSellingOutOfStock,
    variantDraft.hairType,
    variantDraft.hasColor,
    variantDraft.inventoryQty,
    variantDraft.isActive,
    variantDraft.isDefault,
    variantDraft.isOnSale,
    variantDraft.label,
    variantDraft.language,
    variantDraft.memoryRam,
    variantDraft.material,
    variantDraft.modelFitment,
    variantDraft.parcelPreset,
    variantDraft.saleDiscountPercent,
    variantDraft.scent,
    variantDraft.shade,
    variantDraft.shippingClass,
    variantDraft.sellingPriceIncl,
    variantDraft.size,
    variantDraft.sizeSystem,
    variantDraft.skinType,
    variantDraft.sku,
    variantDraft.storageCapacity,
    variantDraft.strapLength,
    variantDraft.trackInventory,
    variantDraft.unitCount,
    variantDraft.abv,
    variantDraft.ageRange,
    variantDraft.bookFormat,
    variantDraft.containerType,
    variantDraft.flavor,
    variantDraft.ringSize,
    variantDraft.volume,
    variantDraft.volumeUnit,
    variantImages,
    variantItems,
  ]);
  const isEditingProduct = Boolean(activeProductId);
  const productStatusLabel = useMemo(() => {
    if (!isEditingProduct) return "Draft";
    if (createdProduct?.moderationStatus) return formatModerationStatus(createdProduct.moderationStatus);
    return "Draft";
  }, [createdProduct?.moderationStatus, isEditingProduct]);
  const selectedFeeRule = useMemo(
    () => resolveMarketplaceSuccessFeeRule(category, subCategory, marketplaceCategories),
    [category, marketplaceCategories, subCategory],
  );
  const selectedFeeRuleLabel = useMemo(
    () => describeMarketplaceFeeRule(selectedFeeRule.rule),
    [selectedFeeRule.rule],
  );
  const variantBasePriceIncl = money2(variantDraft.sellingPriceIncl || 0);
  const variantSaleDiscountPercent = Number(variantDraft.saleDiscountPercent || 0);
  const variantSalePreviewIncl = variantDraft.isOnSale && variantSaleDiscountPercent > 0
    ? money2(variantBasePriceIncl * (1 - variantSaleDiscountPercent / 100))
    : 0;
  const variantEffectivePriceIncl = variantDraft.isOnSale && variantSalePreviewIncl > 0
    ? variantSalePreviewIncl
    : variantBasePriceIncl;
  const recommendedParcelPreset = useMemo(
    () =>
      inferRecommendedParcelPreset({
        category,
        subCategory,
        size: variantDraft.size,
        condition,
      }) || null,
    [category, condition, subCategory, variantDraft.size],
  );
  const effectiveParcelPreset = (variantDraft.parcelPreset || recommendedParcelPreset || "") as ParcelPresetKey | "";
  const variantShippingProfile = useMemo(
    () =>
      buildVariantShippingProfile({
        parcelPreset: effectiveParcelPreset || null,
        actualWeightKg: Number(variantDraft.weightKg || 0) || null,
        lengthCm: Number(variantDraft.lengthCm || 0) || null,
        widthCm: Number(variantDraft.widthCm || 0) || null,
        heightCm: Number(variantDraft.heightCm || 0) || null,
        shippingClass: variantDraft.shippingClass || null,
      }),
    [
      effectiveParcelPreset,
      variantDraft.heightCm,
      variantDraft.lengthCm,
      variantDraft.shippingClass,
      variantDraft.weightKg,
      variantDraft.widthCm,
    ],
  );
  const activeParcelPresetMeta = getParcelPresetMeta(effectiveParcelPreset);
  const selectedSuccessFeePercent = useMemo(
    () => estimateMarketplaceSuccessFeePercent(selectedFeeRule.rule, variantEffectivePriceIncl || 0),
    [selectedFeeRule.rule, variantEffectivePriceIncl],
  );
  const variantLogisticsReady = useMemo(() => {
    if (fulfillmentMode !== "bevgo") return true;
    return marketplaceVariantLogisticsComplete({
      weightKg: variantShippingProfile.actualWeightKg || 0,
      lengthCm: variantShippingProfile.lengthCm || 0,
      widthCm: variantShippingProfile.widthCm || 0,
      heightCm: variantShippingProfile.heightCm || 0,
      monthlySales30d: Number(variantDraft.monthlySales30d || 0),
      stockQty: Number(variantDraft.inventoryQty || 0),
      warehouseId: variantDraft.warehouseId || null,
    });
  }, [
    fulfillmentMode,
    variantDraft.inventoryQty,
    variantDraft.monthlySales30d,
    variantDraft.warehouseId,
    variantShippingProfile.actualWeightKg,
    variantShippingProfile.heightCm,
    variantShippingProfile.lengthCm,
    variantShippingProfile.widthCm,
  ]);
  const variantFeeSnapshot = useMemo(() => {
    if (!category || !subCategory || !variantDraft.sellingPriceIncl) return null;
    return buildMarketplaceFeeSnapshot({
      categorySlug: category,
      subCategorySlug: subCategory,
      sellingPriceIncl: variantEffectivePriceIncl,
      weightKg: variantShippingProfile.actualWeightKg || 0,
      lengthCm: variantShippingProfile.lengthCm || 0,
      widthCm: variantShippingProfile.widthCm || 0,
      heightCm: variantShippingProfile.heightCm || 0,
      stockQty: Number(variantDraft.inventoryQty || 0),
      monthlySales30d: Number(variantDraft.monthlySales30d || 0),
      fulfillmentMode,
      config: feeConfig,
    });
  }, [
    category,
    feeConfig,
    fulfillmentMode,
    subCategory,
    variantEffectivePriceIncl,
    variantDraft.inventoryQty,
    variantDraft.monthlySales30d,
    variantShippingProfile.actualWeightKg,
    variantShippingProfile.heightCm,
    variantShippingProfile.lengthCm,
    variantShippingProfile.widthCm,
  ]);
  const variantFeePreviewReady = Boolean(variantDraft.sellingPriceIncl.trim()) && (fulfillmentMode === "seller" || variantLogisticsReady);
  useEffect(() => {
    if (!variantFormOpen) return;
    if (variantDraft.parcelPreset || !recommendedParcelPreset) return;
    setVariantDraft((current) => {
      if (current.parcelPreset) return current;
      const nextProfile = buildVariantShippingProfile({ parcelPreset: recommendedParcelPreset });
      return {
        ...current,
        parcelPreset: recommendedParcelPreset,
        shippingClass: current.shippingClass || nextProfile.shippingClass || "",
        weightKg: current.weightKg || (nextProfile.actualWeightKg != null ? String(nextProfile.actualWeightKg) : ""),
        lengthCm: current.lengthCm || (nextProfile.lengthCm != null ? String(nextProfile.lengthCm) : ""),
        widthCm: current.widthCm || (nextProfile.widthCm != null ? String(nextProfile.widthCm) : ""),
        heightCm: current.heightCm || (nextProfile.heightCm != null ? String(nextProfile.heightCm) : ""),
      };
    });
  }, [recommendedParcelPreset, variantDraft.parcelPreset, variantFormOpen]);
  const publishRequirements = useMemo(
    () => [
      { label: "Title", ready: title.trim().length > 2 },
      { label: "Product code", ready: uniqueId.length === 8 },
      { label: "SKU", ready: productSku.trim().length > 0 },
      { label: "Category", ready: category.trim().length > 0 },
      { label: "Sub category", ready: subCategory.trim().length > 0 },
      { label: "Brand", ready: brandFieldHasValue },
      { label: "Overview", ready: overview.trim().length > 2 },
      { label: "Description", ready: descriptionPlainText.trim().length > 10 },
      { label: "Keywords", ready: keywordTags.length > 0 },
      { label: "Images", ready: productImages.length > 0 },
      ...(fulfillmentMode === "seller" ? [{ label: "Delivery settings", ready: sellerDeliverySettingsReady }] : []),
      ...(fulfillmentMode === "seller" && sellerWeightBasedShippingRequired
        ? [{ label: "Variant weight", ready: variantItems.every((variant) => Number(variant?.logistics?.weight_kg || 0) > 0) }]
        : []),
      ...(fulfillmentMode === "bevgo" ? [{ label: "Variant logistics", ready: variantLogisticsReady }] : []),
      { label: "Variants", ready: variantItems.length > 0 },
    ],
    [
      brandFieldHasValue,
      category,
      descriptionPlainText,
      fulfillmentMode,
      keywordTags.length,
      overview,
      productImages.length,
      productSku,
      subCategory,
      title,
      uniqueId.length,
      variantItems.length,
      sellerWeightBasedShippingRequired,
      variantLogisticsReady,
      sellerDeliverySettingsReady,
    ],
  );
  const missingRequirements = publishRequirements.filter((item) => !item.ready);
  const readyRequirementCount = publishRequirements.length - missingRequirements.length;

  useEffect(() => {
    const previousCount = previousReadyRequirementCountRef.current;
    if (readyRequirementCount > previousCount) {
      setPublishChecklistPulse(true);
      const timeoutId = window.setTimeout(() => setPublishChecklistPulse(false), 550);
      previousReadyRequirementCountRef.current = readyRequirementCount;
      return () => window.clearTimeout(timeoutId);
    }
    previousReadyRequirementCountRef.current = readyRequirementCount;
    return undefined;
  }, [readyRequirementCount]);

  useEffect(() => {
    if (error) setShowErrorDialog(true);
  }, [error]);

  useEffect(() => {
    let cancelled = false;
    if (!effectiveSellerSettingsIdentifier) {
      setSellerDeliverySettingsReady(true);
      return;
    }

    fetch(`/api/client/v1/accounts/seller/settings/get?sellerSlug=${encodeURIComponent(effectiveSellerSettingsIdentifier)}`, {
      cache: "no-store",
    })
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => {
        if (cancelled) return;
        const profile = payload?.deliveryProfile && typeof payload.deliveryProfile === "object" ? payload.deliveryProfile : {};
        setSellerDeliverySettingsReady(hasSellerDeliverySettings(profile));
        setSellerWeightBasedShippingRequired(sellerHasWeightBasedShipping(profile));
      })
      .catch(() => {
        if (!cancelled) {
          setSellerDeliverySettingsReady(false);
          setSellerWeightBasedShippingRequired(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveSellerSettingsIdentifier]);

  const formIsValid =
    Boolean(authReady) &&
    Boolean(isAuthenticated) &&
    Boolean(canUseSellerEditor) &&
    Boolean(vendorName || loadedProductVendorName || isSystemAdmin) &&
    uniqueId.length === 8 &&
    title.trim().length > 2 &&
    category.trim().length > 0 &&
    subCategory.trim().length > 0 &&
    brandFieldHasValue &&
    overview.trim().length > 2 &&
    descriptionPlainText.trim().length > 10 &&
    productSku.trim().length > 0 &&
    keywordTags.length > 0 &&
    !submitting;

  const moderationStatusKey = String(createdProduct?.moderationStatus ?? "draft").trim().toLowerCase();
  const canSubmitReview =
    !isSystemAdmin &&
    Boolean(activeProductId) &&
    variantItems.length > 0 &&
    !submitting &&
    (fulfillmentMode !== "seller" || sellerDeliverySettingsReady) &&
    moderationStatusKey !== "in_review" &&
    moderationStatusKey !== "published" &&
    moderationStatusKey !== "awaiting_stock" &&
    moderationStatusKey !== "blocked";
  const submitReviewLabel = moderationStatusKey === "rejected" ? "Re-submit for review" : "Submit for review";

  async function submitProductBlockDispute() {
    if (!activeProductId || !productDisputeMessage.trim()) return;
    setProductDisputeSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/products/reports/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: activeProductId,
          message: productDisputeMessage,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to submit the dispute.");
      }
      setMessage(payload?.message || "Dispute submitted.");
      setProductDisputeMessage("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit the dispute.");
    } finally {
      setProductDisputeSubmitting(false);
    }
  }

  const renderPublishingChecklist = () => (
    <section className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Publishing</p>
      <p className="mt-2 text-[12px] leading-[1.55] text-[#57636c]">
        Your draft stays here until the items below are completed.
      </p>
      <div className="mt-4 space-y-2">
        {publishRequirements.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-[8px] border border-black/5 bg-[#fafafa] px-3 py-2 text-[12px]"
          >
            <span className="font-medium text-[#202020]">{item.label}</span>
            <span
              className={
                item.ready
                  ? "inline-flex items-center gap-1 rounded-full bg-[rgba(26,133,83,0.12)] px-2.5 py-1 text-[11px] font-semibold text-[#1a8553]"
                  : "inline-flex items-center gap-1 rounded-full bg-[rgba(220,38,38,0.08)] px-2.5 py-1 text-[11px] font-semibold text-[#b91c1c]"
              }
            >
              {item.ready ? <CheckIcon className="h-3.5 w-3.5" /> : null}
              {item.ready ? "Done" : "Required"}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-[8px] bg-[#fafafa] px-3 py-2 text-[12px] text-[#57636c]">
        {missingRequirements.length === 0
          ? "Ready to save and send for review."
          : `${missingRequirements.length} item${missingRequirements.length === 1 ? "" : "s"} still need attention before the product can go live.`}
      </div>
    </section>
  );

  const renderSidebarSummary = () => (
    <div className={["space-y-5", embeddedMode ? "pt-5" : "pt-4"].join(" ")}>
      <section className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Status</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-[8px] bg-[rgba(203,178,107,0.14)] px-2.5 py-1 text-[11px] font-semibold text-[#907d4c]">
            {productStatusLabel}
          </span>
          <span className="text-[12px] text-[#57636c]">
            {createdProduct ? "Saved as a draft." : "Not yet saved."}
          </span>
        </div>
        {!isSystemAdmin ? (
          <>
            {moderationStatusKey === "in_review" ? (
              <p className="mt-4 rounded-[8px] border border-black/5 bg-[#fafafa] px-3 py-2 text-[11px] leading-[1.5] text-[#57636c]">
                This product is already in review. Piessang will review it before it can move forward.
              </p>
            ) : moderationStatusKey === "rejected" ? (
              <div className="mt-4 rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-3 py-3 text-[11px] leading-[1.5] text-[#7f1d1d]">
                <p className="font-semibold uppercase tracking-[0.08em] text-[#b91c1c]">Review changes needed</p>
                <p className="mt-1">
                  {createdProduct?.moderationReason || "Piessang rejected this product during review. Fix the feedback, then submit it again."}
                </p>
                <button
                  type="button"
                  onClick={() => void submitForReview()}
                  disabled={!canSubmitReview}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitReviewLabel}
                </button>
                <p className="mt-2 text-[11px] leading-[1.4] text-[#7f1d1d]">
                  {variantItems.length === 0
                    ? "Add at least one variant before you can re-submit this product."
                    : fulfillmentMode === "seller" && !sellerDeliverySettingsReady
                      ? "Add your delivery and shipping settings before re-submitting this self-fulfilled listing."
                      : "Once you’ve fixed the feedback above, re-submit this product for review."}
                </p>
              </div>
            ) : moderationStatusKey === "blocked" ? (
              <div className="mt-4 rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-3 py-3 text-[11px] leading-[1.5] text-[#7f1d1d]">
                <p className="font-semibold uppercase tracking-[0.08em] text-[#b91c1c]">Product blocked</p>
                <p className="mt-1">
                  {createdProduct?.moderationReason || "Piessang has hidden this product after reviewing a customer report."}
                </p>
                <label className="mt-3 block">
                  <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Dispute this decision</span>
                  <textarea
                    value={productDisputeMessage}
                    onChange={(event) => setProductDisputeMessage(event.target.value)}
                    rows={4}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] text-[#202020] outline-none focus:border-[#cbb26b]"
                    placeholder="Tell Piessang why this product should be restored."
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void submitProductBlockDispute()}
                  disabled={productDisputeSubmitting || !productDisputeMessage.trim()}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {productDisputeSubmitting ? "Sending dispute..." : "Submit dispute"}
                </button>
              </div>
            ) : moderationStatusKey === "published" || moderationStatusKey === "awaiting_stock" ? (
              <p className="mt-4 rounded-[8px] border border-black/5 bg-[#fafafa] px-3 py-2 text-[11px] leading-[1.5] text-[#57636c]">
                This product has already been approved. Submit for review will only return after a rejection or meaningful content changes.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void submitForReview()}
                  disabled={!canSubmitReview}
                  className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitReviewLabel}
                </button>
                <p className="mt-2 text-[11px] leading-[1.4] text-[#57636c]">
                  {variantItems.length === 0
                    ? "Add at least one variant before you can submit this draft."
                    : fulfillmentMode === "seller" && !sellerDeliverySettingsReady
                      ? "Add your delivery and shipping settings in seller settings before submitting a self-fulfilled listing."
                    : moderationStatusKey === "rejected"
                      ? "Fix the rejection feedback, then re-submit the product for review."
                      : inventoryTrackingRequired
                        ? "Piessang fulfilment can be submitted now. Once accepted, stock must be shipped to the warehouse before it can go live."
                        : "Your draft can be submitted once you are ready."}
                </p>
              </>
            )}
          </>
        ) : (
          <p className="mt-4 rounded-[8px] border border-black/5 bg-[#fafafa] px-3 py-2 text-[11px] leading-[1.5] text-[#57636c]">
            System admins can review and edit this listing here, but seller submission actions are hidden in admin review mode.
          </p>
        )}
      </section>

      <section className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Product organization</p>
        <div className="mt-3 space-y-3 text-[12px] text-[#57636c]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Title</p>
            <p className="mt-1 font-medium text-[#202020]">{title || "Add a title"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Brand</p>
            <p className="mt-1 font-medium text-[#202020]">{brandName || "Add brand name"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Vendor</p>
            <p className="mt-1 font-medium text-[#202020]">{vendorName || "Piessang"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Fulfilment & fees</p>
        <div className="mt-3 space-y-2">
          <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Fulfillment mode</p>
              <HelpTip label="Fulfillment help">
                Self fulfilment means you keep and ship stock yourself. Piessang fulfilment means we hold the stock and publish the listing only after it is booked in.
              </HelpTip>
            </div>
            <p className="mt-1 text-[12px] font-semibold text-[#202020]">
              {fulfillmentMode === "seller" ? "Seller fulfills" : "Piessang fulfills"}
            </p>
          </div>
          <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Success fee</p>
              <HelpTip label="Success fee help">
                Success fees come from the live category fee table and are calculated from the VAT-inclusive selling price when the order is created. If Piessang fulfils the product, separate fulfilment and storage fees may also apply.
              </HelpTip>
            </div>
            <p className="mt-1 text-[12px] font-semibold text-[#202020]">{selectedSuccessFeePercent.toFixed(1)}% per order</p>
          </div>
          <div className="rounded-[8px] border border-black/5 bg-[#fafafa] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">Shipping timing</p>
            <p className="mt-1 text-[12px] font-semibold text-[#202020]">
              {fulfillmentMode === "seller" ? "Managed in shipping preferences" : "Managed by Piessang"}
            </p>
          </div>
          <p className="text-[11px] leading-[1.5] text-[#57636c]">
            {fulfillmentMode === "seller"
              ? "You handle packing and delivery. Marketplace success fees still apply based on the category fee table."
              : "Piessang handles fulfilment. Marketplace success fees still apply, with fulfilment and storage fees calculated from the live fee tables."}
          </p>
        </div>
      </section>
    </div>
  );

  const renderEditorLoadingSkeleton = () => (
    <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <section className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-32 rounded-[8px] bg-black/5" />
            <div className="h-16 rounded-[8px] bg-black/5" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-24 rounded-[8px] bg-black/5" />
              <div className="h-24 rounded-[8px] bg-black/5" />
            </div>
            <div className="h-28 rounded-[8px] bg-black/5" />
            <div className="h-12 w-44 rounded-[8px] bg-black/5" />
          </div>
        </section>

        <section className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-40 rounded-[8px] bg-black/5" />
            <div className="space-y-3">
              <div className="h-20 rounded-[8px] bg-black/5" />
              <div className="h-20 rounded-[8px] bg-black/5" />
              <div className="h-20 rounded-[8px] bg-black/5" />
            </div>
          </div>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4">
        <section className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-32 rounded-[8px] bg-black/5" />
            <div className="space-y-2">
              <div className="h-14 rounded-[8px] bg-black/5" />
              <div className="h-14 rounded-[8px] bg-black/5" />
              <div className="h-14 rounded-[8px] bg-black/5" />
              <div className="h-14 rounded-[8px] bg-black/5" />
              <div className="h-14 rounded-[8px] bg-black/5" />
            </div>
          </div>
        </section>
      </aside>
    </div>
  );

  async function fetchUniqueCode() {
    const requestId = ++uniqueCodeRequestRef.current;
    setGeneratingCode(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(UNIQUE_CODE_ENDPOINT);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to generate a unique product code.");
      }
      const code = String(payload?.code ?? "").trim();
      if (!/^\d{8}$/.test(code)) {
        throw new Error("Invalid product code returned.");
      }
      if (uniqueCodeRequestRef.current !== requestId || hasEditorTargetRef.current) {
        return;
      }
      setUniqueId(code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate a unique product code.");
    } finally {
      if (uniqueCodeRequestRef.current === requestId) {
        setGeneratingCode(false);
      }
    }
  }

  async function fetchProductSku() {
    if (!titleHasValue) {
      setError("Add a product title first, then we can generate an SKU.");
      return;
    }

    setGeneratingSku(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(SKU_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_title: title.trim(),
          brand_slug: selectedBrand?.slug ?? matchingBrand?.slug ?? normalizeSlug(brandName),
          vendor_name: vendorName.trim(),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to generate a unique SKU.");
      }

      const sku = String(payload?.sku ?? "").trim();
      if (!sku) {
        throw new Error("Invalid SKU returned.");
      }

      setProductSku(sku);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate a unique SKU.");
    } finally {
      setGeneratingSku(false);
    }
  }

  async function fetchVariantCode() {
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(UNIQUE_CODE_ENDPOINT);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to generate a unique variant ID.");
      }
      const code = String(payload?.code ?? "").trim();
      if (!/^\d{8}$/.test(code)) {
        throw new Error("Invalid variant ID returned.");
      }
      setVariantDraft((current) => ({ ...current, variantId: code }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate a unique variant ID.");
    }
  }

  async function fetchVariantSku() {
    if (!titleHasValue) {
      setError("Add a product title first, then we can generate the variant SKU.");
      return;
    }
    if (!variantDraft.label.trim()) {
      setError("Add a variant label first, then we can generate the variant SKU.");
      return;
    }

    setGeneratingSku(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(SKU_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_title: title.trim(),
          variant_label: variantDraft.label.trim(),
          brand_slug: selectedBrand?.slug ?? matchingBrand?.slug ?? normalizeSlug(brandName),
          vendor_name: vendorName.trim(),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to generate a unique variant SKU.");
      }

      const sku = String(payload?.sku ?? "").trim();
      if (!sku) {
        throw new Error("Invalid SKU returned.");
      }

      setVariantDraft((current) => ({ ...current, sku }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate a unique variant SKU.");
    } finally {
      setGeneratingSku(false);
    }
  }

  async function openVariantForm() {
    setVariantFormOpen(true);
    if (String(variantDraft.variantId ?? "").trim()) return;
    await fetchVariantCode();
  }

  useEffect(() => {
    const sku = productSku.trim();
    if (!sku) {
      setSkuStatus("idle");
      return;
    }

    if (activeProductId && loadedProductSku && sku.toUpperCase() === loadedProductSku.trim().toUpperCase()) {
      setSkuStatus("unique");
      return;
    }

    let active = true;
    const timeout = window.setTimeout(async () => {
      setSkuStatus("checking");
      try {
        const response = await fetch(SKU_CHECK_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { sku, productId: uniqueId } }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok || payload?.ok === false) {
          setSkuStatus("error");
          return;
        }
        setSkuStatus(payload?.unique ? "unique" : "taken");
      } catch {
        if (active) setSkuStatus("error");
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [activeProductId, loadedProductSku, productSku, uniqueId]);

  useEffect(() => {
    const sku = variantDraft.sku.trim();
    if (!sku) {
      setVariantSkuStatus("idle");
      return;
    }

    let active = true;
    const timeout = window.setTimeout(async () => {
      setVariantSkuStatus("checking");
      try {
        const response = await fetch(SKU_CHECK_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { sku } }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok || payload?.ok === false) {
          setVariantSkuStatus("error");
          return;
        }
        setVariantSkuStatus(payload?.unique ? "unique" : "taken");
      } catch {
        if (active) setVariantSkuStatus("error");
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [activeProductId, variantDraft.sku, variantDraft.variantId]);

  useEffect(() => {
    if (!isSeller || hasEditorTarget) return;
    void fetchUniqueCode();
  }, [hasEditorTarget, isSeller]);

  useEffect(() => {
    if (!editorProductId) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    async function loadProduct() {
      setLoadingProduct(true);
      setError(null);
      try {
        const response = await fetch(`${PRODUCT_GET_ENDPOINT}?id=${encodeURIComponent(editorProductId)}&includeUnavailable=true`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load the product.");
        }
        const record = payload?.data ?? payload?.product ?? payload ?? {};
        const recordSellerCode = String(
          record?.product?.sellerCode ??
            record?.seller?.sellerCode ??
            record?.seller?.activeSellerCode ??
            record?.seller?.groupSellerCode ??
            "",
        ).trim();
        const recordSellerSlug = String(
          record?.seller?.sellerSlug ??
            record?.product?.sellerSlug ??
            record?.seller?.activeSellerSlug ??
            record?.seller?.groupSellerSlug ??
            "",
        ).trim();
        const recordVendorName = String(record?.product?.vendorName ?? record?.seller?.vendorName ?? "").trim();
        const allowedSellerKeys = new Set(
          [
            activeSellerContext?.sellerSlug,
            activeSellerContext?.sellerCode,
            profile?.sellerSlug,
            profile?.sellerCode,
            ...(Array.isArray(profile?.sellerManagedAccounts)
              ? profile.sellerManagedAccounts.flatMap((item) => [item?.sellerSlug, item?.sellerCode])
              : []),
          ]
            .map((item) => String(item ?? "").trim())
            .filter(Boolean),
        );
        const hasSellerAccessToProduct =
          allowedSellerKeys.has(recordSellerCode) ||
          allowedSellerKeys.has(recordSellerSlug);
        if (!isSystemAdmin && !hasSellerAccessToProduct) {
          throw new Error("You do not have access to this product.");
        }
        if (cancelled) return;

        setProductAccessDenied(false);
        setUniqueId(String(record?.product?.unique_id ?? editorProductId).trim());
        setProductSku(String(record?.product?.sku ?? "").trim());
        setTitle(String(record?.product?.title ?? "").trim());
        setCategory(String(record?.grouping?.category ?? "").trim());
        setSubCategory(String(record?.grouping?.subCategory ?? "").trim());
        setCondition(normalizePreLovedCondition(String(record?.product?.condition ?? "").trim()));
        setBrandName(String(record?.product?.brandTitle ?? record?.product?.brand ?? "").trim().slice(0, 30));
        setSelectedBrand(
          record?.product?.brand
            ? {
                id: String(record?.product?.brand ?? ""),
                slug: String(record?.product?.brand ?? ""),
                title: String(record?.product?.brandTitle ?? record?.product?.brand ?? "").trim(),
                exact: true,
                mode: "existing",
              }
            : null,
        );
        setOverview(String(record?.product?.overview ?? "").trim());
        setDescription(String(record?.product?.description ?? "").trim());
        setKeywordTags(
          Array.isArray(record?.product?.keywords)
            ? record.product.keywords.map((item: string) => String(item).trim().toLowerCase()).slice(0, 10)
            : [],
        );
        setProductImages(
          Array.isArray(record?.media?.images)
            ? record.media.images.map((item: any, index: number) => ({
                imageUrl: String(item?.imageUrl ?? "").trim(),
                blurHashUrl: String(item?.blurHashUrl ?? "").trim(),
                fileName: String(item?.altText ?? item?.imageUrl ?? `image-${index + 1}`).trim(),
                altText: String(item?.altText ?? "").trim(),
            }))
            : [],
        );
        const nextFulfillmentMode = String(record?.fulfillment?.mode ?? "seller") === "bevgo" ? "bevgo" : "seller";
        const nextInventoryTracking = Boolean(record?.placement?.inventory_tracking) || nextFulfillmentMode === "bevgo";
        setFulfillmentMode(nextFulfillmentMode);
        setInventoryTracking(nextInventoryTracking);
        setVariantDraft((current) => ({
          ...current,
          trackInventory: nextInventoryTracking,
        }));
        setVariantImages([]);
        setLoadedProductSku(String(record?.product?.sku ?? "").trim());
        setLoadedProductSellerCode(recordSellerCode);
        setLoadedProductSellerSlug(recordSellerSlug);
        setLoadedProductVendorName(recordVendorName);
        setCreatedProduct({
          uniqueId: String(record?.product?.unique_id ?? editorProductId).trim(),
          sku: String(record?.product?.sku ?? "").trim(),
          title: String(record?.product?.title ?? "").trim(),
          titleSlug: String(record?.product?.titleSlug ?? normalizeSlug(String(record?.product?.title ?? ""))).trim(),
          brandSlug: String(record?.product?.brand ?? "").trim(),
          brandTitle: String(record?.product?.brandTitle ?? "").trim(),
          vendorName: recordVendorName || String(vendorName ?? "").trim(),
          moderationStatus: String(record?.moderation?.status ?? "draft").trim() || "draft",
          moderationReason: String(record?.moderation?.reason ?? record?.moderation?.notes ?? "").trim(),
        });
        updateProductEditorBaseline({
          title: String(record?.product?.title ?? "").trim(),
          category: String(record?.grouping?.category ?? "").trim(),
          subCategory: String(record?.grouping?.subCategory ?? "").trim(),
          condition: normalizePreLovedCondition(String(record?.product?.condition ?? "").trim()),
          brandSlug: String(record?.product?.brand ?? "").trim(),
          brandTitle: String(record?.product?.brandTitle ?? record?.product?.brand ?? "").trim(),
          overview: String(record?.product?.overview ?? "").trim(),
          description: String(record?.product?.description ?? "").trim(),
          keywords: Array.isArray(record?.product?.keywords)
            ? record.product.keywords.map((item: string) => String(item).trim().toLowerCase()).slice(0, 10)
            : [],
          imageKeys: Array.isArray(record?.media?.images)
            ? record.media.images.map((item: any) => String(item?.imageUrl ?? "").trim()).filter(Boolean)
            : [],
          fulfillmentMode: nextFulfillmentMode,
          inventoryTracking: nextInventoryTracking,
        });
      } catch (cause) {
        if (!cancelled) {
          setProductAccessDenied(cause instanceof Error && cause.message === "You do not have access to this product.");
          if (cause instanceof DOMException && cause.name === "AbortError") {
            setError("Loading this product took too long. Please try again.");
          } else {
            setError(cause instanceof Error ? cause.message : "Unable to load the product.");
          }
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) setLoadingProduct(false);
      }
    }

    void loadProduct();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [editorProductId, vendorName]);

  useEffect(() => {
    if (!continueSellingAvailable && variantDraft.continueSellingOutOfStock) {
      setVariantDraft((current) => ({ ...current, continueSellingOutOfStock: false }));
    }
  }, [continueSellingAvailable, variantDraft.continueSellingOutOfStock]);

  const loadVariantItems = useMemo(
    () => async (productId: string) => {
      if (!productId) return;
      setLoadingVariants(true);
      try {
        const response = await fetch(VARIANT_GET_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unique_id: productId }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load variants.");
        }
        const nextVariants = Array.isArray(payload?.variants) ? payload.variants : [];
        setVariantItems(nextVariants);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to load variants.");
      } finally {
        setLoadingVariants(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeProductId) {
      setVariantItems([]);
      return;
    }
    void loadVariantItems(activeProductId);
  }, [activeProductId, loadVariantItems]);

  useEffect(() => {
    if (!activeProductId || fulfillmentMode !== "bevgo") {
      setInboundBookings([]);
      setStockUpliftments([]);
      return;
    }
    let cancelled = false;
    async function loadInboundBookings() {
      setLoadingInboundBookings(true);
      try {
        const response = await fetch(`${SELLER_INBOUND_BOOKINGS_ENDPOINT}?productId=${activeProductId}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load inbound bookings.");
        }
        if (!cancelled) {
          setInboundBookings(Array.isArray(payload?.items) ? payload.items : []);
        }
      } catch {
        if (!cancelled) setInboundBookings([]);
      } finally {
        if (!cancelled) setLoadingInboundBookings(false);
      }
    }
    void loadInboundBookings();
    return () => {
      cancelled = true;
    };
  }, [activeProductId, fulfillmentMode]);

  useEffect(() => {
    if (!activeProductId || fulfillmentMode !== "bevgo") {
      setStockUpliftments([]);
      return;
    }
    let cancelled = false;
    async function loadStockUpliftments() {
      setLoadingStockUpliftments(true);
      try {
        const response = await fetch(`${SELLER_STOCK_UPLIFTMENTS_ENDPOINT}?productId=${activeProductId}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load stock upliftments.");
        }
        if (!cancelled) {
          setStockUpliftments(Array.isArray(payload?.items) ? payload.items : []);
        }
      } catch {
        if (!cancelled) setStockUpliftments([]);
      } finally {
        if (!cancelled) setLoadingStockUpliftments(false);
      }
    }
    void loadStockUpliftments();
    return () => {
      cancelled = true;
    };
  }, [activeProductId, fulfillmentMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadFeeConfig() {
      try {
        const response = await fetch("/api/catalogue/v1/marketplace/fees", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false || !payload?.config) return;
        if (!cancelled) {
          setFeeConfig((current) => ({
            ...current,
            ...payload.config,
            categories: Array.isArray(payload.config?.categories) && payload.config.categories.length ? payload.config.categories : current.categories,
          }));
        }
      } catch {
        // Keep the local default config if the live copy cannot be loaded.
      }
    }

    void loadFeeConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBrandSuggestions() {
      setLoadingBrands(true);
      try {
        const url = new URL(BRAND_ENDPOINT, window.location.origin);
        url.searchParams.set("isActive", "true");
        url.searchParams.set("limit", "all");

        const response = await fetch(url.toString(), { signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        const items = Array.isArray(payload?.items) ? payload.items : [];

        const nextSuggestions = items
          .map((item: any) => {
            const slug = String(item?.data?.brand?.slug ?? "").trim();
            const title = String(item?.data?.brand?.title ?? "").trim();
            if (!slug || !title) return null;
            return {
              id: String(item?.id ?? slug),
              slug,
              title,
            };
          })
          .filter(Boolean)
          .slice(0, 8) as BrandSuggestion[];

        setBrandSuggestions(nextSuggestions);
        setSelectedBrand((current) => {
          if (!current) return current;
          const stillExists = nextSuggestions.some((item) => item.slug === current.slug);
          return stillExists ? current : null;
        });
      } catch {
        setBrandSuggestions([]);
        setSelectedBrand(null);
      } finally {
        setLoadingBrands(false);
      }
    }

    void loadBrandSuggestions();
    return () => controller.abort();
  }, []);

  async function generateDescription() {
    if (!titleHasValue) {
      setError("Add a product title first, then we can generate the description.");
      return;
    }

    setGeneratingDescription(true);
    setError(null);
    try {
      const response = await fetch("/api/catalogue/v1/products/product/descriptionGenerator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), word_limit: 40 }),
      });
      const payload = await response.json().catch(() => ({}));
      const nextDescription = String(payload?.description ?? payload?.fallback ?? "")
        .trim()
        .slice(0, DESCRIPTION_MAX_LENGTH);
      if (!response.ok && !nextDescription) {
        throw new Error(payload?.message || "Unable to generate description.");
      }
      if (nextDescription) setDescription(plainTextToHtml(nextDescription));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate description.");
    } finally {
      setGeneratingDescription(false);
    }
  }

  async function generateOverview() {
    if (!titleHasValue) {
      setError("Add a product title first, then we can generate the overview.");
      return;
    }

    setGeneratingOverview(true);
    setError(null);
    try {
      const response = await fetch("/api/catalogue/v1/products/product/descriptionGenerator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), word_limit: 18 }),
      });
      const payload = await response.json().catch(() => ({}));
      const nextOverview = String(payload?.description ?? payload?.fallback ?? "")
        .trim()
        .slice(0, OVERVIEW_MAX_LENGTH);
      if (!response.ok && !nextOverview) {
        throw new Error(payload?.message || "Unable to generate overview.");
      }
      if (nextOverview) setOverview(nextOverview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate overview.");
    } finally {
      setGeneratingOverview(false);
    }
  }

  async function generateKeywords() {
    if (!titleHasValue) {
      setError("Add a product title first, then we can generate keywords.");
      return;
    }

    setGeneratingKeywords(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/keywords/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), max: 10 }),
      });
      const payload = await response.json().catch(() => ({}));
      const nextKeywords = String(payload?.keywords ?? payload?.fallback ?? "").trim();
      if (!response.ok && !nextKeywords) {
        throw new Error(payload?.message || "Unable to generate keywords.");
      }
      if (nextKeywords) setKeywordTags(parseKeywordTokens(nextKeywords));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate keywords.");
    } finally {
      setGeneratingKeywords(false);
    }
  }

  function addKeywordTokens(input: string) {
    const tokens = parseKeywordTokens(input);
    if (!tokens.length) return;
    setKeywordTags((current) => {
      const next = [...current];
      for (const token of tokens) {
        if (next.length >= 10) break;
        if (!next.includes(token)) next.push(token);
      }
      return next;
    });
  }

  function removeKeywordAt(index: number) {
    setKeywordTags((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function handleKeywordKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "," || event.key === "Enter") {
      event.preventDefault();
      addKeywordTokens(keywordInput);
      setKeywordInput("");
    }

    if (event.key === "Backspace" && !keywordInput && keywordTags.length > 0) {
      event.preventDefault();
      removeKeywordAt(keywordTags.length - 1);
    }
  }

  function commitKeywordInput() {
    addKeywordTokens(keywordInput);
    setKeywordInput("");
  }

  function formatBrandInput(value: string) {
    return value
      .trimStart()
      .replace(/\s+/g, " ")
      .replace(/\b([a-z])/g, (match) => match.toUpperCase())
      .slice(0, 30);
  }

  function selectBrandSuggestion(item: BrandSuggestion) {
    setBrandName(item.title.slice(0, 30));
    setSelectedBrand({ ...item, exact: true, mode: "existing" });
    setBrandDropdownOpen(false);
    setError(null);
  }

  function handleBrandChange(value: string) {
    setBrandName(formatBrandInput(value));
    setSelectedBrand(null);
    setBrandDropdownOpen(true);
  }

  function handleBrandBlur() {
    window.setTimeout(() => {
      if (matchingBrand) {
        setBrandName(formatBrandInput(matchingBrand.title));
        setSelectedBrand({ ...matchingBrand, exact: true, mode: "existing" });
        setError(null);
      } else if (brandName.trim()) {
        setSelectedBrand(null);
      }
      setBrandDropdownOpen(false);
    }, 150);
  }

  function removeImageAt(index: number) {
    setProductImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function reorderImages(fromIndex: number, toIndex: number) {
    setProductImages((current) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.length ||
        toIndex >= current.length
      ) {
        return current;
      }

      const next = [...current];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }

  function updateImageAltText(index: number, altText: string) {
    setProductImages((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index
          ? { ...item, altText: sanitizeText(altText) }
          : item,
      ),
    );
  }

  function moveImage(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    reorderImages(index, targetIndex);
  }

  function removeVariantImageAt(index: number) {
    setVariantImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function reorderVariantImages(fromIndex: number, toIndex: number) {
    setVariantImages((current) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.length ||
        toIndex >= current.length
      ) {
        return current;
      }

      const next = [...current];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }

  function updateVariantImageAltText(index: number, altText: string) {
    setVariantImages((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index
          ? { ...item, altText: sanitizeText(altText) }
          : item,
      ),
    );
  }

  function moveVariantImage(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    reorderVariantImages(index, targetIndex);
  }

  function beginDragVariantImage(index: number) {
    setDraggedVariantImageIndex(index);
    setDropTargetVariantImageIndex(index);
  }

  function endDragVariantImage() {
    setDraggedVariantImageIndex(null);
    setDropTargetVariantImageIndex(null);
  }

  function hoverDragVariantImage(index: number) {
    setDropTargetVariantImageIndex(index);
  }

  function beginDragImage(index: number) {
    setDraggedImageIndex(index);
    setDropTargetIndex(index);
  }

  function endDragImage() {
    setDraggedImageIndex(null);
    setDropTargetIndex(null);
  }

  function hoverDragImage(index: number) {
    setDropTargetIndex(index);
  }

  function resetProductForm() {
    setCreatedProduct(null);
    setProductEditorBaseline(null);
    setProductAccessDenied(false);
    setUniqueId("");
    setTitle("");
    setProductSku("");
    setOverview("");
    setDescription("");
    setKeywordInput("");
    setKeywordTags([]);
    setCategory("");
    setSubCategory("");
    setBrandName("");
    setSelectedBrand(null);
    setBrandDropdownOpen(false);
    setProductImages([]);
    setVariantImages([]);
    setVariantItems([]);
    setVariantFormOpen(false);
    setInventoryTracking(false);
    setFulfillmentMode("seller");
    setLoadedProductSku("");
    setLoadedProductSellerCode("");
    setLoadedProductSellerSlug("");
    setLoadedProductVendorName("");
    setSkuStatus("idle");
    setVariantSkuStatus("idle");
    resetVariantDraft({ makeDefault: true });
    setMessage(null);
    setError(null);
    if (editorProductId && !embeddedMode) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("id");
      nextUrl.searchParams.delete("unique_id");
      router.replace(`${pathname}?${nextUrl.searchParams.toString()}`.replace(/\?$/, ""), { scroll: false });
    }
    if (!embeddedMode) {
      void fetchUniqueCode();
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!files.length) return;
    if (!profile?.uid) {
      setError("Missing seller profile. Please refresh and try again.");
      return;
    }

    setUploadingImages(true);
    setError(null);
    try {
      const nextImages: ProductImage[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const prepared = await prepareImageAsset(file, {
          maxDimension: 2200,
          quality: 0.84,
        });
        const safeName = prepared.file.name.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase();
        const path = `users/${profile.uid}/uploads/${Date.now()}-${safeName}`;
        const fileRef = storageRef(clientStorage, path);
        await uploadBytes(fileRef, prepared.file, { contentType: prepared.file.type });
        const imageUrl = await getDownloadURL(fileRef);
        nextImages.push({
          imageUrl,
          blurHashUrl: prepared.blurHashUrl,
          fileName: prepared.file.name,
          altText: prepared.altText,
        });
      }
      if (nextImages.length) {
        setProductImages((current) => [...current, ...nextImages]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload images.");
    } finally {
      setUploadingImages(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  async function uploadVariantFiles(files: FileList | File[]) {
    if (!files.length) return;
    if (!profile?.uid) {
      setError("Missing seller profile. Please refresh and try again.");
      return;
    }

    setUploadingVariantImages(true);
    setError(null);
    try {
      const nextImages: ProductImage[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const prepared = await prepareImageAsset(file, {
          maxDimension: 2200,
          quality: 0.84,
        });
        const safeName = prepared.file.name.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase();
        const path = `users/${profile.uid}/uploads/${Date.now()}-${safeName}`;
        const fileRef = storageRef(clientStorage, path);
        await uploadBytes(fileRef, prepared.file, { contentType: prepared.file.type });
        const imageUrl = await getDownloadURL(fileRef);
        nextImages.push({
          imageUrl,
          blurHashUrl: prepared.blurHashUrl,
          fileName: prepared.file.name,
          altText: prepared.altText,
        });
      }
      if (nextImages.length) {
        setVariantImages((current) => [...current, ...nextImages]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload variant images.");
    } finally {
      setUploadingVariantImages(false);
      if (variantUploadInputRef.current) variantUploadInputRef.current.value = "";
    }
  }

  function validateProductDraft() {
    if (!title.trim()) return "Product title is required.";
    if (!uniqueId.trim() || !/^\d{8}$/.test(uniqueId.trim())) return "Product code is required.";
    if (!productSku.trim()) return "SKU is required.";
    if (!category.trim()) return "Primary category is required.";
    if (!subCategory.trim()) return "Sub category is required.";
    if (isPreLovedProductDraft && !condition.trim()) return "Select the pre-loved condition for this item.";
    if (!brandName.trim()) return "Brand name is required.";
    if (!overview.trim()) return "Product overview is required.";
    if (descriptionPlainText.trim().length < 10) return "Product description is required.";
    if (!keywordTags.length) return "Add at least one keyword.";
    return "";
  }

  function validateVariantDraft({
    variantId = variantDraft.variantId.trim(),
    sku = variantDraft.sku.trim(),
    existingVariants = variantItems,
  }: { variantId?: string; sku?: string; existingVariants?: ProductVariantItem[] } = {}) {
    if (!variantId || !/^\d{8}$/.test(variantId)) {
      return "Variant ID is required.";
    }
    if (!variantDraft.label.trim()) return "Variant label is required.";
    if (isApparelProductDraft && !variantDraft.size.trim()) return "Select a clothing size for this variant.";
    if (!sku.trim()) return "Variant SKU is required.";
    if (variantDraft.hasColor && !variantDraft.color.trim()) return "Choose a variant color or untick the color option.";
    const duplicateVariantId = existingVariants.some((item) => String(item?.variant_id ?? "").trim() === variantId);
    if (duplicateVariantId) return "That variant ID already exists for this product.";
    const duplicateSku = existingVariants.some((item) => String(item?.sku ?? "").trim().toLowerCase() === sku.trim().toLowerCase());
    if (duplicateSku) return "That variant SKU already exists for this product.";
    if (!variantDraft.sellingPriceIncl.trim()) return "Variant selling price incl is required.";
    const price = Number(variantDraft.sellingPriceIncl || 0);
    if (!Number.isFinite(price) || price <= 0) return "Variant selling price incl must be greater than 0.";
    if (variantDraft.isOnSale) {
      const discount = Number(variantDraft.saleDiscountPercent || 0);
      if (!Number.isFinite(discount) || discount <= 0 || discount > 100) {
        return "Sale discount percentage must be between 1 and 100.";
      }
    }
    if (!variantDraft.barcode.trim()) {
      return "A barcode is required for every variant.";
    }
    if (fulfillmentMode === "bevgo") {
      if (!(variantShippingProfile.actualWeightKg && variantShippingProfile.actualWeightKg > 0)) return "Variant weight is required for Piessang fulfilment.";
      if (!(variantShippingProfile.lengthCm && variantShippingProfile.lengthCm > 0)) return "Variant length is required for Piessang fulfilment.";
      if (!(variantShippingProfile.widthCm && variantShippingProfile.widthCm > 0)) return "Variant width is required for Piessang fulfilment.";
      if (!(variantShippingProfile.heightCm && variantShippingProfile.heightCm > 0)) return "Variant height is required for Piessang fulfilment.";
      if (!variantDraft.monthlySales30d.trim()) return "Monthly sales estimate is required for Piessang fulfilment.";
      if (!variantDraft.inventoryQty.trim()) return "Add public warehouse stock for this Piessang-fulfilled variant.";
    } else if (inventoryTrackingEnabled) {
      if (!variantDraft.inventoryQty.trim()) {
        return "Add stock quantity for this tracked inventory variant.";
      }
    }
    return "";
  }

  async function checkVariantBarcodeUnique(barcode: string, currentBarcode = "") {
    const trimmed = barcode.trim();
    const sellerCode = String(
      loadedProductSellerCode ||
      activeSellerContext?.sellerCode ||
      ""
    ).trim();
    if (!trimmed) {
      setVariantBarcodeStatus("idle");
      return true;
    }
    if (!sellerCode) {
      setVariantBarcodeStatus("idle");
      return true;
    }
    setVariantBarcodeStatus("checking");
    try {
      const response = await fetch(VARIANT_BARCODE_CHECK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: trimmed,
          exclude_barcode: currentBarcode.trim() || undefined,
          seller_code: sellerCode,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      const unique = Boolean(response.ok && payload?.ok !== false && payload?.unique !== false);
      setVariantBarcodeStatus(unique ? "unique" : "taken");
      return unique;
    } catch {
      setVariantBarcodeStatus("error");
      return false;
    }
  }

  async function generateVariantBarcode() {
    setGeneratingVariantBarcode(true);
    setError(null);
    try {
      const uniqueResponse = await fetch(VARIANT_BARCODE_GENERATE_UNIQUE_ENDPOINT);
      const uniquePayload = await uniqueResponse.json().catch(() => ({}));
      const barcode = String(uniquePayload?.data?.barcode ?? uniquePayload?.barcode ?? "").trim();
      if (!uniqueResponse.ok || !barcode) {
        throw new Error(uniquePayload?.message || "Unable to generate a barcode.");
      }

      const imageResponse = await fetch(VARIANT_BARCODE_GENERATE_IMAGE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: barcode }),
      });
      const imagePayload = await imageResponse.json().catch(() => ({}));
      const barcodeImageUrl = String(imagePayload?.data?.barcodeImageUrl ?? "").trim();
      if (!imageResponse.ok || !barcodeImageUrl) {
        throw new Error(imagePayload?.message || "Unable to generate a barcode image.");
      }

      setVariantDraft((current) => ({
        ...current,
        barcode,
        barcodeImageUrl,
      }));
      setVariantBarcodeStatus("unique");
      setMessage("Barcode generated for this variant.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate a barcode.");
    } finally {
      setGeneratingVariantBarcode(false);
    }
  }

  function closeDraftImpactModal(result: boolean) {
    setShowDraftImpactModal(false);
    const resolver = draftImpactResolverRef.current;
    draftImpactResolverRef.current = null;
    resolver?.(result);
  }

  function requestDraftImpactConfirmation({
    title,
    message,
  }: {
    title: string;
    message: string;
  }) {
    setDraftImpactModalTitle(title);
    setDraftImpactModalMessage(message);
    setShowDraftImpactModal(true);
    return new Promise<boolean>((resolve) => {
      draftImpactResolverRef.current = resolve;
    });
  }

  async function saveProductDraft() {
    const validationError = validateProductDraft();
    if (validationError) {
      throw new Error(validationError);
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const isUpdate = Boolean(activeProductId);
      const productHasEnteredReviewFlow = hasEnteredReviewFlow(createdProduct?.moderationStatus);
      if (
        isUpdate &&
        !(await requestDraftImpactConfirmation({
          title: "Update product",
          message:
            String(createdProduct?.moderationStatus || "").trim().toLowerCase() === "published"
              ? "Updating this product will send your changes for review while the current live version stays visible until approval."
              : productHasEnteredReviewFlow
                ? "Updating this product will move it back to draft and it will need to be resubmitted for review."
                : "Update this draft with your latest changes?",
        }))
      ) {
        return { savedId: activeProductId, isUpdate };
      }
      const payload = buildProductPayload(isUpdate ? "draft" : "draft", !isUpdate);
      const { normalizedUniqueId, normalizedSku, normalizedTitle, normalizedBrandSlug, normalizedBrandTitle } = payload;

      const response = await fetch(isUpdate ? PRODUCT_UPDATE_ENDPOINT : "/api/catalogue/v1/products/product/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isUpdate
            ? {
                unique_id: normalizedUniqueId,
                data: payload.data,
              }
            : payload,
        ),
      });

      const payloadResponse = await response.json().catch(() => ({}));
      if (!response.ok || payloadResponse?.ok === false) {
        throw new Error(payloadResponse?.message || (isUpdate ? "Unable to update the product." : "Unable to create the product."));
      }

      const returnedProduct = payloadResponse?.product?.product ?? payloadResponse?.product ?? {};
      const savedId = String(
        returnedProduct?.product?.unique_id ??
          returnedProduct?.unique_id ??
          normalizedUniqueId,
      ).trim();
      const slug = String(returnedProduct?.product?.titleSlug ?? returnedProduct?.titleSlug ?? productTitleSlug).trim();
      const moderationStatus = String(
        returnedProduct?.moderation?.status ?? payloadResponse?.product?.moderation?.status ?? payloadResponse?.moderation?.status ?? (isUpdate ? "draft" : "draft"),
      ).trim();

      setCreatedProduct({
        uniqueId: savedId,
        sku: normalizedSku,
        title: normalizedTitle,
        titleSlug: slug,
        brandSlug: normalizedBrandSlug,
        brandTitle: normalizedBrandTitle,
        vendorName: vendorName.trim(),
        moderationStatus,
        moderationReason: String(returnedProduct?.moderation?.reason ?? returnedProduct?.moderation?.notes ?? "").trim(),
      });
      setUniqueId(savedId);
      const savedBrandSlug = String(returnedProduct?.product?.brand ?? returnedProduct?.brand ?? normalizedBrandSlug).trim();
      const savedBrandTitle = String(returnedProduct?.product?.brandTitle ?? returnedProduct?.brandTitle ?? normalizedBrandTitle).trim();
      const brandCreated = Boolean(payloadResponse?.brandCreated);
      const brandPending = Boolean(payloadResponse?.brandPending || returnedProduct?.product?.brandStatus === "pending");
      if (savedBrandSlug && savedBrandTitle) {
        const savedBrand = {
          id: savedBrandSlug,
          slug: savedBrandSlug,
          title: savedBrandTitle,
          exact: true,
          mode: "existing" as const,
        };
        setBrandName(savedBrandTitle.slice(0, 30));
        setSelectedBrand(savedBrand);
        setBrandSuggestions((current) => {
          const next = current.filter((item) => item.slug !== savedBrandSlug);
          return [savedBrand, ...next].slice(0, 8);
        });
      }
      setEditingVariantIndex(null);
      setLoadedProductSku(normalizedSku);
      updateProductEditorBaseline({
        title: normalizedTitle,
        category,
        subCategory,
        condition,
        brandSlug: savedBrandSlug || normalizedBrandSlug,
        brandTitle: savedBrandTitle || normalizedBrandTitle,
        overview,
        description,
        keywords: keywordTags.slice(0, 10),
        imageKeys: imageSignatureFromItems(productImages),
        fulfillmentMode,
        inventoryTracking,
      });
      setMessage(
        [
          isUpdate
            ? payloadResponse?.resubmissionRequired
              ? payloadResponse?.liveVersionKept
                ? "Product updated. Your changes are now in review while the current live version stays visible."
                : productHasEnteredReviewFlow
                  ? "Product updated. It has been moved back to draft and must be resubmitted for review."
                  : "Draft updated."
              : "Draft updated."
            : "Product saved as draft.",
          savedBrandTitle
            ? brandPending
              ? `Brand "${savedBrandTitle}" has been submitted for approval. The product can still be saved while Piessang reviews the brand request.`
              : brandCreated
                ? `Brand "${savedBrandTitle}" was created and linked.`
                : `Brand "${savedBrandTitle}" is linked to this product.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (payloadResponse?.resubmissionRequired) {
        notifyAdminBadgeRefresh();
      }

      if (!embeddedMode) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("unique_id", savedId);
        nextUrl.searchParams.delete("id");
        nextUrl.searchParams.set("section", "create-product");
        router.replace(`${pathname}?${nextUrl.searchParams.toString()}`, { scroll: false });
      }

      await loadVariantItems(savedId);
      return { savedId, isUpdate };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the product.");
      throw cause;
    } finally {
      setSubmitting(false);
    }
  }

  function buildProductPayload(moderationStatus: "draft" | "in_review" = "draft", includeVariants = true) {
    const normalizedUniqueId = String(uniqueId).trim();
    const normalizedSku = String(productSku).trim();
    const normalizedTitle = sanitizeText(title);
    const normalizedCategory = sanitizeText(category);
    const normalizedSubCategory = sanitizeText(subCategory);
    const normalizedCondition = normalizePreLovedCondition(condition);
    const normalizedOverview = sanitizeText(overview).slice(0, OVERVIEW_MAX_LENGTH);
    const normalizedDescription = descriptionPlainText ? description.trim() : null;
    const normalizedKeywords = keywordTags.slice(0, 10);
    const normalizedBrandTitle = sanitizeText(selectedBrand?.title ?? matchingBrand?.title ?? brandName).slice(0, 60);
    const normalizedBrandSlug = selectedBrand?.slug ?? matchingBrand?.slug ?? normalizeSlug(normalizedBrandTitle);
    const images = productImages.map((item, position) => ({
      imageUrl: item.imageUrl,
      blurHashUrl: item.blurHashUrl,
      altText: item.altText || item.fileName,
      position: position + 1,
    }));
    return {
      data: {
        product: {
          unique_id: normalizedUniqueId,
          sku: normalizedSku,
          title: normalizedTitle,
          overview: normalizedOverview || null,
          description: normalizedDescription || null,
          ...(isPreLovedProductDraft && normalizedCondition ? { condition: normalizedCondition } : {}),
          keywords: normalizedKeywords,
          brandTitle: normalizedBrandTitle || null,
          brand: normalizedBrandSlug || null,
          sellerCode: activeSellerContext?.sellerCode || profile?.sellerCode || loadedProductSellerCode || null,
          vendorName: (vendorName || loadedProductVendorName).trim(),
        },
        grouping: {
          category: normalizedCategory,
          subCategory: normalizedSubCategory,
          brand: normalizedBrandSlug || null,
        },
        placement: {
          isActive: false,
          isFeatured: false,
          inventory_tracking: inventoryTrackingForProduct,
        },
        moderation: {
          status: moderationStatus,
        },
        fulfillment: {
          mode: fulfillmentMode,
          success_fee_percent: selectedSuccessFeePercent,
          success_fee_label: selectedFeeRuleLabel,
        },
        media: {
          images,
        },
        ...(includeVariants ? { variants: variantItems, inventory: [] } : {}),
      },
      normalizedUniqueId,
      normalizedSku,
      normalizedTitle,
      normalizedBrandSlug,
      normalizedBrandTitle,
      images,
    };
  }

  async function handleSubmit() {
    try {
      await saveProductDraft();
    } catch (cause) {
      // handled in saveProductDraft
    }
  }

  async function submitForReview() {
    if (!activeProductId) {
      setError("Save the product draft first.");
      return;
    }
    if (variantItems.length === 0) {
      setError("Add at least one variant before submitting the product for review.");
      return;
    }
    if (fulfillmentMode === "seller" && !sellerDeliverySettingsReady) {
      setError("Add your seller delivery and shipping settings before submitting a self-fulfilled product for review.");
      return;
    }
    if (fulfillmentMode === "seller" && sellerWeightBasedShippingRequired && !variantItems.every((variant) => Number(variant?.logistics?.weight_kg || 0) > 0)) {
      setError("Your seller shipping zones use per-kg pricing, so every variant must have a weight before submitting this product for review.");
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(PRODUCT_UPDATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unique_id: activeProductId,
          data: {
            moderation: {
              status: "in_review",
              reason: null,
              notes: null,
              reviewedAt: null,
              reviewedBy: null,
            },
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to submit the product for review.");
      }
      setCreatedProduct((current) =>
        current
          ? { ...current, moderationStatus: "in_review" }
          : current,
      );
      notifyAdminBadgeRefresh();
      setMessage("Product submitted for review.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit the product for review.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetVariantDraft({ makeDefault = variantItems.length === 0 } = {}) {
    setVariantImages([]);
    setDraggedVariantImageIndex(null);
    setDropTargetVariantImageIndex(null);
    setEditingVariantIndex(null);
    setVariantDraft({
      variantId: "",
      label: "",
      size: "",
      shade: "",
      scent: "",
      skinType: "",
      hairType: "",
      flavor: "",
      abv: "",
      containerType: "",
      storageCapacity: "",
      memoryRam: "",
      connectivity: "",
      compatibility: "",
      sizeSystem: "",
      material: "",
      ringSize: "",
      strapLength: "",
      bookFormat: "",
      language: "",
      ageRange: "",
      modelFitment: "",
      parcelPreset: "",
      shippingClass: "",
      sku: "",
      barcode: "",
      barcodeImageUrl: "",
      unitCount: "1",
      volume: "",
      volumeUnit: "ml",
      color: "",
      hasColor: false,
      sellingPriceIncl: "",
      isOnSale: false,
      saleDiscountPercent: "",
      isDefault: makeDefault,
      isActive: true,
      continueSellingOutOfStock: false,
      trackInventory: inventoryTrackingEnabled,
      inventoryQty: "",
      warehouseId: "",
      weightKg: "",
      lengthCm: "",
      widthCm: "",
      heightCm: "",
      monthlySales30d: "",
    });
  }

  function loadVariantIntoForm(variant: ProductVariantItem, index: number) {
    setEditingVariantIndex(index);
    setVariantFormOpen(true);
    setVariantImages(Array.isArray(variant.media?.images) ? variant.media.images : []);
    setVariantDraft({
      variantId: String(variant.variant_id ?? "").trim(),
      label: String(variant.label ?? "").trim(),
      size: String((variant as any).size ?? "").trim(),
      shade: String((variant as any).shade ?? "").trim(),
      scent: String((variant as any).scent ?? "").trim(),
      skinType: String((variant as any).skinType ?? "").trim(),
      hairType: String((variant as any).hairType ?? "").trim(),
      flavor: String((variant as any).flavor ?? "").trim(),
      abv: String((variant as any).abv ?? "").trim(),
      containerType: String((variant as any).containerType ?? "").trim(),
      storageCapacity: String((variant as any).storageCapacity ?? "").trim(),
      memoryRam: String((variant as any).memoryRam ?? "").trim(),
      connectivity: String((variant as any).connectivity ?? "").trim(),
      compatibility: String((variant as any).compatibility ?? "").trim(),
      sizeSystem: String((variant as any).sizeSystem ?? "").trim(),
      material: String((variant as any).material ?? "").trim(),
      ringSize: String((variant as any).ringSize ?? "").trim(),
      strapLength: String((variant as any).strapLength ?? "").trim(),
      bookFormat: String((variant as any).bookFormat ?? "").trim(),
      language: String((variant as any).language ?? "").trim(),
      ageRange: String((variant as any).ageRange ?? "").trim(),
      modelFitment: String((variant as any).modelFitment ?? "").trim(),
      parcelPreset: String(variant.logistics?.parcel_preset ?? "").trim(),
      shippingClass: String(variant.logistics?.shipping_class ?? "").trim(),
      sku: String(variant.sku ?? "").trim(),
      barcode: String(variant.barcode ?? "").trim(),
      barcodeImageUrl: String(variant.barcodeImageUrl ?? "").trim(),
      unitCount: String(variant.pack?.unit_count ?? 1),
      volume: String(variant.pack?.volume ?? ""),
      volumeUnit: normalizeVolumeUnit(String(variant.pack?.volume_unit ?? "ml")),
      color: String(variant.color ?? "").trim(),
      hasColor: Boolean(String(variant.color ?? "").trim()),
      sellingPriceIncl: String(variant.pricing?.selling_price_incl ?? ""),
      isOnSale: Boolean(variant.sale?.is_on_sale),
      saleDiscountPercent: String(variant.sale?.discount_percent ?? ""),
      isDefault: Boolean(variant.placement?.is_default),
      isActive: Boolean(variant.placement?.isActive ?? true),
      continueSellingOutOfStock: Boolean(variant.placement?.continue_selling_out_of_stock),
      trackInventory: Boolean(variant.inventory?.length) || inventoryTrackingEnabled,
      inventoryQty: String(variant.inventory?.[0]?.in_stock_qty ?? ""),
      warehouseId: String(variant.inventory?.[0]?.warehouse_id ?? ""),
      weightKg: String(variant.logistics?.weight_kg ?? ""),
      lengthCm: String(variant.logistics?.length_cm ?? ""),
      widthCm: String(variant.logistics?.width_cm ?? ""),
      heightCm: String(variant.logistics?.height_cm ?? ""),
      monthlySales30d: String(variant.logistics?.monthly_sales_30d ?? ""),
    });
  }

  async function addVariant() {
    const productValidationError = validateProductDraft();
    if (productValidationError) {
      setError(productValidationError);
      return;
    }

    try {
      let variantId = variantDraft.variantId.trim();
      if (!variantId) {
        const codeResponse = await fetch(UNIQUE_CODE_ENDPOINT);
        const codePayload = await codeResponse.json().catch(() => ({}));
        variantId = String(codePayload?.code ?? "").trim();
      }
      if (!/^\d{8}$/.test(variantId)) {
        throw new Error("Unable to generate a variant code.");
      }

      let sku = variantDraft.sku.trim();
      if (!sku) {
        const skuResponse = await fetch(SKU_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_title: title.trim(),
            variant_label: variantDraft.label.trim(),
            brand_slug: selectedBrand?.slug ?? matchingBrand?.slug ?? normalizeSlug(brandName),
            vendor_name: vendorName.trim(),
          }),
        });
        const skuPayload = await skuResponse.json().catch(() => ({}));
        sku = String(skuPayload?.sku ?? "").trim();
      }
      if (!sku) {
        throw new Error("Unable to generate a unique SKU.");
      }

      const variantValidationError = validateVariantDraft({
        variantId,
        sku,
        existingVariants:
          editingVariantIndex !== null
            ? variantItems.filter((_, index) => index !== editingVariantIndex)
            : variantItems,
      });
      if (variantValidationError) {
        setError(variantValidationError);
        return;
      }
      const barcodeUnique = await checkVariantBarcodeUnique(
        variantDraft.barcode,
        editingVariantIndex !== null ? String(variantItems[editingVariantIndex]?.barcode ?? "") : "",
      );
      if (!barcodeUnique) {
        setError("That barcode is already assigned to another variant.");
        return;
      }
      if (
        activeProductId &&
        !(await requestDraftImpactConfirmation({
          title: editingVariantIndex !== null ? "Update variant" : "Add variant",
          message:
            editingVariantIndex !== null
              ? String(createdProduct?.moderationStatus || "").trim().toLowerCase() === "published"
                ? "Updating this variant will send your changes for review while the current live version stays visible until approval."
                : hasEnteredReviewFlow(createdProduct?.moderationStatus)
                  ? "Updating this variant will move the product back to draft and it will need to be resubmitted for review."
                  : "Update this draft variant with your latest changes?"
              : String(createdProduct?.moderationStatus || "").trim().toLowerCase() === "published"
                ? "Adding this variant will send your changes for review while the current live version stays visible until approval."
                : hasEnteredReviewFlow(createdProduct?.moderationStatus)
                  ? "Adding this variant will move the product back to draft and it will need to be resubmitted for review."
                  : "Add this variant to your draft product?",
        }))
      ) {
        return;
      }

      setSubmitting(true);
      setMessage(null);
      setError(null);

      const sellingPriceIncl = money2(variantDraft.sellingPriceIncl || 0);
      const discountPercent = variantDraft.isOnSale ? Math.max(0, Math.min(100, Number(variantDraft.saleDiscountPercent || 0))) : 0;
      const saleIsOn = variantDraft.isOnSale && discountPercent > 0;
      const salePriceIncl = variantDraft.isOnSale && discountPercent > 0 ? money2(sellingPriceIncl * (1 - discountPercent / 100)) : 0;
      const isBevgoFulfilment = fulfillmentMode === "bevgo";
      const logistics = isBevgoFulfilment
        ? normalizeMarketplaceVariantLogistics({
            weightKg: variantShippingProfile.actualWeightKg,
            lengthCm: variantShippingProfile.lengthCm,
            widthCm: variantShippingProfile.widthCm,
            heightCm: variantShippingProfile.heightCm,
            monthlySales30d: variantDraft.monthlySales30d,
            stockQty: variantDraft.inventoryQty,
            warehouseId: variantDraft.warehouseId,
          })
        : null;
      const inventoryRows = (inventoryTrackingEnabled || isBevgoFulfilment)
        ? [
            {
              warehouse_id: "main",
              in_stock_qty: Number(variantDraft.inventoryQty || 0),
            },
          ]
        : [];
      const effectiveSellingPriceIncl = variantEffectiveSellingPriceIncl({
        pricing: {
          selling_price_incl: sellingPriceIncl,
        },
        sale: {
          is_on_sale: saleIsOn,
          discount_percent: discountPercent,
          sale_price_incl: salePriceIncl,
        },
      });
      const feeSnapshot = buildMarketplaceFeeSnapshot({
        categorySlug: category,
        subCategorySlug: subCategory,
        sellingPriceIncl: effectiveSellingPriceIncl,
        weightKg: variantShippingProfile.actualWeightKg || 0,
        lengthCm: variantShippingProfile.lengthCm || 0,
        widthCm: variantShippingProfile.widthCm || 0,
        heightCm: variantShippingProfile.heightCm || 0,
        stockQty: Number(variantDraft.inventoryQty || 0),
        monthlySales30d: Number(variantDraft.monthlySales30d || 0),
        fulfillmentMode,
        config: feeConfig,
      });

      const nextVariant: ProductVariantItem = {
        variant_id: variantId,
        label: variantDraft.label.trim(),
        size: formatVariantSize(variantDraft.size),
        shade: variantDraft.shade.trim(),
        scent: variantDraft.scent.trim(),
        skinType: variantDraft.skinType.trim(),
        hairType: variantDraft.hairType.trim(),
        flavor: variantDraft.flavor.trim(),
        abv: variantDraft.abv.trim(),
        containerType: variantDraft.containerType.trim(),
        storageCapacity: variantDraft.storageCapacity.trim(),
        memoryRam: variantDraft.memoryRam.trim(),
        connectivity: variantDraft.connectivity.trim(),
        compatibility: variantDraft.compatibility.trim(),
        sizeSystem: variantDraft.sizeSystem.trim(),
        material: variantDraft.material.trim(),
        ringSize: variantDraft.ringSize.trim(),
        strapLength: variantDraft.strapLength.trim(),
        bookFormat: variantDraft.bookFormat.trim(),
        language: variantDraft.language.trim(),
        ageRange: variantDraft.ageRange.trim(),
        modelFitment: variantDraft.modelFitment.trim(),
        sku,
        barcode: variantDraft.barcode.trim(),
        barcodeImageUrl: variantDraft.barcodeImageUrl.trim(),
        color: variantDraft.hasColor ? variantDraft.color.trim() : "",
        placement: {
          is_default: variantDraft.isDefault,
          isActive: variantDraft.isActive,
          track_inventory: inventoryTrackingEnabled,
          continue_selling_out_of_stock: continueSellingAvailable ? variantDraft.continueSellingOutOfStock : false,
        },
        pricing: {
          selling_price_incl: sellingPriceIncl,
        },
        sale: {
          is_on_sale: saleIsOn,
          discount_percent: discountPercent,
          sale_price_incl: salePriceIncl,
        },
        pack: {
          unit_count: Number(variantDraft.unitCount || 1),
          volume: isApparelProductDraft ? 0 : Number(variantDraft.volume || 0),
          volume_unit: normalizeVolumeUnit(isApparelProductDraft ? "each" : (variantDraft.volumeUnit || "ml")),
        },
        logistics: logistics
          ? {
              parcel_preset: effectiveParcelPreset || null,
              shipping_class: variantShippingProfile.shippingClass || null,
              weight_kg: logistics.weightKg,
              length_cm: logistics.lengthCm,
              width_cm: logistics.widthCm,
              height_cm: logistics.heightCm,
              volumetric_weight_kg: variantShippingProfile.volumetricWeightKg,
              billable_weight_kg: variantShippingProfile.billableWeightKg,
              monthly_sales_30d: logistics.monthlySales30d,
              stock_qty: logistics.stockQty,
              warehouse_id: logistics.warehouseId,
              volume_cm3: feeSnapshot.volumeCm3,
            }
          : undefined,
        fees: {
          success_fee_percent: feeSnapshot.successFeePercent,
          success_fee_incl: feeSnapshot.successFeeIncl,
          success_fee_vat_incl: feeSnapshot.successFeeVatIncl,
          fulfilment_fee_incl: feeSnapshot.fulfilmentFeeIncl,
          fulfilment_fee_excl_vat: feeSnapshot.fulfilmentFeeExclVat,
          handling_fee_incl: feeSnapshot.handlingFeeIncl,
          storage_fee_incl: feeSnapshot.storageFeeIncl,
          storage_fee_excl_vat: feeSnapshot.storageFeeExclVat,
          total_fees_incl: feeSnapshot.totalFeesIncl,
          total_marketplace_fees: feeSnapshot.totalMarketplaceFees,
          total_warehouse_fees_excl_vat: feeSnapshot.totalWarehouseFeesExclVat,
          size_band: feeSnapshot.sizeBand,
          weight_band: feeSnapshot.weightBand,
          storage_band: feeSnapshot.storageBand,
          stock_cover_days: feeSnapshot.stockCoverDays,
          overstocked: feeSnapshot.overstocked,
          fulfilment_mode: feeSnapshot.fulfillmentMode,
          config_version: feeSnapshot.configVersion,
        },
        media: {
          images: variantImages.map((item, position) => ({
            imageUrl: item.imageUrl,
            blurHashUrl: item.blurHashUrl,
            altText: item.altText || item.fileName,
            fileName: item.fileName,
            position: position + 1,
          })),
        },
        inventory: inventoryRows,
      };

      if (!activeProductId) {
        setVariantItems((current) => {
          const next = [...current, nextVariant];
          return next.map((item, index) => ({
            ...item,
            placement: {
              ...item.placement,
              is_default: index === 0 ? true : Boolean(item.placement?.is_default),
            },
          }));
        });
        setMessage("Variant staged. It will be saved with the product.");
        resetVariantDraft({ makeDefault: variantItems.length === 0 });
        setVariantFormOpen(false);
        return;
      }

      if (editingVariantIndex !== null) {
        const currentVariant = variantItems[editingVariantIndex];
        const currentVariantId = String(currentVariant?.variant_id ?? variantId).trim();
        const response = await fetch(VARIANT_UPDATE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unique_id: activeProductId,
            variant_id: currentVariantId,
            data: {
              variant_id: currentVariantId,
              label: variantDraft.label.trim(),
              size: formatVariantSize(variantDraft.size),
              shade: variantDraft.shade.trim(),
              scent: variantDraft.scent.trim(),
              skinType: variantDraft.skinType.trim(),
              hairType: variantDraft.hairType.trim(),
              flavor: variantDraft.flavor.trim(),
              abv: variantDraft.abv.trim(),
              containerType: variantDraft.containerType.trim(),
              storageCapacity: variantDraft.storageCapacity.trim(),
              memoryRam: variantDraft.memoryRam.trim(),
              connectivity: variantDraft.connectivity.trim(),
              compatibility: variantDraft.compatibility.trim(),
              sizeSystem: variantDraft.sizeSystem.trim(),
              material: variantDraft.material.trim(),
              ringSize: variantDraft.ringSize.trim(),
              strapLength: variantDraft.strapLength.trim(),
              bookFormat: variantDraft.bookFormat.trim(),
              language: variantDraft.language.trim(),
              ageRange: variantDraft.ageRange.trim(),
              modelFitment: variantDraft.modelFitment.trim(),
              sku,
              barcode: variantDraft.barcode.trim(),
              barcodeImageUrl: variantDraft.barcodeImageUrl.trim(),
              color: variantDraft.hasColor ? variantDraft.color.trim() : "",
              placement: {
                is_default: variantDraft.isDefault,
                isActive: variantDraft.isActive,
                continue_selling_out_of_stock: continueSellingAvailable ? variantDraft.continueSellingOutOfStock : false,
                track_inventory: inventoryTrackingEnabled,
              },
              pricing: {
                selling_price_incl: sellingPriceIncl,
              },
              sale: {
                is_on_sale: saleIsOn,
                discount_percent: discountPercent,
                sale_price_incl: salePriceIncl,
              },
              pack: {
                unit_count: Number(variantDraft.unitCount || 1),
                volume: isApparelProductDraft ? 0 : Number(variantDraft.volume || 0),
                volume_unit: normalizeVolumeUnit(isApparelProductDraft ? "each" : (variantDraft.volumeUnit || "ml")),
              },
              media: {
                images: variantImages.map((item, position) => ({
                  imageUrl: item.imageUrl,
                  blurHashUrl: item.blurHashUrl,
                  altText: item.altText || item.fileName,
                  position: position + 1,
                })),
              },
              logistics: logistics
                ? {
                    parcelPreset: effectiveParcelPreset || null,
                    shippingClass: variantShippingProfile.shippingClass || null,
                    weightKg: logistics.weightKg,
                    lengthCm: logistics.lengthCm,
                    widthCm: logistics.widthCm,
                    heightCm: logistics.heightCm,
                    volumetricWeightKg: variantShippingProfile.volumetricWeightKg,
                    billableWeightKg: variantShippingProfile.billableWeightKg,
                    monthlySales30d: logistics.monthlySales30d,
                    stockQty: logistics.stockQty,
                    warehouseId: logistics.warehouseId,
                  }
                : null,
              inventory: inventoryRows,
            },
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to update the variant.");
        }

        setCreatedProduct((current) =>
          current
            ? {
                ...current,
                moderationStatus: payload?.resubmissionRequired
                  ? payload?.liveVersionKept
                    ? "in_review"
                    : "draft"
                  : current.moderationStatus,
              }
            : current,
        );

        setMessage(
          payload?.resubmissionRequired
            ? payload?.liveVersionKept
              ? "Variant updated. Your changes are in review while the current live version stays visible."
              : hasEnteredReviewFlow(createdProduct?.moderationStatus)
                ? "Variant updated. The product is back in draft and must be resubmitted for review."
                : "Variant updated."
            : "Variant updated.",
        );
        if (payload?.resubmissionRequired) {
          notifyAdminBadgeRefresh();
        }
        setVariantFormOpen(false);
        resetVariantDraft({ makeDefault: variantItems.length === 0 });
        await loadVariantItems(activeProductId);
        return;
      }

      const response = await fetch(VARIANT_CREATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unique_id: activeProductId,
          data: {
            variant_id: variantId,
            label: variantDraft.label.trim(),
            size: formatVariantSize(variantDraft.size),
            shade: variantDraft.shade.trim(),
            scent: variantDraft.scent.trim(),
            skinType: variantDraft.skinType.trim(),
            hairType: variantDraft.hairType.trim(),
            flavor: variantDraft.flavor.trim(),
            abv: variantDraft.abv.trim(),
            containerType: variantDraft.containerType.trim(),
            storageCapacity: variantDraft.storageCapacity.trim(),
            memoryRam: variantDraft.memoryRam.trim(),
            connectivity: variantDraft.connectivity.trim(),
            compatibility: variantDraft.compatibility.trim(),
            sizeSystem: variantDraft.sizeSystem.trim(),
            material: variantDraft.material.trim(),
            ringSize: variantDraft.ringSize.trim(),
            strapLength: variantDraft.strapLength.trim(),
            bookFormat: variantDraft.bookFormat.trim(),
            language: variantDraft.language.trim(),
            ageRange: variantDraft.ageRange.trim(),
            modelFitment: variantDraft.modelFitment.trim(),
            sku,
            barcode: variantDraft.barcode.trim(),
            barcodeImageUrl: variantDraft.barcodeImageUrl.trim(),
            color: variantDraft.hasColor ? variantDraft.color.trim() : "",
            placement: {
              is_default: variantDraft.isDefault,
              isActive: variantDraft.isActive,
              continue_selling_out_of_stock: continueSellingAvailable ? variantDraft.continueSellingOutOfStock : false,
              track_inventory: inventoryTrackingEnabled,
            },
            pricing: {
              selling_price_incl: sellingPriceIncl,
            },
            sale: {
              is_on_sale: saleIsOn,
              discount_percent: discountPercent,
              sale_price_incl: salePriceIncl,
            },
            pack: {
              unit_count: Number(variantDraft.unitCount || 1),
              volume: isApparelProductDraft ? 0 : Number(variantDraft.volume || 0),
              volume_unit: normalizeVolumeUnit(isApparelProductDraft ? "each" : (variantDraft.volumeUnit || "ml")),
            },
            media: {
              images: variantImages.map((item, position) => ({
                imageUrl: item.imageUrl,
                blurHashUrl: item.blurHashUrl,
                altText: item.altText || item.fileName,
                position: position + 1,
              })),
            },
            logistics: logistics
              ? {
                  parcelPreset: effectiveParcelPreset || null,
                  shippingClass: variantShippingProfile.shippingClass || null,
                  weightKg: logistics.weightKg,
                  lengthCm: logistics.lengthCm,
                  widthCm: logistics.widthCm,
                  heightCm: logistics.heightCm,
                  volumetricWeightKg: variantShippingProfile.volumetricWeightKg,
                  billableWeightKg: variantShippingProfile.billableWeightKg,
                  monthlySales30d: logistics.monthlySales30d,
                  stockQty: logistics.stockQty,
                  warehouseId: logistics.warehouseId,
                }
              : null,
            inventory: inventoryRows,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to add the variant.");
      }

      setCreatedProduct((current) =>
        current
          ? {
              ...current,
              moderationStatus: payload?.resubmissionRequired
                ? payload?.liveVersionKept
                  ? "in_review"
                  : "draft"
                : current.moderationStatus,
            }
          : current,
      );

      setMessage(
        payload?.resubmissionRequired
          ? payload?.liveVersionKept
            ? "Variant added. Your changes are in review while the current live version stays visible."
            : hasEnteredReviewFlow(createdProduct?.moderationStatus)
              ? "Variant added. The product is back in draft and must be resubmitted for review."
              : "Variant added."
          : "Variant added.",
      );
      if (payload?.resubmissionRequired) {
        notifyAdminBadgeRefresh();
      }
      setVariantFormOpen(false);
      resetVariantDraft({ makeDefault: variantItems.length === 0 });
      await loadVariantItems(activeProductId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add the variant.");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeVariant(variantId: string) {
    if (!activeProductId) {
      setVariantItems((current) => {
        const next = current.filter((item) => String(item.variant_id ?? "") !== variantId);
        return next;
      });
      if (String(variantDraft.variantId ?? "").trim() === variantId) {
        resetVariantDraft({ makeDefault: variantItems.length === 1 });
      }
      setMessage("Variant removed from the draft.");
      return;
    }
    if (
      !(await requestDraftImpactConfirmation({
        title: "Delete variant",
        message:
          String(createdProduct?.moderationStatus || "").trim().toLowerCase() === "published"
            ? "Deleting this variant will send your changes for review while the current live version stays visible until approval."
            : "Deleting this variant will move the product back to draft and it will need to be resubmitted for review.",
      }))
    ) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(VARIANT_DELETE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unique_id: activeProductId,
          variant_id: variantId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to delete the variant.");
      }
      setCreatedProduct((current) =>
        current
          ? {
              ...current,
              moderationStatus: payload?.resubmissionRequired
                ? payload?.liveVersionKept
                  ? "in_review"
                  : "draft"
                : current.moderationStatus,
            }
          : current,
      );
      setMessage(
        payload?.resubmissionRequired
          ? payload?.liveVersionKept
            ? "Variant removed from the pending update. The current live version stays visible while the change is reviewed."
            : "Variant removed. The product is back in draft and must be resubmitted for review."
          : "Variant removed.",
      );
      if (payload?.resubmissionRequired) {
        notifyAdminBadgeRefresh();
      }
      await loadVariantItems(activeProductId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete the variant.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveInboundBooking() {
    if (!activeProductId) {
      setError("Save the product first before booking inbound stock.");
      return;
    }
    const variants = variantItems
      .map((item) => ({
        variantId: String(item?.variant_id ?? "").trim(),
        quantity: Number(inboundQuantities[String(item?.variant_id ?? "").trim()] || 0),
      }))
      .filter((item) => item.variantId && item.quantity > 0);

    if (!inboundDeliveryDate) {
      setError("Choose the delivery date for this inbound booking.");
      return;
    }
    if (!variants.length) {
      setError("Add at least one inbound quantity before saving the booking.");
      return;
    }

    setSavingInboundBooking(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(SELLER_INBOUND_BOOKINGS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: activeProductId,
          deliveryDate: inboundDeliveryDate,
          notes: inboundNotes,
          variants,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to save the inbound booking.");
      }
      setInboundBookings((current) => [...current, payload.booking].sort((left, right) => String(left?.deliveryDate || "").localeCompare(String(right?.deliveryDate || ""))));
      setInboundNotes("");
      setInboundDeliveryDate("");
      setInboundQuantities({});
      setMessage("Inbound booking saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the inbound booking.");
    } finally {
      setSavingInboundBooking(false);
    }
  }

  async function saveStockUpliftment() {
    if (!activeProductId) {
      setError("Save the product first before requesting a stock upliftment.");
      return;
    }
    const variants = variantItems
      .map((item) => ({
        variantId: String(item?.variant_id ?? "").trim(),
        quantity: Number(upliftQuantities[String(item?.variant_id ?? "").trim()] || 0),
      }))
      .filter((item) => item.variantId && item.quantity > 0);

    if (!upliftDate) {
      setError("Choose the date for this stock upliftment.");
      return;
    }
    if (!variants.length) {
      setError("Add at least one uplift quantity before saving the request.");
      return;
    }

    setSavingStockUpliftment(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(SELLER_STOCK_UPLIFTMENTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: activeProductId,
          upliftDate,
          notes: upliftNotes,
          reason: upliftReason,
          variants,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to save the stock upliftment request.");
      }
      setStockUpliftments((current) => [...current, payload.upliftment].sort((left, right) => String(left?.upliftDate || "").localeCompare(String(right?.upliftDate || ""))));
      setUpliftDate("");
      setUpliftNotes("");
      setUpliftReason("");
      setUpliftQuantities({});
      setMessage("Stock upliftment request saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the stock upliftment request.");
    } finally {
      setSavingStockUpliftment(false);
    }
  }

  function openDeleteModal() {
    setShowDeleteModal(true);
  }

  function updateProductEditorBaseline(next: Partial<ProductEditorBaseline>) {
    setProductEditorBaseline(createProductEditorBaseline(next));
  }

  async function requestFulfillmentChange() {
    if (!activeProductId) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const requestedMode = fulfillmentMode === "seller" ? "bevgo" : "seller";
      const response = await fetch(PRODUCT_UPDATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unique_id: activeProductId,
          data: {
            fulfillment: {
              change_request: {
                requested: true,
                status: "requested",
                desired_mode: requestedMode,
                reason: fulfillmentChangeNote.trim(),
                requestedAt: new Date().toISOString(),
                requestedBy: profile?.uid ?? null,
              },
            },
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to request a fulfilment change.");
      }

      setShowFulfillmentChangeModal(false);
      setFulfillmentChangeNote("");
      setMessage("Fulfilment change requested.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to request a fulfilment change.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDeleteProduct() {
    if (!activeProductId) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(PRODUCT_DELETE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unique_id: activeProductId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to delete the product.");
      }

      setShowDeleteModal(false);
      resetProductForm();
      setCreatedProduct(null);
      setMessage("Product deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete the product.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!authReady) {
    return (
      <PageBody className="px-3 py-6 lg:px-4 lg:py-8">
        <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <div className="h-6 w-44 rounded-[8px] bg-[#f4f4f4]" />
          <div className="mt-4 h-10 w-full rounded-[8px] bg-[#f4f4f4]" />
          <div className="mt-3 h-10 w-full rounded-[8px] bg-[#f4f4f4]" />
        </section>
      </PageBody>
    );
  }

  if (!isAuthenticated) {
    return (
      <PageBody className="py-10">
        <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Seller catalogue</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Sign in to create products</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
            Seller catalogue tools live behind your account, so we can keep your product data, vendor name, and orders in one place.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("Sign in to access the product creation flow.")}
            className="brand-button mt-5 inline-flex h-10 items-center rounded-[8px] px-4 text-[13px] font-semibold"
          >
            Sign in
          </button>
        </section>
      </PageBody>
    );
  }

  if (!canUseSellerEditor) {
    return (
      <PageBody className="py-10">
        <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Seller catalogue</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Register as a seller first</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
            Once your seller account is approved, this is where you will create and manage products.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => openSellerRegistrationModal("Register your seller account to unlock catalogue tools.")}
              className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
            >
              Register as seller
            </button>
            <Link
              href="/seller/catalogue"
              className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
            >
              Back to catalogue
            </Link>
          </div>
        </section>
      </PageBody>
    );
  }

  if (sellerBlocked) {
    return (
      <PageBody className="py-10">
        <section className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b91c1c]">Seller catalogue</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">This seller account is blocked</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
            {sellerBlockedReasonLabel}. {sellerBlockedFixHint}
          </p>
          <p className="mt-3 text-[13px] leading-[1.6] text-[#57636c]">
            Fix the issue first, then request a review from your seller dashboard.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/seller/dashboard?section=home"
              className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
            >
              Go to seller dashboard
            </Link>
            <Link
              href="/seller/catalogue"
              className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
            >
              Back to catalogue
            </Link>
          </div>
        </section>
      </PageBody>
    );
  }

  if (productAccessDenied) {
    return (
      <PageBody className="py-10">
        <section className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b91c1c]">Product access</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">You do not have access to this product</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
            Only the seller account owner, their team members, or a system admin can open and edit this listing.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/seller/dashboard?section=products"
              className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
            >
              Back to products
            </Link>
          </div>
        </section>
      </PageBody>
    );
  }

  return (
    <PageBody className="px-3 py-6 lg:px-4 lg:py-8">
      <section className="rounded-[8px] bg-[#202020] px-4 py-3 text-white shadow-[0_8px_24px_rgba(20,24,27,0.14)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-[8px] border border-white/10 bg-white/10 px-3 py-2 text-[12px] font-semibold">
              {createdProduct ? formatModerationStatus(createdProduct.moderationStatus || "draft") : "Unsaved product"}
            </span>
            <span className="hidden text-[12px] text-white/70 md:inline">
              {createdProduct ? "Review the saved listing, add variants, or update the draft." : "Add details, review the summary, then save the draft."}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeProductId ? (
              <Link
                href={`/products/${createdProduct?.titleSlug || productTitleSlug}?unique_id=${encodeURIComponent(activeProductId)}`}
                className="inline-flex h-10 items-center rounded-[8px] border border-white/10 bg-white/10 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-white/15"
              >
                Preview
              </Link>
            ) : (
              <Link
                href="/seller/dashboard?section=products"
                className="inline-flex h-10 items-center rounded-[8px] border border-white/10 bg-white/10 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-white/15"
              >
                Discard
              </Link>
            )}
            {activeProductId ? (
              <button
                type="button"
                onClick={openDeleteModal}
                className="inline-flex h-10 items-center rounded-[8px] border border-white/10 bg-white/10 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-white/15"
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!formIsValid}
              className="brand-button inline-flex h-10 items-center rounded-[8px] px-4 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving..." : activeProductId ? "Update draft" : "Save draft"}
            </button>
          </div>
        </div>
      </section>

      <section
        className={[
          "mt-3 rounded-[8px] border px-4 py-3 shadow-[0_8px_24px_rgba(20,24,27,0.05)]",
          productChangeImpact.tone === "review"
            ? "border-[#f0c7cb] bg-[#fff7f8]"
            : productChangeImpact.tone === "live"
              ? "border-[#cfe8d8] bg-[rgba(57,169,107,0.07)]"
              : "border-black/5 bg-white",
        ].join(" ")}
      >
        <p
          className={[
            "text-[11px] font-semibold uppercase tracking-[0.12em]",
            productChangeImpact.tone === "review"
              ? "text-[#b91c1c]"
              : productChangeImpact.tone === "live"
                ? "text-[#1a8553]"
                : "text-[#907d4c]",
          ].join(" ")}
        >
          Change impact
        </p>
        <p className="mt-2 text-[15px] font-semibold text-[#202020]">{productChangeImpact.title}</p>
        <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">{productChangeImpact.message}</p>
      </section>

      <SellerPageIntro
        title="Create product"
        description="Start with the product record here. Variants, pricing, and stock are added once the core listing is saved."
      />

      {showInitialEditorSkeleton ? renderEditorLoadingSkeleton() : (
      <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          {createdProduct ? (
            <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#39a96b]">Product created</p>
                <span className="rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1 text-[11px] font-semibold text-[#907d4c]">
                  {formatModerationStatus(createdProduct.moderationStatus || "draft")}
                </span>
              </div>
              <h2 className="mt-2 text-[18px] font-semibold text-[#202020]">{createdProduct.title}</h2>
              <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">
                {isSystemAdmin
                  ? "You are viewing this listing in system admin mode. Seller-only submission shortcuts are hidden here."
                  : "Your listing is saved as a draft. Add variants, then submit it for review when you are ready. If Piessang fulfils this listing, it will move to an awaiting stock state after approval."}
              </p>
              <p className="mt-2 text-[12px] uppercase tracking-[0.12em] text-[#907d4c]">SKU: {createdProduct.sku}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/products/${createdProduct.titleSlug}?unique_id=${createdProduct.uniqueId}`}
                  className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
                >
                  Preview
                </Link>
                <button
                  type="button"
                  onClick={() => setVariantFormOpen((current) => !current)}
                  className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                >
                  {variantFormOpen ? "Close variants" : "Add variant"}
                </button>
                {!isSystemAdmin ? (
                  <button
                    type="button"
                    onClick={resetProductForm}
                    className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                  >
                    Create another
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-0">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Product code <span className="text-[#d11c1c]">*</span></span>
                <div className="flex gap-2">
                  <input
                    value={uniqueId}
                    readOnly
                    className="w-full rounded-[8px] border border-black/10 bg-[#fafafa] px-4 py-3 text-[13px] outline-none"
                    placeholder="Generating..."
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeProductId) void fetchUniqueCode();
                    }}
                    disabled={generatingCode || Boolean(activeProductId)}
                    className="inline-flex h-[46px] items-center rounded-[8px] border border-black/10 bg-white px-3 text-[13px] font-semibold text-[#202020]"
                  >
                    {activeProductId ? "Locked" : generatingCode ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Product title <span className="text-[#d11c1c]">*</span></span>
                <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1.5" />
                <input
                  value={title}
                  onChange={(event) => setTitle(sanitizeProductTitle(event.target.value))}
                  className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
                  placeholder="Coca Cola Original 300ml Cans"
                />
                <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                  Add the title first to unlock SKU, description, and keyword generation.
                </p>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Product SKU <span className="text-[#d11c1c]">*</span></span>
                <div className="flex gap-2">
                  <input
                    value={productSku}
                    onChange={(event) => setProductSku(event.target.value.toUpperCase())}
                    className={[
                      "w-full rounded-[8px] border bg-white px-4 py-3 text-[13px] outline-none transition-colors",
                      skuStatus === "unique"
                        ? "border-[#1a8553] focus:border-[#1a8553]"
                        : skuStatus === "taken"
                          ? "border-[#d11c1c] focus:border-[#d11c1c]"
                          : "border-black/10 focus:border-[#cbb26b]",
                    ].join(" ")}
                    placeholder="BEVGO-COCA-COLA-300ML-CAN-ZERO-24"
                  />
                  <button
                    type="button"
                    onClick={() => void fetchProductSku()}
                    disabled={generatingSku || !titleHasValue}
                    className="inline-flex h-[46px] items-center rounded-[8px] border border-[#202020] bg-[#202020] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:border-[#d9d9d9] disabled:bg-[#efefef] disabled:text-[#9d9d9d]"
                  >
                    {generatingSku ? "Generating..." : "Generate"}
                  </button>
                </div>
                {!titleHasValue ? (
                  <p className="mt-1 text-[11px] leading-[1.4] text-[#b91c1c]">Add a title first to generate a unique SKU.</p>
                ) : skuStatus === "checking" ? (
                  <p className="mt-1 text-[11px] leading-[1.4] text-[#907d4c]">Checking SKU availability...</p>
                ) : skuStatus === "unique" ? (
                  <p className="mt-1 text-[11px] leading-[1.4] text-[#1a8553]">SKU is available.</p>
                ) : skuStatus === "taken" ? (
                  <p className="mt-1 text-[11px] leading-[1.4] text-[#d11c1c]">This SKU already exists. Please use another one.</p>
                ) : skuStatus === "error" ? (
                  <p className="mt-1 text-[11px] leading-[1.4] text-[#b91c1c]">Unable to check SKU right now. Try again in a moment.</p>
                ) : (
                  <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                    You can type your own SKU or generate one. SKU values must stay unique across all products and variants on the platform.
                  </p>
                )}
                <p className="mt-1 text-[11px] leading-[1.4] text-[#907d4c]">
                  Example: BEVGO-COCA-COLA-300ML-CAN-ORIGINAL-1
                </p>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Primary category <span className="text-[#d11c1c]">*</span></span>
                  <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1.5" />
                  <select
                    value={category}
                    onChange={(event) => {
                      const nextCategory = event.target.value;
                      setCategory(nextCategory);
                      setSubCategory("");
                    }}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
                  >
                    <option value="">Select a category</option>
                    {marketplaceCategories.map((item) => (
                      <option key={item.slug} value={item.slug}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Sub category <span className="text-[#d11c1c]">*</span></span>
                  <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1.5" />
                  <select
                    value={subCategory}
                    onChange={(event) => setSubCategory(event.target.value)}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
                    disabled={!category}
                  >
                    <option value="">{category ? "Select a sub category" : "Select a category first"}</option>
                    {subCategories.map((item) => (
                      <option key={item.slug} value={item.slug}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {isPreLovedProductDraft ? (
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Item condition <span className="text-[#d11c1c]">*</span></span>
                  <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1.5" />
                  <select
                    value={condition}
                    onChange={(event) => setCondition(event.target.value)}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
                  >
                    <option value="">Select condition</option>
                    {PRE_LOVED_CONDITIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] leading-[1.4] text-[#57636c]">
                    This stays managed in Piessang so shoppers can clearly see the condition you chose for the item.
                  </p>
                </label>
              ) : null}

              <div className="rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Success fee</p>
                    <p className="mt-1 text-[12px] font-semibold text-[#202020]">
                      {category ? (selectedFeeRuleLabel || "Select a category to preview the fee") : "Select a category to preview the fee"}
                    </p>
                    <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                      Calculated on the VAT-inclusive selling price at the time the order is created.
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Brand name <span className="text-[#d11c1c]">*</span></span>
                  <input
                    value={brandName}
                    onFocus={() => setBrandDropdownOpen(true)}
                    onBlur={handleBrandBlur}
                    onChange={(event) => handleBrandChange(event.target.value)}
                    className={[
                      "w-full rounded-[8px] border bg-white px-4 py-3 text-[13px] outline-none transition-colors",
                      selectedBrand || matchingBrand
                        ? "border-[#1a8553] focus:border-[#1a8553]"
                        : "border-black/10 focus:border-[#cbb26b]",
                    ].join(" ")}
                    placeholder="Coca Cola"
                  />
                  <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                    Choose a recommended brand from Piessang or type a new one. Unknown brands are submitted for approval while you continue creating the product.
                  </p>
                </label>
                {brandDropdownOpen && (loadingBrands || filteredBrandSuggestions.length > 0 || (brandName.trim() && !matchingBrand)) ? (
                  <div className="absolute z-20 mt-2 w-full rounded-[8px] border border-black/10 bg-white p-2 shadow-[0_16px_36px_rgba(20,24,27,0.12)]">
                    <div className="flex items-center justify-between px-2 py-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Recommended brands</p>
                      {matchingBrand ? (
                        <span className="text-[11px] font-semibold text-[#1a8553]">Match found</span>
                      ) : null}
                    </div>
                    <div className="mt-1 max-h-56 space-y-1 overflow-auto">
                      {loadingBrands ? (
                        <div className="rounded-[8px] bg-[#fafafa] px-3 py-2 text-[12px] text-[#57636c]">
                          Loading brand suggestions...
                        </div>
                      ) : filteredBrandSuggestions.length ? (
                        <>
                          {brandName.trim() && !matchingBrand ? (
                            <div className="px-2 pt-1 text-[11px] text-[#57636c]">
                              No exact match yet. Save the product to submit this brand for approval.
                            </div>
                          ) : null}
                          {filteredBrandSuggestions.map((item) => {
                            const exact = matchingBrand?.slug === item.slug;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => selectBrandSuggestion(item)}
                                className={[
                                  "flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-left text-[12px] transition-colors",
                                  exact ? "bg-[rgba(26,133,83,0.1)] text-[#1a8553]" : "bg-[#fafafa] text-[#202020] hover:bg-[#f4f4f4]",
                                ].join(" ")}
                              >
                                <span className="font-medium">{item.title}</span>
                                <span className="text-[11px] text-[#8b94a3]">{item.slug}</span>
                              </button>
                            );
                          })}
                        </>
                      ) : (
                        <>
                          <div className="rounded-[8px] bg-[#fff7f8] px-3 py-2 text-[12px] text-[#b91c1c]">
                            No exact brand match yet. Save the product and Piessang will receive a brand approval request.
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Vendor name <span className="text-[#d11c1c]">*</span></span>
                <input
                  value={vendorName}
                  readOnly
                  className="w-full rounded-[8px] border border-black/10 bg-[#fafafa] px-4 py-3 text-[13px] outline-none"
                />
                <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                  Read from the seller module on your Piessang account.
                </p>
              </label>

              <section className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[12px] font-semibold text-[#202020]">Fulfilment</p>
                    <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                      Choose who fulfils the order. Success fees come from the live category fee table, while Piessang fulfilment also adds handling, storage, and fulfilment fees.
                    </p>
                  </div>
                  <span className="rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1 text-[11px] font-semibold text-[#907d4c]">
                    {selectedSuccessFeePercent.toFixed(1)}% success fee
                  </span>
                </div>
                <div className="mt-3 rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-2 text-[11px] leading-[1.5] text-[#57636c]">
                  {fulfillmentLocked
                    ? "Fulfilment is locked after the first save. If you need to change it, request a fulfilment change from Piessang."
                    : "Choose fulfilment now. Once the product is saved, this setting is locked to protect order routing and fee rules."}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[
                    {
                      value: "seller",
                      title: "Seller fulfils",
                      desc: "You pack and ship the order from your own operation. Inventory tracking is optional, but if you leave it off you must always have stock available.",
                      fee: "Category success fee",
                    },
                    {
                      value: "bevgo",
                      title: "Piessang fulfils",
                      desc: "Piessang stores and fulfils the product from our warehouse. You can submit the listing now, then stock is booked in once it arrives.",
                      fee: "Success + fulfilment fees",
                    },
                  ].map((option) => {
                    const selected = fulfillmentMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => !fulfillmentLocked && setFulfillmentMode(option.value as "seller" | "bevgo")}
                        disabled={fulfillmentLocked}
                        className={[
                          "rounded-[8px] border px-3 py-3 text-left transition-colors",
                          selected
                            ? "border-[#cbb26b] bg-[rgba(203,178,107,0.10)]"
                            : "border-black/10 bg-white hover:border-[#cbb26b]/60",
                          fulfillmentLocked ? "cursor-not-allowed opacity-70" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[12px] font-semibold text-[#202020]">{option.title}</p>
                          <span className="text-[11px] font-semibold text-[#907d4c]">{option.fee}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">{option.desc}</p>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {fulfillmentMode === "seller" ? (
                    <div className="rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-3 text-[11px] text-[#57636c] sm:col-span-2">
                      Delivery timing for seller-fulfilled products now comes from your shipping preferences. Update your local delivery radius or country shipping rates in Settings to control the delivery promise shown to shoppers.
                    </div>
                  ) : null}
                  {fulfillmentLocked ? (
                    <button
                      type="button"
                      onClick={() => setShowFulfillmentChangeModal(true)}
                      className="inline-flex h-11 w-full items-center justify-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#907d4c] sm:col-span-2"
                    >
                      Request fulfilment change
                    </button>
                  ) : (
                    <div className="rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-3 text-[11px] text-[#57636c] sm:col-span-2">
                      You can update fulfilment before the first save.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[12px] font-semibold text-[#202020]">Inventory tracking</p>
                    <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                      {inventoryTrackingRequired
                        ? "Piessang fulfilment requires tracked warehouse stock before this product can go live."
                        : "Optional for self-fulfilment. If you leave it off, make sure this item stays available at all times."}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${inventoryTrackingEnabled ? "bg-[rgba(26,133,83,0.12)] text-[#166534]" : "bg-[rgba(148,163,184,0.14)] text-[#475569]"}`}>
                    {inventoryTrackingRequired ? "Required" : inventoryTrackingEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <label className="mt-3 inline-flex items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] text-[#202020]">
                  <input
                    type="checkbox"
                    checked={inventoryTrackingEnabled}
                    disabled={inventoryTrackingRequired}
                    onChange={(event) => setInventoryTracking(event.target.checked)}
                  />
                  Track inventory for this product
                </label>
                {inventoryTrackingRequired ? (
                  <p className="mt-2 text-[11px] leading-[1.4] text-[#907d4c]">
                    Piessang fulfilment keeps this on. Add stock for each variant below so the listing can be published.
                  </p>
                ) : null}
              </section>

              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[12px] font-semibold text-[#202020]">
                      Product overview <span className="text-[#d11c1c]">*</span>
                    </p>
                    <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mt-1.5" />
                  </div>
                  <button
                    type="button"
                    onClick={generateOverview}
                    disabled={generatingOverview || !aiHelpersEnabled}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-[8px] border border-[#7c3aed] bg-[linear-gradient(135deg,#7c3aed_0%,#8b5cf6_35%,#ec4899_70%,#f59e0b_100%)] px-4 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(139,92,246,0.22)] transition-transform hover:translate-y-[-1px] hover:shadow-[0_12px_26px_rgba(139,92,246,0.28)] disabled:cursor-not-allowed disabled:border-[#e4d7fb] disabled:bg-[#f4f0fb] disabled:text-[#a59b82] disabled:shadow-none"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    {generatingOverview ? "Generating..." : "AI overview"}
                  </button>
                </div>
                <textarea
                  value={overview}
                  onChange={(event) => setOverview(event.target.value.slice(0, OVERVIEW_MAX_LENGTH))}
                  rows={3}
                  maxLength={OVERVIEW_MAX_LENGTH}
                  className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
                  placeholder="Short summary of the product..."
                />
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-[11px] leading-[1.4] text-[#57636c]">
                    Keep this concise. It should give buyers the quick version at a glance.
                  </p>
                  <span className="text-[11px] text-[#57636c]">{overview.length}/{OVERVIEW_MAX_LENGTH}</span>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[12px] font-semibold text-[#202020]">
                      Product description <span className="text-[#d11c1c]">*</span>
                    </p>
                    <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mt-1.5" />
                  </div>
                  <button
                    type="button"
                    onClick={generateDescription}
                    disabled={generatingDescription || !aiHelpersEnabled}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-[8px] border border-[#7c3aed] bg-[linear-gradient(135deg,#7c3aed_0%,#8b5cf6_35%,#ec4899_70%,#f59e0b_100%)] px-4 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(139,92,246,0.22)] transition-transform hover:translate-y-[-1px] hover:shadow-[0_12px_26px_rgba(139,92,246,0.28)] disabled:cursor-not-allowed disabled:border-[#e4d7fb] disabled:bg-[#f4f0fb] disabled:text-[#a59b82] disabled:shadow-none"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    {generatingDescription ? "Generating..." : "AI description"}
                  </button>
                </div>
                <RichTextEditor
                  value={description}
                  onChange={(value) => setDescription(value)}
                  placeholder="Add a longer product description..."
                  editorRef={descriptionEditorRef}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                />
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-[11px] leading-[1.4] text-[#57636c]">
                    This is the full product description. Keep it clear and helpful.
                  </p>
                  <span className="text-[11px] text-[#57636c]">{descriptionPlainText.length}/{DESCRIPTION_MAX_LENGTH}</span>
                </div>
                <p className="mt-1 text-[11px] leading-[1.4] text-[#b91c1c]">{aiHelperPrompt}</p>
              </section>

              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="text-[12px] font-semibold text-[#202020]">
                        Keywords <span className="text-[#d11c1c]">*</span>
                      </p>
                      <span className="text-[11px] text-[#57636c]">{keywordTags.length}/10</span>
                    </div>
                    <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mt-1.5" />
                  </div>
                  <button
                    type="button"
                    onClick={generateKeywords}
                    disabled={generatingKeywords || !aiHelpersEnabled}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-[8px] border border-[#7c3aed] bg-[linear-gradient(135deg,#7c3aed_0%,#8b5cf6_35%,#ec4899_70%,#f59e0b_100%)] px-4 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(139,92,246,0.22)] transition-transform hover:translate-y-[-1px] hover:shadow-[0_12px_26px_rgba(139,92,246,0.28)] disabled:cursor-not-allowed disabled:border-[#e4d7fb] disabled:bg-[#f4f0fb] disabled:text-[#a59b82] disabled:shadow-none"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    {generatingKeywords ? "Generating..." : "AI keywords"}
                  </button>
                </div>
                <div className="rounded-[8px] border border-black/10 bg-white px-3 py-2 transition-colors focus-within:border-[#cbb26b]">
                  <div className="flex flex-wrap gap-2">
                    {keywordTags.map((keyword, index) => (
                      <span
                        key={`${keyword}-${index}`}
                        className="inline-flex items-center gap-1 rounded-[8px] border border-black/10 bg-[#fafafa] px-2.5 py-1 text-[12px] font-medium text-[#202020]"
                      >
                        {keyword}
                        <button
                          type="button"
                          onClick={() => removeKeywordAt(index)}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/5 text-[10px] leading-none text-[#57636c] transition-colors hover:bg-[#f0c7cb] hover:text-[#b91c1c]"
                          aria-label={`Remove ${keyword}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      value={keywordInput}
                      onChange={(event) => setKeywordInput(event.target.value)}
                      onKeyDown={handleKeywordKeyDown}
                      onBlur={commitKeywordInput}
                      className="min-w-[180px] flex-1 border-0 bg-transparent px-1 py-1 text-[13px] outline-none placeholder:text-[#9aa3af]"
                      placeholder="Type a keyword and press comma"
                    />
                  </div>
                </div>
                <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                  Use commas or Enter to add keywords. Backspace removes the last pill when the field is empty.
                </p>
                <p className="mt-1 text-[11px] leading-[1.4] text-[#b91c1c]">{aiHelperPrompt}</p>
              </section>

              <section className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold text-[#202020]">Product images</p>
                    <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                      Upload clear product images for the listing. Drag to reorder them and update alt text once they are in.
                    </p>
                  </div>
                  <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#907d4c] shadow-[0_4px_10px_rgba(20,24,27,0.06)]">
                    {productImages.length} image{productImages.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="mt-3 rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-2 text-[11px] text-[#57636c]">
                  <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} />
                </div>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void uploadFiles(event.target.files ?? []);
                  }}
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={uploadingImages}
                    className="flex min-h-[172px] w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#d7d7d7] bg-white px-4 py-5 text-center text-[#57636c] transition-colors hover:border-[#cbb26b] hover:bg-[#fffaf0] hover:text-[#907d4c] disabled:cursor-wait disabled:border-[#cbb26b] disabled:bg-[rgba(203,178,107,0.12)] disabled:text-[#907d4c] disabled:opacity-100"
                  >
                    {uploadingImages ? (
                      <>
                        <SpinnerIcon className="h-5 w-5 animate-spin text-[#907d4c]" />
                        <span className="text-[12px] font-semibold">Uploading...</span>
                        <span className="text-[10px] leading-[1.4]">Your images will appear here once the upload completes.</span>
                      </>
                    ) : (
                      <>
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#faf7ef] text-[24px] leading-none text-[#907d4c]">
                          +
                        </span>
                        <span className="text-[12px] font-semibold text-[#202020]">Upload images</span>
                        <span className="max-w-[180px] text-[10px] leading-[1.5]">
                          Click to add product photos. Use clean front-facing shots first, then supporting angles.
                        </span>
                      </>
                    )}
                  </button>
                  {productImages.map((image, index) => (
                    <ProductImageCard
                      key={`${image.fileName}-${index}`}
                      image={image}
                      index={index}
                      onMove={moveImage}
                      onDropImage={reorderImages}
                      onRemove={removeImageAt}
                      onAltChange={updateImageAltText}
                      onDragStartImage={beginDragImage}
                      onDragEndImage={endDragImage}
                      onDragEnterImage={hoverDragImage}
                      canMoveUp={index > 0}
                      canMoveDown={index < productImages.length - 1}
                      isDragging={draggedImageIndex === index}
                      isDropTarget={dropTargetIndex === index && draggedImageIndex !== null && draggedImageIndex !== index}
                    />
                  ))}
                </div>
              </section>

              <section className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
                <div className="mb-3 rounded-[8px] border border-[rgba(203,178,107,0.24)] bg-[rgba(203,178,107,0.10)] px-3 py-2 text-[11px] leading-[1.45] text-[#6b5a2d]">
                  Every product must have at least one variant. The product listing only captures the core product shell, while variants define the pack size, price, stock, and sale settings that customers can actually buy.
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[12px] font-semibold text-[#202020]">Variants</p>
                    <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                      Add at least one variant before you submit this draft for review.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (variantFormOpen) {
                        setVariantFormOpen(false);
                        return;
                      }
                      void openVariantForm();
                    }}
                    className="inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white"
                  >
                    {variantFormOpen ? "Hide form" : "Add variant"}
                  </button>
                </div>

                {variantFormOpen ? (
                  <div className="mt-4 space-y-3 rounded-[8px] border border-black/5 bg-white p-4">
                    <div
                      className={[
                        "rounded-[8px] border px-3 py-3",
                        variantChangeImpact.tone === "review"
                          ? "border-[#f0c7cb] bg-[#fff7f8]"
                          : variantChangeImpact.tone === "live"
                            ? "border-[#cfe8d8] bg-[rgba(57,169,107,0.07)]"
                            : "border-black/5 bg-[#fafafa]",
                      ].join(" ")}
                    >
                      <p
                        className={[
                          "text-[11px] font-semibold uppercase tracking-[0.12em]",
                          variantChangeImpact.tone === "review"
                            ? "text-[#b91c1c]"
                            : variantChangeImpact.tone === "live"
                              ? "text-[#1a8553]"
                              : "text-[#907d4c]",
                        ].join(" ")}
                      >
                        Variant change impact
                      </p>
                      <p className="mt-2 text-[14px] font-semibold text-[#202020]">{variantChangeImpact.title}</p>
                      <p className="mt-1 text-[12px] leading-[1.55] text-[#57636c]">{variantChangeImpact.message}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Variant ID <span className="text-[#d11c1c]">*</span></span>
                        <div className="flex gap-2">
                          <input
                            value={variantDraft.variantId}
                            onChange={(event) =>
                              setVariantDraft((current) => ({
                                ...current,
                                variantId: event.target.value.replace(/\D/g, "").slice(0, 8),
                              }))
                            }
                            className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                            placeholder="Generate or enter 8 digits"
                          />
                          <button
                            type="button"
                            onClick={() => void fetchVariantCode()}
                            disabled={submitting}
                            className="inline-flex h-[42px] min-w-[108px] items-center justify-center rounded-[8px] border border-black/10 bg-[#202020] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Generate
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">Every variant needs its own unique 8-digit code.</p>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Variant label <span className="text-[#d11c1c]">*</span></span>
                        <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                        <input
                          value={variantDraft.label}
                          onChange={(event) => setVariantDraft((current) => ({ ...current, label: event.target.value }))}
                          className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                          placeholder="24 Pack (300ml)"
                        />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-[#202020]">
                          Barcode {fulfillmentMode === "bevgo" ? <span className="text-[#d11c1c]">*</span> : null}
                        </span>
                        <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                        <input
                          value={variantDraft.barcode}
                          onChange={(event) => {
                            setVariantDraft((current) => ({ ...current, barcode: event.target.value.trim() }));
                            setVariantBarcodeStatus("idle");
                          }}
                          onBlur={() => {
                            void checkVariantBarcodeUnique(
                              variantDraft.barcode,
                              editingVariantIndex !== null ? String(variantItems[editingVariantIndex]?.barcode ?? "") : "",
                            );
                          }}
                          className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                          placeholder="Scan or paste the variant barcode"
                        />
                        <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                          {fulfillmentMode === "bevgo"
                            ? "Required for Piessang fulfilment. Piessang can only receive inbound stock when the barcode on the delivered unit matches this platform variant."
                            : "Required for seller fulfilment too. Use the supplier barcode or generate one if the item does not already have one."}
                        </p>
                        {variantBarcodeStatus === "taken" ? <p className="mt-1 text-[11px] text-[#b91c1c]">That barcode is already used on another variant.</p> : null}
                        {variantBarcodeStatus === "unique" ? <p className="mt-1 text-[11px] text-[#166534]">Barcode is available.</p> : null}
                      </label>
                      <button
                        type="button"
                        onClick={() => void generateVariantBarcode()}
                        disabled={generatingVariantBarcode || submitting}
                        className="inline-flex h-[42px] min-w-[132px] items-center justify-center self-start sm:self-end rounded-[8px] border border-black/10 bg-[#202020] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {generatingVariantBarcode ? "Generating..." : "Generate barcode"}
                      </button>
                    </div>
                    {variantDraft.barcodeImageUrl ? (
                      <div className="rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Barcode preview</p>
                        <img src={variantDraft.barcodeImageUrl} alt={`Barcode ${variantDraft.barcode || ""}`} className="mt-2 h-16 w-auto rounded-[6px] bg-white p-2" />
                      </div>
                    ) : null}
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] text-[#202020]">
                        <input
                          type="checkbox"
                          checked={variantDraft.hasColor}
                          onChange={(event) =>
                            setVariantDraft((current) => ({
                              ...current,
                              hasColor: event.target.checked,
                              color: event.target.checked ? current.color || "#d1d5db" : "",
                            }))
                          }
                        />
                        This variant has a color option
                      </label>
                      {variantDraft.hasColor ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Color</span>
                            <div className="flex items-center gap-3 rounded-[8px] border border-black/10 bg-white px-3 py-2.5">
                              <SwatchPicker
                                value={variantDraft.color || "#d1d5db"}
                                onChange={(value) => setVariantDraft((current) => ({ ...current, color: value }))}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Selected</span>
                                  <span className="text-[12px] text-[#57636c]">
                                    {variantDraft.color ? variantDraft.color.toUpperCase() : "No color selected"}
                                  </span>
                                </div>
                                <input
                                  type="color"
                                  value={variantDraft.color || "#d1d5db"}
                                  onChange={(event) => setVariantDraft((current) => ({ ...current, color: event.target.value }))}
                                  className="mt-2 h-8 w-full cursor-pointer rounded-[8px] border border-black/10 bg-transparent p-0"
                                  aria-label="Pick variant color"
                                />
                              </div>
                            </div>
                          </label>
                        </div>
                      ) : (
                        <div className="rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-3 py-2 text-[11px] text-[#57636c]">
                          Leave this off if the variant does not come in different colors.
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[12px] font-semibold text-[#202020]">Variant images</p>
                          <p className="text-[11px] leading-[1.4] text-[#57636c]">Upload one or more images for this variant.</p>
                        </div>
                      </div>
                      <input
                        ref={variantUploadInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          void uploadVariantFiles(event.target.files ?? []);
                        }}
                      />
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => variantUploadInputRef.current?.click()}
                          disabled={uploadingVariantImages}
                          className="flex h-[150px] w-[150px] shrink-0 flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-[#d7d7d7] bg-[#fafafa] text-center text-[#57636c] transition-colors hover:border-[#cbb26b] hover:bg-[#fffaf0] hover:text-[#907d4c] disabled:cursor-wait disabled:border-[#cbb26b] disabled:bg-[rgba(203,178,107,0.12)] disabled:text-[#907d4c] disabled:opacity-100"
                        >
                          {uploadingVariantImages ? (
                            <>
                              <SpinnerIcon className="h-5 w-5 animate-spin text-[#907d4c]" />
                              <span className="text-[12px] font-semibold">Uploading...</span>
                            </>
                          ) : (
                            <>
                              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[22px] leading-none text-[#202020] shadow-[0_4px_12px_rgba(20,24,27,0.08)]">
                                +
                              </span>
                              <span className="text-[12px] font-semibold">Upload images</span>
                              <span className="max-w-[110px] text-[10px] leading-[1.4]">Click to add variant photos</span>
                            </>
                          )}
                        </button>
                        {variantImages.map((image, index) => (
                          <ProductImageCard
                            key={`${image.fileName}-${index}`}
                            image={image}
                            index={index}
                            onMove={moveVariantImage}
                            onDropImage={reorderVariantImages}
                            onRemove={removeVariantImageAt}
                            onAltChange={updateVariantImageAltText}
                            onDragStartImage={beginDragVariantImage}
                            onDragEndImage={endDragVariantImage}
                            onDragEnterImage={hoverDragVariantImage}
                            canMoveUp={index > 0}
                            canMoveDown={index < variantImages.length - 1}
                            isDragging={draggedVariantImageIndex === index}
                            isDropTarget={dropTargetVariantImageIndex === index && draggedVariantImageIndex !== null && draggedVariantImageIndex !== index}
                          />
                        ))}
                      </div>
                    </div>
                    {isApparelProductDraft ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Pack count</span>
                          <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                          <input
                            type="number"
                            min="1"
                            value={variantDraft.unitCount}
                            onChange={(event) => setVariantDraft((current) => ({ ...current, unitCount: event.target.value }))}
                            className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Clothing size <span className="text-[#d11c1c]">*</span></span>
                          <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,160px)_1fr]">
                            <select
                              value={APPAREL_SIZE_OPTIONS.includes(variantDraft.size) ? variantDraft.size : (variantDraft.size ? "Custom" : "")}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setVariantDraft((current) => ({
                                  ...current,
                                  size: nextValue === "Custom" ? current.size : nextValue,
                                }));
                              }}
                              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                            >
                              <option value="">Select size</option>
                              {APPAREL_SIZE_OPTIONS.map((sizeOption) => (
                                <option key={sizeOption} value={sizeOption}>
                                  {sizeOption}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={variantDraft.size}
                              onChange={(event) => setVariantDraft((current) => ({ ...current, size: event.target.value }))}
                              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                              placeholder="Custom size or fit note"
                            />
                          </div>
                          <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                            Use standard sizes like S, M, L, XL or add the exact fit note you want shoppers to see.
                          </p>
                        </label>
                      </div>
                    ) : isBeautyProductDraft ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Pack count</span>
                            <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                            <input
                              type="number"
                              min="1"
                              value={variantDraft.unitCount}
                              onChange={(event) => setVariantDraft((current) => ({ ...current, unitCount: event.target.value }))}
                              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Volume</span>
                            <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                            <input
                              type="number"
                              min="0"
                              value={variantDraft.volume}
                              onChange={(event) => setVariantDraft((current) => ({ ...current, volume: event.target.value }))}
                              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Unit</span>
                            <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                            <select
                              value={variantDraft.volumeUnit}
                              onChange={(event) => setVariantDraft((current) => ({ ...current, volumeUnit: event.target.value }))}
                              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                            >
                              {VOLUME_UNITS.map((unit) => (
                                <option key={unit} value={unit}>
                                  {unit}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {isCosmeticsProductDraft ? (
                            <label className="block">
                              <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Shade</span>
                              <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                              <div className="grid gap-2 sm:grid-cols-[minmax(0,170px)_1fr]">
                                <select
                                  value={BEAUTY_SHADE_OPTIONS.includes(variantDraft.shade) ? variantDraft.shade : (variantDraft.shade ? "Custom" : "")}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    setVariantDraft((current) => ({
                                      ...current,
                                      shade: nextValue === "Custom" ? current.shade : nextValue,
                                    }));
                                  }}
                                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                                >
                                  <option value="">Select shade</option>
                                  {BEAUTY_SHADE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={variantDraft.shade}
                                  onChange={(event) => setVariantDraft((current) => ({ ...current, shade: event.target.value }))}
                                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                                  placeholder="Custom shade or finish note"
                                />
                              </div>
                            </label>
                          ) : null}
                          {isFragranceProductDraft || !isCosmeticsProductDraft ? (
                            <label className="block">
                              <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Scent</span>
                              <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                              <div className="grid gap-2 sm:grid-cols-[minmax(0,170px)_1fr]">
                                <select
                                  value={BEAUTY_SCENT_OPTIONS.includes(variantDraft.scent) ? variantDraft.scent : (variantDraft.scent ? "Custom" : "")}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    setVariantDraft((current) => ({
                                      ...current,
                                      scent: nextValue === "Custom" ? current.scent : nextValue,
                                    }));
                                  }}
                                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                                >
                                  <option value="">Select scent</option>
                                  {BEAUTY_SCENT_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={variantDraft.scent}
                                  onChange={(event) => setVariantDraft((current) => ({ ...current, scent: event.target.value }))}
                                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                                  placeholder="Fragrance family or scent note"
                                />
                              </div>
                            </label>
                          ) : null}
                          {isSkinCareProductDraft ? (
                            <label className="block">
                              <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Skin type</span>
                              <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                              <div className="grid gap-2 sm:grid-cols-[minmax(0,170px)_1fr]">
                                <select
                                  value={BEAUTY_SKIN_TYPE_OPTIONS.includes(variantDraft.skinType) ? variantDraft.skinType : (variantDraft.skinType ? "Custom" : "")}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    setVariantDraft((current) => ({
                                      ...current,
                                      skinType: nextValue === "Custom" ? current.skinType : nextValue,
                                    }));
                                  }}
                                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                                >
                                  <option value="">Select skin type</option>
                                  {BEAUTY_SKIN_TYPE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={variantDraft.skinType}
                                  onChange={(event) => setVariantDraft((current) => ({ ...current, skinType: event.target.value }))}
                                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                                  placeholder="Custom skin type note"
                                />
                              </div>
                            </label>
                          ) : null}
                          {isHairCareProductDraft ? (
                            <label className="block">
                              <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Hair type</span>
                              <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                              <div className="grid gap-2 sm:grid-cols-[minmax(0,170px)_1fr]">
                                <select
                                  value={BEAUTY_HAIR_TYPE_OPTIONS.includes(variantDraft.hairType) ? variantDraft.hairType : (variantDraft.hairType ? "Custom" : "")}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    setVariantDraft((current) => ({
                                      ...current,
                                      hairType: nextValue === "Custom" ? current.hairType : nextValue,
                                    }));
                                  }}
                                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                                >
                                  <option value="">Select hair type</option>
                                  {BEAUTY_HAIR_TYPE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={variantDraft.hairType}
                                  onChange={(event) => setVariantDraft((current) => ({ ...current, hairType: event.target.value }))}
                                  className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                                  placeholder="Custom hair type note"
                                />
                              </div>
                            </label>
                          ) : null}
                        </div>
                        <p className="text-[11px] leading-[1.4] text-[#57636c]">
                          Piessang keeps the logistics clean while still showing beauty-specific details like shade, scent, and skin or hair fit on the variant.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Pack count</span>
                          <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                          <input
                            type="number"
                            min="1"
                            value={variantDraft.unitCount}
                            onChange={(event) => setVariantDraft((current) => ({ ...current, unitCount: event.target.value }))}
                            className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Volume</span>
                          <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                          <input
                            type="number"
                            min="0"
                            value={variantDraft.volume}
                            onChange={(event) => setVariantDraft((current) => ({ ...current, volume: event.target.value }))}
                            className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Unit</span>
                          <ChangeImpactHint mode="review" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                          <select
                            value={variantDraft.volumeUnit}
                            onChange={(event) => setVariantDraft((current) => ({ ...current, volumeUnit: event.target.value }))}
                            className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                          >
                            {VOLUME_UNITS.map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                    {fulfillmentMode === "seller" && sellerWeightBasedShippingRequired ? (
                      <div className="rounded-[8px] border border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.08)] px-3 py-3 text-[11px] text-[#7c2d12]">
                        <p className="font-semibold text-[#b45309]">Per-kg shipping is active</p>
                        <p className="mt-1 leading-[1.5]">
                          Every variant on this listing needs a weight so Piessang can calculate country shipping correctly. If a product is missing variant weights and you do not offer local delivery as a fallback, that listing will stay hidden from the storefront until the weights are completed.
                        </p>
                      </div>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Selling price incl <span className="text-[#d11c1c]">*</span></span>
                        <ChangeImpactHint mode="live" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={variantDraft.sellingPriceIncl}
                          onChange={(event) => setVariantDraft((current) => ({ ...current, sellingPriceIncl: event.target.value }))}
                          className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                          placeholder="0.00"
                        />
                      </label>
                      <div className="rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Sale</p>
                            <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">Use a percentage discount only.</p>
                          </div>
                          <label className="inline-flex items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] text-[#202020]">
                            <input
                              type="checkbox"
                              checked={variantDraft.isOnSale}
                              onChange={(event) => setVariantDraft((current) => ({ ...current, isOnSale: event.target.checked }))}
                            />
                            On sale
                          </label>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <div className="mb-1 flex items-center gap-1.5">
                              <span className="block text-[11px] font-semibold text-[#202020]">Discount %</span>
                              <HelpTip label="Sale discount help">
                                This is the percentage discount off the selling price incl. It is separate from the success fee.
                              </HelpTip>
                            </div>
                            <ChangeImpactHint mode="live" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                            <input
                              type="number"
                              min="1"
                              max="100"
                              step="1"
                              value={variantDraft.saleDiscountPercent}
                              onChange={(event) => setVariantDraft((current) => ({ ...current, saleDiscountPercent: event.target.value }))}
                              disabled={!variantDraft.isOnSale}
                              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b] disabled:bg-[#f7f7f7] disabled:text-[#9aa3af]"
                              placeholder="10"
                            />
                          </label>
                          <div className="rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-2 text-[11px] text-[#57636c]">
                            {variantDraft.isOnSale && variantSaleDiscountPercent > 0 ? (
                                <>
                                Sale price incl:{" "}
                                <strong className="text-[#202020]">
                                  R {variantSalePreviewIncl.toFixed(2)}
                                </strong>
                              </>
                            ) : (
                              "Set a discount percentage to calculate the sale price."
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Inventory tracking</p>
                          <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                            {inventoryTrackingRequired
                              ? "Piessang fulfilment keeps inventory managed by Piessang after approval. You can still submit this draft now."
                              : inventoryTracking
                                ? "Add opening stock for this variant."
                                : "Enable inventory tracking above to set stock for variants."}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            inventoryTrackingRequired ? "bg-[rgba(99,102,241,0.12)] text-[#4f46e5]" : inventoryTrackingEnabled ? "bg-[rgba(26,133,83,0.12)] text-[#166534]" : "bg-[rgba(148,163,184,0.14)] text-[#475569]"
                          }`}
                        >
                          {inventoryTrackingRequired ? "Managed by Piessang" : inventoryTrackingEnabled ? "Available" : "Off"}
                        </span>
                      </div>
                      {!inventoryTrackingRequired && inventoryTrackingEnabled ? (
                        <div className="mt-3 grid gap-3">
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-semibold text-[#202020]">
                              Starting stock <span className="text-[#d11c1c]">*</span>
                            </span>
                            <ChangeImpactHint mode="live" hasSavedProduct={Boolean(activeProductId)} className="mb-1" />
                            <input
                              type="number"
                              min="0"
                              value={variantDraft.inventoryQty}
                              onChange={(event) =>
                                setVariantDraft((current) => ({ ...current, inventoryQty: event.target.value }))
                              }
                              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px] outline-none focus:border-[#cbb26b]"
                              placeholder="0"
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-2 text-[11px] text-[#57636c]">
                          {inventoryTrackingRequired
                            ? "Piessang stock will be booked in by Piessang after approval. The product will publish once warehouse stock is received."
                            : "Stock fields appear here once inventory tracking is enabled."}
                        </div>
                      )}
                    </div>
                    <div className="rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Estimated fees</p>
                          <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                            {fulfillmentMode === "seller"
                              ? "Self-fulfilment only shows the success fee."
                              : variantFeePreviewReady
                                ? "Fill in the logistics details to calculate fulfilment, handling and storage fees."
                                : "Enter a selling price and the required logistics details to preview fees."}
                          </p>
                        </div>
                        {variantFeePreviewReady && variantFeeSnapshot ? (
                          <span className="rounded-full bg-[rgba(26,133,83,0.12)] px-2.5 py-1 text-[11px] font-semibold text-[#166534]">
                            Ready
                          </span>
                        ) : (
                          <span className="rounded-full bg-[rgba(148,163,184,0.14)] px-2.5 py-1 text-[11px] font-semibold text-[#475569]">
                            Pending
                          </span>
                        )}
                      </div>
                      {variantFeePreviewReady && variantFeeSnapshot ? (
                        fulfillmentMode === "seller" ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-[8px] border border-black/5 bg-white px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Success fee</p>
                              <p className="mt-1 text-[12px] font-semibold text-[#202020]">
                                R {variantFeeSnapshot.successFeeIncl.toFixed(2)}{" "}
                                <span className="text-[11px] font-normal text-[#57636c]">
                                  ({variantFeeSnapshot.successFeePercent.toFixed(1)}%)
                                </span>
                              </p>
                              <p className="mt-1 text-[10px] text-[#57636c]">VAT inclusive</p>
                            </div>
                            <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-3 py-2 sm:col-span-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a8553]">Total estimated fees</p>
                              <p className="mt-1 text-[12px] font-semibold text-[#166534]">
                                R {variantFeeSnapshot.totalFeesIncl.toFixed(2)}
                              </p>
                              <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                                Only the success fee applies while you fulfil this variant yourself.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-[8px] border border-black/5 bg-white px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Success fee</p>
                              <p className="mt-1 text-[12px] font-semibold text-[#202020]">
                                R {variantFeeSnapshot.successFeeIncl.toFixed(2)}{" "}
                                <span className="text-[11px] font-normal text-[#57636c]">
                                  ({variantFeeSnapshot.successFeePercent.toFixed(1)}%)
                                </span>
                              </p>
                              <p className="mt-1 text-[10px] text-[#57636c]">VAT inclusive</p>
                            </div>
                            <div className="rounded-[8px] border border-black/5 bg-white px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Fulfilment fee</p>
                              <p className="mt-1 text-[12px] font-semibold text-[#202020]">
                                R {(variantFeeSnapshot.fulfilmentFeeExclVat ?? variantFeeSnapshot.fulfilmentFeeIncl ?? 0).toFixed(2)}
                              </p>
                              <p className="mt-1 text-[10px] text-[#57636c]">VAT exclusive</p>
                            </div>
                            <div className="rounded-[8px] border border-black/5 bg-white px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#907d4c]">Storage fee</p>
                              <p className="mt-1 text-[12px] font-semibold text-[#202020]">
                                R {(variantFeeSnapshot.storageFeeExclVat ?? variantFeeSnapshot.storageFeeIncl ?? 0).toFixed(2)}
                              </p>
                              <p className="mt-1 text-[10px] text-[#57636c]">VAT exclusive</p>
                            </div>
                            <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-3 py-2 sm:col-span-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a8553]">Total estimated fees</p>
                              <p className="mt-1 text-[12px] font-semibold text-[#166534]">
                                R {variantFeeSnapshot.totalFeesIncl.toFixed(2)}
                              </p>
                              <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
                                Calculated from the {String(variantFeeSnapshot.sizeBand || "selected").toLowerCase()} size band, {variantFeeSnapshot.weightBand} weight band and warehouse stock cover.
                              </p>
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="mt-3 rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-2 text-[11px] text-[#57636c]">
                          {fulfillmentMode === "bevgo" && !variantLogisticsReady
                            ? "Add the required logistics metadata to preview fulfilment, handling and storage fees."
                            : "Enter a selling price to preview this variant’s fee breakdown."}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      {continueSellingAvailable ? (
                        <label className="flex items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] text-[#202020]">
                          <input
                            type="checkbox"
                            checked={variantDraft.continueSellingOutOfStock}
                            onChange={(event) =>
                              setVariantDraft((current) => ({ ...current, continueSellingOutOfStock: event.target.checked }))
                            }
                          />
                          Continue selling when out of stock
                        </label>
                      ) : (
                        <div className="rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-2 text-[11px] text-[#57636c]">
                          Continue selling when out of stock is only available for self-fulfilment without inventory tracking.
                        </div>
                      )}
                      <label className="flex items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] text-[#202020]">
                        <input
                          type="checkbox"
                          checked={variantDraft.isDefault}
                          onChange={(event) => setVariantDraft((current) => ({ ...current, isDefault: event.target.checked }))}
                        />
                        Make this the default variant
                      </label>
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => resetVariantDraft()}
                        className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-4 text-[12px] font-semibold text-[#202020]"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => void addVariant()}
                        disabled={!variantDraft.label.trim()}
                        className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[#202020] px-4 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {editingVariantIndex !== null ? "Update variant" : "Add variant"}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 space-y-2">
                  {variantItems.length ? (
                    variantItems.map((variant, index) => (
                      <div key={`${variant.variant_id ?? index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-black/5 bg-white px-3 py-2">
                        <div>
                          <p className="text-[13px] font-semibold text-[#202020]">{variant.label || "Untitled variant"}</p>
                          <p className="mt-1 text-[11px] text-[#57636c]">
                            {variant.variant_id ? `Code ${variant.variant_id}` : "No code"}
                          </p>
                          <p className="mt-1 text-[11px] text-[#57636c]">
                            {variant.color ? `Color ${variant.color}` : "No color"}
                            {String((variant as any)?.size ?? "").trim() ? ` • Size ${String((variant as any).size).trim()}` : ""}
                            {String((variant as any)?.shade ?? "").trim() ? ` • Shade ${String((variant as any).shade).trim()}` : ""}
                            {String((variant as any)?.scent ?? "").trim() ? ` • ${String((variant as any).scent).trim()}` : ""}
                            {String((variant as any)?.skinType ?? "").trim() ? ` • ${String((variant as any).skinType).trim()} skin` : ""}
                            {String((variant as any)?.hairType ?? "").trim() ? ` • ${String((variant as any).hairType).trim()} hair` : ""}
                            {String((variant as any)?.flavor ?? "").trim() ? ` • ${String((variant as any).flavor).trim()}` : ""}
                            {String((variant as any)?.abv ?? "").trim() ? ` • ${String((variant as any).abv).trim()}% ABV` : ""}
                            {String((variant as any)?.storageCapacity ?? "").trim() ? ` • ${String((variant as any).storageCapacity).trim()}` : ""}
                            {String((variant as any)?.memoryRam ?? "").trim() ? ` • ${String((variant as any).memoryRam).trim()} RAM` : ""}
                            {String((variant as any)?.connectivity ?? "").trim() ? ` • ${String((variant as any).connectivity).trim()}` : ""}
                            {String((variant as any)?.compatibility ?? "").trim() ? ` • ${String((variant as any).compatibility).trim()}` : ""}
                            {String((variant as any)?.sizeSystem ?? "").trim() ? ` • ${String((variant as any).sizeSystem).trim()}` : ""}
                            {String((variant as any)?.material ?? "").trim() ? ` • ${String((variant as any).material).trim()}` : ""}
                            {String((variant as any)?.ringSize ?? "").trim() ? ` • Ring ${String((variant as any).ringSize).trim()}` : ""}
                            {String((variant as any)?.strapLength ?? "").trim() ? ` • ${String((variant as any).strapLength).trim()}` : ""}
                            {String((variant as any)?.bookFormat ?? "").trim() ? ` • ${String((variant as any).bookFormat).trim()}` : ""}
                            {String((variant as any)?.language ?? "").trim() ? ` • ${String((variant as any).language).trim()}` : ""}
                            {String((variant as any)?.ageRange ?? "").trim() ? ` • ${String((variant as any).ageRange).trim()}` : ""}
                            {String((variant as any)?.modelFitment ?? "").trim() ? ` • ${String((variant as any).modelFitment).trim()}` : ""}
                            {!String((variant as any)?.size ?? "").trim() && variant.pack?.volume_unit ? ` • ${variant.pack.volume_unit}` : ""}
                            {Array.isArray(variant.media?.images) && variant.media.images.length > 0
                              ? ` • ${variant.media.images.length} image${variant.media.images.length === 1 ? "" : "s"}`
                              : ""}
                            {variantPriceIncl(variant) > 0 ? ` • R ${variantPriceIncl(variant).toFixed(2)} incl` : ""}
                            {variant.sale?.is_on_sale && Number(variant.sale?.discount_percent ?? 0) > 0
                              ? ` • Sale ${Number(variant.sale?.discount_percent ?? 0).toFixed(0)}% to R ${variantSalePriceIncl(variant).toFixed(2)}`
                              : ""}
                          </p>
                          <p className="mt-1 text-[11px] text-[#57636c]">
                            {Array.isArray((variant as any)?.inventory) && (variant as any).inventory.length > 0
                              ? `${(variant as any).inventory[0]?.in_stock_qty ?? 0} in stock`
                              : "Inventory not tracked"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {variant.placement?.is_default ? (
                            <span className="rounded-full bg-[rgba(57,169,107,0.12)] px-2.5 py-1 text-[11px] font-semibold text-[#166534]">
                              Default
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => loadVariantIntoForm(variant, index)}
                            className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#202020]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeVariant(String(variant.variant_id ?? ""))}
                            className="inline-flex h-8 items-center rounded-[8px] border border-black/10 bg-white px-3 text-[11px] font-semibold text-[#b91c1c]"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[8px] border border-dashed border-black/10 bg-white px-3 py-3 text-[12px] text-[#57636c]">
                      No variants added yet.
                    </div>
                  )}
                </div>
              </section>

              {message ? (
                <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">
                  {message}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">
                  {error}
                </div>
              ) : null}

            </div>
          </div>
      </section>
        </div>

        <aside className={["space-y-4 xl:sticky", embeddedMode ? "xl:top-6" : "xl:top-4"].join(" ")}>
          <div className="hidden xl:block">
            {renderSidebarSummary()}
          </div>

          {fulfillmentMode === "bevgo" && activeProductId ? (
            <section className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Inbound booking</p>
                <h3 className="mt-2 text-[16px] font-semibold text-[#202020]">Book your delivery to Piessang</h3>
                <p className="mt-1 text-[12px] leading-[1.5] text-[#57636c]">
                  Tell Piessang when stock will arrive and how many units of each barcode-matched variant to expect.
                </p>
                <div className="mt-3 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Delivery date</span>
                    <input
                      type="date"
                      value={inboundDeliveryDate}
                      onChange={(event) => setInboundDeliveryDate(event.target.value)}
                      className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px]"
                    />
                  </label>
                  <div className="space-y-2">
                    {variantItems.map((variant) => {
                      const variantId = String(variant?.variant_id ?? "").trim();
                      return (
                        <div key={variantId} className="rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold text-[#202020]">{variant?.label || variantId}</p>
                              <p className="mt-0.5 text-[11px] text-[#57636c]">Barcode: {String(variant?.barcode ?? "Missing") || "Missing"}</p>
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={inboundQuantities[variantId] ?? ""}
                              onChange={(event) =>
                                setInboundQuantities((current) => ({
                                  ...current,
                                  [variantId]: event.target.value,
                                }))
                              }
                              className="w-[100px] rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px]"
                              placeholder="Qty"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Notes</span>
                    <textarea
                      value={inboundNotes}
                      onChange={(event) => setInboundNotes(event.target.value)}
                      rows={3}
                      className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px]"
                      placeholder="Optional receiving notes"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void saveInboundBooking()}
                    disabled={savingInboundBooking}
                    className="inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingInboundBooking ? "Saving..." : "Save inbound booking"}
                  </button>
                  <div className="space-y-2">
                    {loadingInboundBookings ? (
                      <p className="text-[11px] text-[#57636c]">Loading inbound bookings...</p>
                    ) : inboundBookings.length ? (
                      inboundBookings.map((booking) => (
                        <div key={String(booking?.id || booking?.bookingId)} className="rounded-[8px] border border-black/5 bg-[#fafafa] px-3 py-2 text-[11px] text-[#57636c]">
                          <p className="font-semibold text-[#202020]">{String(booking?.deliveryDate || "No date")}</p>
                          <p className="mt-1">
                            {(Array.isArray(booking?.variants) ? booking.variants : [])
                              .map((item: any) => `${item.label || item.variantId}: ${item.quantity}`)
                              .join(" • ")}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-[#57636c]">No inbound bookings saved yet.</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-[8px] bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Stock upliftment</p>
                <h3 className="mt-2 text-[16px] font-semibold text-[#202020]">Book stock upliftment from Piessang</h3>
                <p className="mt-1 text-[12px] leading-[1.5] text-[#57636c]">
                  Tell Piessang when stock must be prepared for upliftment and how many units of each barcode-matched variant must be released.
                </p>
                <div className="mt-3 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Uplift date</span>
                    <input
                      type="date"
                      value={upliftDate}
                      onChange={(event) => setUpliftDate(event.target.value)}
                      className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Reason</span>
                    <input
                      type="text"
                      value={upliftReason}
                      onChange={(event) => setUpliftReason(event.target.value)}
                      className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px]"
                      placeholder="Optional reason for upliftment"
                    />
                  </label>
                  <div className="space-y-2">
                    {variantItems.map((variant) => {
                      const variantId = String(variant?.variant_id ?? "").trim();
                      return (
                        <div key={variantId} className="rounded-[8px] border border-black/5 bg-[#fafafa] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold text-[#202020]">{variant?.label || variantId}</p>
                              <p className="mt-0.5 text-[11px] text-[#57636c]">Barcode: {String(variant?.barcode ?? "Missing") || "Missing"}</p>
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={upliftQuantities[variantId] ?? ""}
                              onChange={(event) =>
                                setUpliftQuantities((current) => ({
                                  ...current,
                                  [variantId]: event.target.value,
                                }))
                              }
                              className="w-[100px] rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px]"
                              placeholder="Qty"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Notes</span>
                    <textarea
                      value={upliftNotes}
                      onChange={(event) => setUpliftNotes(event.target.value)}
                      rows={3}
                      className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[12px]"
                      placeholder="Optional upliftment notes"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void saveStockUpliftment()}
                    disabled={savingStockUpliftment}
                    className="inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingStockUpliftment ? "Saving..." : "Save stock upliftment"}
                  </button>
                  <div className="space-y-2">
                    {loadingStockUpliftments ? (
                      <p className="text-[11px] text-[#57636c]">Loading stock upliftments...</p>
                    ) : stockUpliftments.length ? (
                      stockUpliftments.map((upliftment) => (
                        <div key={String(upliftment?.id || upliftment?.upliftmentId)} className="rounded-[8px] border border-black/5 bg-[#fafafa] px-3 py-2 text-[11px] text-[#57636c]">
                          <p className="font-semibold text-[#202020]">{String(upliftment?.upliftDate || "No date")}</p>
                          <p className="mt-1">
                            {(Array.isArray(upliftment?.variants) ? upliftment.variants : [])
                              .map((item: any) => `${item.label || item.variantId}: ${item.quantity}`)
                              .join(" • ")}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-[#57636c]">No stock upliftments saved yet.</p>
                    )}
                  </div>
                </div>
              </section>
            </section>
          ) : null}

          <div className="hidden xl:block">
            {renderPublishingChecklist()}
          </div>
        </aside>
      </div>
      )}

      {activeProcessLabel ? (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
          <div className="inline-flex items-center gap-2 rounded-[8px] border border-black/10 bg-white px-4 py-2 text-[12px] text-[#202020] shadow-[0_12px_30px_rgba(20,24,27,0.14)]">
            <SpinnerIcon className="h-4 w-4 animate-spin text-[#907d4c]" />
            <span className="font-medium">{activeProcessLabel}</span>
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-24 right-4 z-40 hidden sm:block xl:hidden">
        <button
          type="button"
          onClick={() => setShowSidebarSummaryDrawer(true)}
          className="inline-flex items-center gap-3 rounded-full border border-black/10 bg-white px-4 py-3 text-left shadow-[0_12px_30px_rgba(20,24,27,0.14)] transition-all hover:translate-y-[-1px]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(144,125,76,0.12)] text-[#907d4c]">
            <EyeIcon className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-[12px] font-semibold text-[#202020]">Product summary</span>
            <span className="mt-0.5 block text-[11px] text-[#57636c]">Organization, fulfilment and fees</span>
          </span>
        </button>
      </div>

      <div className="fixed bottom-4 right-4 z-40 hidden sm:block xl:hidden">
        <button
          type="button"
          onClick={() => setShowPublishDrawer(true)}
          className={[
            "inline-flex items-center gap-3 rounded-full border border-black/10 bg-white px-4 py-3 text-left shadow-[0_12px_30px_rgba(20,24,27,0.14)] transition-all",
            publishChecklistPulse ? "scale-[1.04] border-[#1a8553]/30 shadow-[0_16px_34px_rgba(26,133,83,0.18)]" : "",
          ].join(" ")}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(26,133,83,0.12)] text-[#1a8553]">
            <CheckIcon className={`h-5 w-5 ${publishChecklistPulse ? "animate-bounce" : ""}`} />
          </span>
          <span>
            <span className="block text-[12px] font-semibold text-[#202020]">Publishing checklist</span>
            <span className="mt-0.5 block text-[11px] text-[#57636c]">
              {readyRequirementCount}/{publishRequirements.length} done
            </span>
          </span>
        </button>
      </div>

      <div className="fixed bottom-4 right-4 z-40 sm:hidden">
        <button
          type="button"
          onClick={() => setShowMobileToolsDrawer(true)}
          className={[
            "inline-flex items-center gap-3 rounded-full border border-black/10 bg-white px-4 py-3 text-left shadow-[0_12px_30px_rgba(20,24,27,0.14)] transition-all",
            publishChecklistPulse ? "scale-[1.04] border-[#1a8553]/30 shadow-[0_16px_34px_rgba(26,133,83,0.18)]" : "",
          ].join(" ")}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(144,125,76,0.12)] text-[#907d4c]">
            <EyeIcon className={`h-5 w-5 ${publishChecklistPulse ? "animate-bounce" : ""}`} />
          </span>
          <span>
            <span className="block text-[12px] font-semibold text-[#202020]">Product tools</span>
            <span className="mt-0.5 block text-[11px] text-[#57636c]">
              {readyRequirementCount}/{publishRequirements.length} checks done
            </span>
          </span>
        </button>
      </div>

      {showMobileToolsDrawer ? (
        <div className="fixed inset-0 z-50 sm:hidden">
          <button
            type="button"
            aria-label="Close product tools"
            className="absolute inset-0 bg-black/35"
            onClick={() => setShowMobileToolsDrawer(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-full overflow-y-auto bg-[#f6f3ee] p-4 shadow-[-18px_0_50px_rgba(20,24,27,0.22)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Product tools</p>
                <p className="mt-1 text-[12px] text-[#57636c]">Status, summary and publishing requirements in one place.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileToolsDrawer(false)}
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
              >
                Close
              </button>
            </div>
            <div className="space-y-4">
              {renderSidebarSummary()}
              {renderPublishingChecklist()}
            </div>
          </aside>
        </div>
      ) : null}

      {showSidebarSummaryDrawer ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="Close product summary"
            className="absolute inset-0 bg-black/35"
            onClick={() => setShowSidebarSummaryDrawer(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-[420px] overflow-y-auto bg-[#f6f3ee] p-4 shadow-[-18px_0_50px_rgba(20,24,27,0.22)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Product summary</p>
                <p className="mt-1 text-[12px] text-[#57636c]">Quick access to the details normally shown in the right-hand column.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSidebarSummaryDrawer(false)}
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
              >
                Close
              </button>
            </div>
            <div className="space-y-4">
              {renderSidebarSummary()}
            </div>
          </aside>
        </div>
      ) : null}

      {showPublishDrawer ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="Close publishing checklist"
            className="absolute inset-0 bg-black/35"
            onClick={() => setShowPublishDrawer(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-[420px] overflow-y-auto bg-[#f6f3ee] p-4 shadow-[-18px_0_50px_rgba(20,24,27,0.22)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Publishing</p>
                <p className="mt-1 text-[12px] text-[#57636c]">Track what is still needed before this product can go live.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPublishDrawer(false)}
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
              >
                Close
              </button>
            </div>
            {renderPublishingChecklist()}
          </aside>
        </div>
      ) : null}

      <ConfirmModal
        open={showDeleteModal}
        eyebrow="Delete product"
        title="Are you sure?"
        description="This will permanently remove the draft and any saved variants from your catalogue."
        confirmLabel={submitting ? "Deleting..." : "Delete"}
        busy={submitting}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => void confirmDeleteProduct()}
      />

      {showDraftImpactModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => closeDraftImpactModal(false)}
        >
          <div
            className="w-full max-w-md rounded-[8px] bg-white p-5 shadow-[0_18px_50px_rgba(20,24,27,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">
              Review impact
            </p>
            <h3 className="mt-2 text-[18px] font-semibold text-[#202020]">{draftImpactModalTitle}</h3>
            <p className="mt-2 text-[13px] leading-[1.55] text-[#57636c]">
              {draftImpactModalMessage} Continue?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => closeDraftImpactModal(false)}
                className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => closeDraftImpactModal(true)}
                className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showFulfillmentChangeModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowFulfillmentChangeModal(false)}
        >
          <div
            className="w-full max-w-md rounded-[8px] bg-white p-5 shadow-[0_18px_50px_rgba(20,24,27,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Request fulfilment change</p>
            <h3 className="mt-2 text-[18px] font-semibold text-[#202020]">Update fulfilment after review</h3>
            <p className="mt-2 text-[13px] leading-[1.55] text-[#57636c]">
              Tell Piessang why the fulfilment should change from {fulfillmentMode === "seller" ? "self fulfilment to Piessang fulfilment" : "Piessang fulfilment to self fulfilment"}.
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-[11px] font-semibold text-[#202020]">Reason</span>
              <textarea
                value={fulfillmentChangeNote}
                onChange={(event) => setFulfillmentChangeNote(event.target.value)}
                rows={4}
                className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[13px] outline-none focus:border-[#cbb26b]"
                placeholder="Optional note for the Piessang review team"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowFulfillmentChangeModal(false);
                  setFulfillmentChangeNote("");
                }}
                className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void requestFulfillmentChange()}
                disabled={submitting}
                className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Requesting..." : "Request change"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showErrorDialog && error ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setShowErrorDialog(false);
            setError(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-[8px] bg-white p-5 shadow-[0_18px_50px_rgba(20,24,27,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d11c1c]">Something went wrong</p>
            <p className="mt-2 text-[14px] leading-[1.55] text-[#202020]">{error}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowErrorDialog(false);
                  setError(null);
                }}
                className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageBody>
  );
}
