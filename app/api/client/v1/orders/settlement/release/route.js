export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { releaseSellerSettlement } from "@/lib/seller/settlements";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status = 500, title = "Server Error", message = "Unknown error", extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

async function resolveOrderId(orderId, orderNumber) {
  const db = getAdminDb();
  if (!db) return null;
  if (orderId) return orderId;
  if (!orderNumber) return null;

  const match = await db.collection("orders_v2").where("order.orderNumber", "==", orderNumber).get();

  if (match.empty) return null;
  if (match.size > 1) {
    throw {
      code: 409,
      title: "Multiple Orders Found",
      message: "Multiple orders match this orderNumber.",
    };
  }

  return match.docs[0].id;
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const payload = body?.data && typeof body.data === "object" ? body.data : body;
    const uid = toStr(body?.uid || payload?.uid);
    const orderId = toStr(payload?.orderId || body?.orderId);
    const orderNumber = toStr(payload?.orderNumber || body?.orderNumber);
    const settlementId = toStr(payload?.settlementId || "");
    const releasedIncl = Number(payload?.releasedIncl ?? payload?.amountIncl ?? 0);
    const releaseReference = toStr(payload?.releaseReference || payload?.reference || "");

    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!orderId && !orderNumber && !settlementId) return err(400, "Missing Order", "orderId, orderNumber or settlementId is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");
    const requester = requesterSnap.data() || {};
    if (!isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "System admin access required.");
    }

    const resolvedOrderId = await resolveOrderId(orderId, orderNumber);
    if (settlementId) {
      const result = await releaseSellerSettlement({
        orderId: resolvedOrderId || null,
        settlementId,
        releasedBy: uid,
        releaseReference: releaseReference || null,
        amountIncl: releasedIncl > 0 ? releasedIncl : null,
      });

      return ok({
        message: "Seller settlement released.",
        ...result,
      });
    }

    if (!resolvedOrderId) {
      return err(404, "Order Not Found", "Could not locate the order for payout release.");
    }

    const orderSnap = await db.collection("orders_v2").doc(resolvedOrderId).get();
    if (!orderSnap.exists) {
      return err(404, "Order Not Found", "Could not locate the order for payout release.");
    }

    const order = orderSnap.data() || {};
    const summaries = Array.isArray(order?.settlements?.items) ? order.settlements.items : [];
    if (!summaries.length) {
      return err(404, "Settlement Not Found", "No settlement records exist for this order.");
    }

    const releases = [];
    for (const summary of summaries) {
      if (!summary?.settlementId) continue;
      const result = await releaseSellerSettlement({
        orderId: resolvedOrderId,
        settlementId: summary.settlementId,
        releasedBy: uid,
        releaseReference: releaseReference || null,
        amountIncl: Number.isFinite(Number(summary?.remainingDueIncl)) ? Number(summary.remainingDueIncl) : null,
      });
      releases.push(result);
    }

    return ok({
      message: "Seller settlements released.",
      orderId: resolvedOrderId,
      releases,
    });
  } catch (e) {
    return err(e?.code ?? 500, e?.title ?? "Release Failed", e?.message ?? "Unexpected error releasing seller settlement.");
  }
}
