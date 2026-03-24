import { getAdminDb } from "@/lib/firebase/admin";
import { getSellerLotStorageSummary } from "@/lib/warehouse/stock-lots";

export const SELLER_BILLING_COLLECTION = "seller_billing_cycles_v1";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toNum(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function r2(value: unknown) {
  return Number(toNum(value, 0).toFixed(2));
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1, 0, 0, 0, 0);
}

export function getMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseIsoDate(value: unknown) {
  const raw = toStr(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function matchesSeller(record: Record<string, any>, sellerSlug?: string | null, sellerCode?: string | null) {
  const slugNeedle = toStr(sellerSlug).toLowerCase();
  const codeNeedle = toStr(sellerCode).toLowerCase();
  const recordSlug = toStr(record?.sellerSlug).toLowerCase();
  const recordCode = toStr(record?.sellerCode).toLowerCase();
  return Boolean((slugNeedle && recordSlug === slugNeedle) || (codeNeedle && recordCode === codeNeedle));
}

export async function computeSellerBillingCycle({
  sellerSlug,
  sellerCode,
  vendorName,
  monthKey,
}: {
  sellerSlug?: string | null;
  sellerCode?: string | null;
  vendorName?: string | null;
  monthKey: string;
}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  const [year, month] = String(monthKey || "").split("-").map((item) => Number(item));
  if (!year || !month) throw new Error("VALID_MONTH_KEY_REQUIRED");

  const periodStart = startOfMonth(new Date(year, month - 1, 1));
  const periodEnd = endOfMonth(periodStart);
  const billingMonthLabel = periodStart.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
  const invoiceMonth = addMonths(periodStart, 1);
  const issuedAt = startOfMonth(invoiceMonth).toISOString();
  const dueDate = new Date(invoiceMonth.getFullYear(), invoiceMonth.getMonth(), 7, 23, 59, 59, 999).toISOString();

  const settlementsSnap = await db.collection("seller_settlements_v1").get();
  const rows: Record<string, any>[] = [];

  settlementsSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (!matchesSeller(data, sellerSlug, sellerCode)) return;
    const when = parseIsoDate(data?.updatedAt || data?.createdAt || data?.lastSyncedAt);
    if (!when) return;
    if (when < periodStart || when > periodEnd) return;
    rows.push(data);
  });

  const totals = rows.reduce(
    (acc, row) => {
      const payout = row?.payout && typeof row.payout === "object" ? row.payout : {};
      acc.salesIncl = r2(acc.salesIncl + toNum(payout.gross_incl, 0));
      acc.successFeeIncl = r2(acc.successFeeIncl + toNum(payout.success_fee_incl, 0));
      acc.fulfilmentFeeIncl = r2(acc.fulfilmentFeeIncl + toNum(payout.fulfilment_fee_incl, 0));
      acc.storageFeeIncl = r2(acc.storageFeeIncl + toNum(payout.storage_accrued_incl, 0));
      acc.netSellerPayoutIncl = r2(acc.netSellerPayoutIncl + toNum(payout.net_due_incl, 0));
      return acc;
    },
    {
      salesIncl: 0,
      successFeeIncl: 0,
      fulfilmentFeeIncl: 0,
      storageFeeIncl: 0,
      netSellerPayoutIncl: 0,
    },
  );

  const lotStorageSummary = await getSellerLotStorageSummary({
    sellerSlug,
    sellerCode,
    periodEnd,
  });

  totals.storageFeeIncl = r2(lotStorageSummary.storageFeeTotal);

  const amountDueIncl = r2(totals.fulfilmentFeeIncl + totals.storageFeeIncl);
  const now = new Date();
  const status = amountDueIncl <= 0 ? "settled" : now.toISOString() > dueDate ? "overdue" : "due";

  return {
    monthKey,
    billingMonthLabel,
    sellerSlug: toStr(sellerSlug),
    sellerCode: toStr(sellerCode),
    vendorName: toStr(vendorName || sellerSlug || sellerCode || "Seller"),
    issuedAt,
    dueDate,
    status,
    totals: {
      ...totals,
      amountDueIncl,
    },
    counts: {
      settlements: rows.length,
      agedLots: lotStorageSummary.overThresholdLots.length,
    },
    payments: [],
    invoice: {
      invoiceNumber: `SB-${monthKey.replace("-", "")}-${toStr(sellerCode || sellerSlug || "SELLER").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase()}`,
      invoiceUrl: null,
      statementUrl: null,
    },
    notes: {
      invoiceRule:
        "Storage is billed from remaining warehouse stock lots at month end. Success fees are shown for reporting and marketplace transparency.",
    },
    storageLots: {
      thresholdDays: lotStorageSummary.thresholdDays,
      overThresholdLots: lotStorageSummary.overThresholdLots.map((lot: any) => ({
        lotId: lot.lotId || lot.id,
        productId: lot.productId || null,
        variantId: lot.variantId || null,
        remainingQty: lot.remainingQty || 0,
        ageDays: lot.ageDays || 0,
        storageBand: lot.storageBand || null,
        amount: lot.amount || 0,
      })),
    },
  };
}

export async function getSellerBillingOverview({
  sellerSlug,
  sellerCode,
  vendorName,
  months = 6,
}: {
  sellerSlug?: string | null;
  sellerCode?: string | null;
  vendorName?: string | null;
  months?: number;
}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  const cyclesSnap = await db.collection(SELLER_BILLING_COLLECTION).get();
  const saved: Record<string, any>[] = cyclesSnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
    .filter((item) => matchesSeller(item, sellerSlug, sellerCode));

  const monthKeys = Array.from({ length: Math.max(1, months) }, (_, index) => getMonthKey(addMonths(new Date(), -index - 1)));
  const cycles = [];

  for (const monthKey of monthKeys) {
    const existing = saved.find((item) => toStr(item.monthKey) === monthKey);
    if (existing) {
      cycles.push(existing);
      continue;
    }
    cycles.push(
      await computeSellerBillingCycle({
        sellerSlug,
        sellerCode,
        vendorName,
        monthKey,
      }),
    );
  }

  cycles.sort((left, right) => String(right.monthKey || "").localeCompare(String(left.monthKey || "")));
  const current = cycles[0] || null;

  return {
    current,
    cycles,
    guide: {
      successFee:
        "Success fees are calculated from the live category rate whenever an order is created. They are shown in billing for transparency.",
      handlingFee:
        "There is no separate handling fee. The Piessang warehouse charge is the fulfilment fee selected from the size and weight matrix.",
      storageFee:
        "Storage fees are billed from the remaining warehouse lots that are still in stock at month end and are older than the configured threshold.",
      invoiceRule:
        "The payable seller warehouse bill is currently focused on fulfilment and storage. Success fees remain visible in the statement as marketplace charge reporting.",
    },
  };
}

export async function saveSellerBillingCycle(cycle: Record<string, any>) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  const sellerKey = toStr(cycle?.sellerCode || cycle?.sellerSlug || "seller").replace(/[^A-Za-z0-9_-]/g, "");
  const monthKey = toStr(cycle?.monthKey);
  const id = `${sellerKey}__${monthKey}`;
  const payload = {
    ...cycle,
    billingId: id,
    updatedAt: new Date().toISOString(),
  };
  await db.collection(SELLER_BILLING_COLLECTION).doc(id).set(payload, { merge: true });
  return payload;
}
