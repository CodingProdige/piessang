import {
  MarketplaceCartLine,
  MarketplaceDeliveryMethod,
  MarketplaceFulfillmentMode,
  MarketplaceSplitOrderInput,
  MarketplaceSplitOrderResult,
  MarketplaceSubOrder,
} from "@/lib/marketplace/types";
import { normalizeMoneyAmount } from "@/lib/money";

const VAT_RATE = 0.15;

const money = (value: number) => normalizeMoneyAmount(Number(value || 0));

function resolveDeliveryMethod(
  fulfillmentMode: MarketplaceFulfillmentMode,
  explicit?: MarketplaceDeliveryMethod,
): MarketplaceDeliveryMethod {
  if (explicit) return explicit;
  return fulfillmentMode === "supplier" ? "supplier_delivery" : "bevgo_delivery";
}

function resolveFulfillmentMode(line: MarketplaceCartLine): MarketplaceFulfillmentMode {
  return line.fulfillmentMode || "platform";
}

function buildTotals(lines: MarketplaceCartLine[]) {
  const excl = lines.reduce((sum, line) => sum + money(line.lineTotals?.excl ?? 0), 0);
  const vat = money(excl * VAT_RATE);
  return {
    excl,
    incl: money(excl + vat),
    vat,
    currency: lines[0]?.lineTotals?.currency || "ZAR",
  };
}

export function splitMarketplaceOrder(input: MarketplaceSplitOrderInput): MarketplaceSplitOrderResult {
  const groups = new Map<string, MarketplaceCartLine[]>();

  for (const line of input.lines || []) {
    const fulfillmentMode = resolveFulfillmentMode(line);
    const deliveryMethod = resolveDeliveryMethod(fulfillmentMode, line.deliveryMethod);
    const supplierKey = `${line.supplier.supplierId}::${fulfillmentMode}::${deliveryMethod}`;
    const nextLine = {
      ...line,
      fulfillmentMode,
      deliveryMethod,
    };
    const bucket = groups.get(supplierKey) || [];
    bucket.push(nextLine);
    groups.set(supplierKey, bucket);
  }

  const subOrders: MarketplaceSubOrder[] = Array.from(groups.entries()).map(([supplierKey, lines], index) => {
    const representative = lines[0];
    const totals = buildTotals(lines);

    return {
      subOrderId: `SO-${String(index + 1).padStart(4, "0")}`,
      supplier: representative.supplier,
      fulfillmentMode: representative.fulfillmentMode,
      deliveryMethod: representative.deliveryMethod || "bevgo_delivery",
      status: "pending",
      lineCount: lines.length,
      quantities: lines.reduce((sum, line) => sum + line.quantity, 0),
      totals,
      lines: lines.map((line) => ({
        ...line,
        supplierOrderKey: supplierKey,
      })),
    };
  });

  const totals = buildTotals(input.lines || []);

  return {
    parentOrder: {
      orderId: `PO-${input.cartId || "cart"}`,
      cartId: input.cartId,
      customerId: input.customerId,
      source: input.source || "web",
      currency: totals.currency,
      subOrderCount: subOrders.length,
      totals,
      deliveryAddress: input.deliveryAddress ?? null,
    },
    subOrders,
  };
}
