export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { customerOwnsOrder, findOrderByReference } from "@/lib/orders/returns";
import { canAccessSellerSettlement, isSystemAdminUser } from "@/lib/seller/settlement-access";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function matchesSeller(returnDoc = {}, sellerCode = "", sellerSlug = "") {
  const ownership = returnDoc?.ownership || {};
  const codeNeedle = toStr(sellerCode).toLowerCase();
  const slugNeedle = toStr(sellerSlug).toLowerCase();
  const docCode = toStr(ownership?.sellerCode).toLowerCase();
  const docSlug = toStr(ownership?.sellerSlug).toLowerCase();
  return Boolean((codeNeedle && docCode === codeNeedle) || (slugNeedle && docSlug === slugNeedle));
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to view returns.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const returnId = toStr(body?.returnId || body?.refundId);
    const orderId = toStr(body?.orderId);
    const orderNumber = toStr(body?.orderNumber);
    const merchantTransactionId = toStr(body?.merchantTransactionId);
    const sellerCode = toStr(body?.sellerCode);
    const sellerSlug = toStr(body?.sellerSlug);
    const status = toStr(body?.status).toLowerCase();

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    const systemAdmin = isSystemAdminUser(requester);

    if (returnId) {
      const snap = await db.collection("returns_v2").doc(returnId).get();
      if (!snap.exists) return err(404, "Return Not Found", "We could not find that return request.");
      const data = snap.data() || {};
      if (
        !systemAdmin &&
        !customerOwnsOrder({ docId: data?.return?.orderId, customer_snapshot: { customerId: data?.return?.customerId }, meta: { orderedFor: data?.return?.customerId } }, sessionUser.uid) &&
        !canAccessSellerSettlement(requester, sellerSlug || data?.ownership?.sellerSlug, sellerCode || data?.ownership?.sellerCode)
      ) {
        return err(403, "Access Denied", "You do not have permission to view this return request.");
      }
      return ok({ data: { docId: snap.id, ...data } });
    }

    let order = null;
    if (orderId || orderNumber || merchantTransactionId) {
      const found = await findOrderByReference({ orderId, orderNumber, merchantTransactionId });
      if (!found) return err(404, "Order Not Found", "We could not find that order.");
      order = { docId: found.id, ...found.data };
    }

    const snap = await db.collection("returns_v2").get();
    const rows = snap.docs
      .map((docSnap) => ({ docId: docSnap.id, ...docSnap.data() }))
      .filter((entry) => {
        if (status && toStr(entry?.return?.status).toLowerCase() !== status) return false;
        if (order && toStr(entry?.return?.orderId) !== toStr(order.docId)) return false;
        if (systemAdmin) return true;
        if (customerOwnsOrder({ customer_snapshot: { customerId: entry?.return?.customerId }, meta: { orderedFor: entry?.return?.customerId } }, sessionUser.uid)) {
          return true;
        }
        return canAccessSellerSettlement(requester, sellerSlug || entry?.ownership?.sellerSlug, sellerCode || entry?.ownership?.sellerCode) &&
          matchesSeller(entry, sellerCode || entry?.ownership?.sellerCode, sellerSlug || entry?.ownership?.sellerSlug);
      })
      .sort((a, b) => String(b?.timestamps?.createdAt || "").localeCompare(String(a?.timestamps?.createdAt || "")));

    return ok({ data: rows });
  } catch (error) {
    return err(500, "Return Lookup Failed", error?.message || "Unexpected error loading returns.");
  }
}
