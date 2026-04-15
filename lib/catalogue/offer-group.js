import { variantCanContinueSellingOutOfStock, variantTotalInStockItemsAvailable } from "@/lib/catalogue/availability";

function normStr(value) {
  return String(value ?? "").trim();
}

function normBarcode(value) {
  return normStr(value).toUpperCase();
}

function getVariantPriceIncl(variant) {
  if (!variant || typeof variant !== "object") return null;
  if (variant?.sale?.is_on_sale === true && Number.isFinite(Number(variant?.sale?.sale_price_incl))) {
    return Number(variant.sale.sale_price_incl);
  }
  if (Number.isFinite(Number(variant?.pricing?.selling_price_incl))) {
    return Number(variant.pricing.selling_price_incl);
  }
  if (variant?.sale?.is_on_sale === true && Number.isFinite(Number(variant?.sale?.sale_price_excl))) {
    return Number(variant.sale.sale_price_excl) * 1.15;
  }
  if (Number.isFinite(Number(variant?.pricing?.selling_price_excl))) {
    return Number(variant.pricing.selling_price_excl) * 1.15;
  }
  return null;
}

function getVariantStockScore(variant) {
  const total = Number(
    variant?.total_in_stock_items_available ?? variantTotalInStockItemsAvailable(variant),
  );
  if (Number.isFinite(total) && total > 0) return 2;
  if (variantCanContinueSellingOutOfStock(variant)) return 1;
  return 0;
}

export function pickPrimaryOfferVariant(variants) {
  const list = Array.isArray(variants) ? variants.filter((variant) => variant && typeof variant === "object") : [];
  if (!list.length) return null;

  return (
    [...list]
      .map((variant) => ({
        variant,
        stockScore: getVariantStockScore(variant),
        priceIncl: getVariantPriceIncl(variant),
        isDefault: variant?.placement?.is_default === true ? 1 : 0,
      }))
      .sort((a, b) => {
        if (b.stockScore !== a.stockScore) return b.stockScore - a.stockScore;
        const aPrice = Number.isFinite(a.priceIncl) ? a.priceIncl : Number.POSITIVE_INFINITY;
        const bPrice = Number.isFinite(b.priceIncl) ? b.priceIncl : Number.POSITIVE_INFINITY;
        if (aPrice !== bPrice) return aPrice - bPrice;
        if (b.isDefault !== a.isDefault) return b.isDefault - a.isDefault;
        return 0;
      })[0]?.variant ?? list[0]
  );
}

export function getCanonicalOfferBarcode(variants) {
  const primary = pickPrimaryOfferVariant(variants);
  if (primary) {
    const barcode = normBarcode(primary?.barcode);
    if (barcode) return barcode;
  }
  const list = Array.isArray(variants) ? variants : [];
  return list.map((variant) => normBarcode(variant?.barcode)).find(Boolean) || "";
}

export function buildOfferGroupMetadata({ sellerCode, variants }) {
  const canonicalBarcode = getCanonicalOfferBarcode(variants);
  return {
    canonical_offer_barcode: canonicalBarcode || null,
    offer_group_key: canonicalBarcode ? `barcode:${canonicalBarcode}` : null,
    seller_offer_key:
      canonicalBarcode && normStr(sellerCode)
        ? `${normStr(sellerCode).toUpperCase()}::${canonicalBarcode}`
        : null,
  };
}
