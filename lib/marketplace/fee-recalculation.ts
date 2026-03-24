import type { Firestore } from "firebase-admin/firestore";
import {
  buildMarketplaceFeeSnapshot,
  describeMarketplaceFeeRule,
  estimateMarketplaceSuccessFeePercent,
  normalizeMarketplaceVariantLogistics,
  resolveMarketplaceSuccessFeeRule,
} from "@/lib/marketplace/fees";
import { loadMarketplaceFeeConfig } from "@/lib/marketplace/fees-store";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value: unknown, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function getVariantInventoryTotal(variant: Record<string, any>) {
  const rows = Array.isArray(variant?.inventory) ? variant.inventory : [];
  return rows.reduce((sum: number, row: Record<string, any>) => {
    const qty = Number(
      row?.in_stock_qty ??
        row?.unit_stock_qty ??
        row?.qty_available ??
        row?.quantity ??
        row?.qty ??
        0,
    );
    return Number.isFinite(qty) && qty > 0 ? sum + qty : sum;
  }, 0);
}

export async function recalculateMarketplaceFeesForAllProducts(db: Firestore) {
  const config = await loadMarketplaceFeeConfig();
  const snap = await db.collection("products_v2").get();
  let updatedProducts = 0;
  let updatedVariants = 0;

  for (const docSnap of snap.docs) {
    const current = docSnap.data() || {};
    const categorySlug = toStr(current?.grouping?.category);
    const subCategorySlug = toStr(current?.grouping?.subCategory) || null;
    const fulfillmentMode = toStr(current?.fulfillment?.mode, "seller") === "bevgo" ? "bevgo" : "seller";
    const successRule = resolveMarketplaceSuccessFeeRule(categorySlug, subCategorySlug, config.categories);
    const successFeePercent = estimateMarketplaceSuccessFeePercent(successRule.rule, 0);
    const successFeeLabel = describeMarketplaceFeeRule(successRule.rule);
    const variants = Array.isArray(current?.variants) ? current.variants : [];

    const nextVariants = variants.map((variant: Record<string, any>) => {
      const pricing = variant?.pricing || {};
      const logistics = normalizeMarketplaceVariantLogistics(variant?.logistics || null);
      const sellingPriceIncl = toNum(
        pricing?.selling_price_incl ??
          (variant?.sale?.is_on_sale ? variant?.sale?.sale_price_incl : 0),
      );
      const feeSnapshot = buildMarketplaceFeeSnapshot({
        categorySlug,
        subCategorySlug,
        sellingPriceIncl,
        weightKg: logistics.weightKg,
        lengthCm: logistics.lengthCm,
        widthCm: logistics.widthCm,
        heightCm: logistics.heightCm,
        stockQty: getVariantInventoryTotal(variant),
        monthlySales30d: logistics.monthlySales30d,
        fulfillmentMode,
        config,
      });

      updatedVariants += 1;
      return {
        ...variant,
        logistics: {
          ...(variant?.logistics || {}),
          volume_cm3: feeSnapshot.volumeCm3,
          stock_qty: getVariantInventoryTotal(variant),
        },
        fees: {
          ...(variant?.fees || {}),
          success_fee_percent: feeSnapshot.successFeePercent,
          success_fee_incl: feeSnapshot.successFeeIncl,
          fulfilment_fee_incl: feeSnapshot.fulfilmentFeeIncl,
          handling_fee_incl: feeSnapshot.handlingFeeIncl,
          storage_fee_incl: feeSnapshot.storageFeeIncl,
          total_fees_incl: feeSnapshot.totalFeesIncl,
          size_band: feeSnapshot.sizeBand,
          weight_band: feeSnapshot.weightBand,
          storage_band: feeSnapshot.storageBand,
          stock_cover_days: feeSnapshot.stockCoverDays,
          overstocked: feeSnapshot.overstocked,
          fulfilment_mode: feeSnapshot.fulfillmentMode,
          config_version: feeSnapshot.configVersion,
        },
      };
    });

    await docSnap.ref.update({
      variants: nextVariants,
      "product.fees": {
        ...(current?.product?.fees || {}),
        success_fee_percent: successFeePercent,
        success_fee_label: successFeeLabel,
        success_fee_rule_kind: successRule.rule?.kind || null,
        success_fee_rule: successRule.rule || null,
        config_version: config?.version || null,
      },
      "fulfillment.success_fee_percent": successFeePercent,
      "fulfillment.success_fee_label": successFeeLabel,
      "fulfillment.success_fee_rule_kind": successRule.rule?.kind || null,
      "fulfillment.commission_rate": successFeePercent,
      "timestamps.updatedAt": new Date().toISOString(),
    });
    updatedProducts += 1;
  }

  return { updatedProducts, updatedVariants };
}
