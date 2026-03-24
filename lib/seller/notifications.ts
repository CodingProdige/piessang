import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { sanitizeInviteEmail } from "@/lib/seller/team";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function addEmail(set: Set<string>, value: unknown) {
  const email = sanitizeInviteEmail(toStr(value));
  if (email && email.includes("@")) set.add(email);
}

export async function collectSellerNotificationEmails(params: {
  sellerSlug?: string | null;
  fallbackEmails?: string[];
}) {
  const sellerSlug = toStr(params?.sellerSlug);
  const fallbackEmails = Array.isArray(params?.fallbackEmails) ? params.fallbackEmails : [];
  const emails = new Set<string>();

  for (const email of fallbackEmails) addEmail(emails, email);
  if (!sellerSlug) return Array.from(emails);

  const snap = await getDocs(collection(db, "users"));
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const seller = data?.seller && typeof data.seller === "object" ? data.seller : {};
    const team = seller?.team && typeof seller.team === "object" ? seller.team : {};

    const docSellerSlug = toStr(seller?.sellerSlug || seller?.groupSellerSlug);
    const teamOwnerUid = toStr(seller?.teamOwnerUid || team?.teamOwnerUid);
    const email = data?.email || seller?.contactEmail || team?.contactEmail;

    const matchesSeller =
      docSellerSlug && docSellerSlug === sellerSlug ||
      toStr(seller?.groupSellerSlug) === sellerSlug ||
      toStr(team?.sellerSlug) === sellerSlug ||
      toStr(team?.groupSellerSlug) === sellerSlug;

    if (matchesSeller) {
      addEmail(emails, email);
      addEmail(emails, seller?.contactEmail);
    }

    if (teamOwnerUid && toStr(docSnap.id) === teamOwnerUid) {
      addEmail(emails, email);
      addEmail(emails, seller?.contactEmail);
    }
  });

  return Array.from(emails);
}

export async function sendSellerNotificationEmails(params: {
  origin: string;
  type: string;
  to: string[];
  data: Record<string, unknown>;
}) {
  const origin = toStr(params?.origin);
  const type = toStr(params?.type);
  const recipients = Array.isArray(params?.to) ? params.to.filter(Boolean) : [];
  if (!origin || !type || recipients.length === 0) return [];

  return Promise.all(
    recipients.map(async (recipient) => {
      const response = await fetch(`${origin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          to: recipient,
          data: params.data,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      return {
        to: recipient,
        ok: response.ok,
        statusCode: response.status,
        provider: payload?.provider || null,
        messageId: payload?.messageId || null,
        details: payload?.details || null,
      };
    }),
  );
}

export function normalizeStockValue(value: unknown) {
  const qty = Number(value ?? 0);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

export function getVariantInventoryTotal(variant: {
  inventory?: Array<Record<string, unknown>> | null;
}) {
  const rows = Array.isArray(variant?.inventory) ? variant.inventory : [];
  return rows.reduce((sum, row) => {
    const hidden = row?.supplier_out_of_stock === true || row?.in_stock === false;
    if (hidden) return sum;
    const qty =
      normalizeStockValue(row?.in_stock_qty) ||
      normalizeStockValue(row?.unit_stock_qty) ||
      normalizeStockValue(row?.qty_available) ||
      normalizeStockValue(row?.quantity) ||
      normalizeStockValue(row?.qty);
    return sum + qty;
  }, 0);
}

export function getProductInventoryTotal(product: {
  inventory?: Array<Record<string, unknown>> | null;
}) {
  const rows = Array.isArray(product?.inventory) ? product.inventory : [];
  return rows.reduce((sum, row) => {
    const hidden = row?.supplier_out_of_stock === true || row?.in_stock === false;
    if (hidden) return sum;
    const qty =
      normalizeStockValue(row?.in_stock_qty) ||
      normalizeStockValue(row?.unit_stock_qty) ||
      normalizeStockValue(row?.qty_available) ||
      normalizeStockValue(row?.quantity) ||
      normalizeStockValue(row?.qty);
    return sum + qty;
  }, 0);
}
