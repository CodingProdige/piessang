export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import {
  buildReturnCaseDocument,
  customerOwnsOrder,
  findOrderByReference,
  getReturnWindowStatus,
  resolveReturnSelection,
} from "@/lib/orders/returns";
import { collectSellerNotificationEmails, collectSystemAdminNotificationEmails, sendSellerNotificationEmails } from "@/lib/seller/notifications";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function getCustomerEmail(order = {}) {
  return (
    toStr(order?.customer?.email) ||
    toStr(order?.customer_snapshot?.email) ||
    toStr(order?.customer_snapshot?.account?.email) ||
    toStr(order?.customer_snapshot?.personal?.email) ||
    ""
  );
}

function getCustomerName(order = {}) {
  return (
    toStr(order?.customer?.accountName) ||
    toStr(order?.customer_snapshot?.account?.accountName) ||
    toStr(order?.customer_snapshot?.personal?.fullName) ||
    "Customer"
  );
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to request a return.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const orderId = toStr(body?.orderId);
    const orderNumber = toStr(body?.orderNumber);
    const merchantTransactionId = toStr(body?.merchantTransactionId);
    const reason = toStr(body?.reason || body?.returnReason);
    const message = toStr(body?.message);
    const evidence = Array.isArray(body?.evidence) ? body.evidence : [];
    const selectedLineKeys = Array.isArray(body?.lineKeys)
      ? body.lineKeys
      : Array.isArray(body?.lineItemKeys)
        ? body.lineItemKeys
        : Array.isArray(body?.lineIds)
          ? body.lineIds
          : [];

    if (!orderId && !orderNumber && !merchantTransactionId) {
      return err(400, "Missing Order", "orderId, orderNumber, or merchantTransactionId is required.");
    }
    if (!reason) {
      return err(400, "Missing Reason", "Please select or enter a reason for your return request.");
    }
    if (!message) {
      return err(400, "Missing Details", "Please tell us what went wrong with this order.");
    }

    const found = await findOrderByReference({ orderId, orderNumber, merchantTransactionId });
    if (!found) return err(404, "Order Not Found", "We could not find that order.");
    const order = { docId: found.id, ...found.data };

    if (!customerOwnsOrder(order, sessionUser.uid)) {
      return err(403, "Access Denied", "You can only request returns for your own orders.");
    }

    const paymentStatus =
      toStr(order?.lifecycle?.paymentStatus || order?.payment?.status || order?.order?.status?.payment).toLowerCase();
    if (!["paid", "partial_refund"].includes(paymentStatus)) {
      return err(409, "Unavailable", "Returns can only be requested for paid orders.");
    }

    const selection = resolveReturnSelection(order, selectedLineKeys);
    if (!selection.ok) {
      return err(409, "Separate Requests Needed", selection.message, { reason: selection.reason });
    }

    const windowStatus = getReturnWindowStatus(order, selection.selected, 7);
    if (!windowStatus.allowed) {
      return err(409, windowStatus.title || "Unavailable", windowStatus.message || "This return request is no longer eligible.", {
        deliveredAt: windowStatus.deliveredAt,
        expiresAt: windowStatus.expiresAt,
      });
    }

    const existingSnap = await db
      .collection("returns_v2")
      .where("return.orderId", "==", found.id)
      .where("return.status", "in", ["requested", "under_review", "approved"])
      .get();

    const requestedKeys = new Set(selection.selected.map((entry) => entry.lineKey));
    const duplicate = existingSnap.docs.find((docSnap) => {
      const lines = Array.isArray(docSnap.data()?.lines) ? docSnap.data().lines : [];
      const lineKeys = new Set(lines.map((line) => toStr(line?.lineKey)).filter(Boolean));
      if (!lineKeys.size) return false;
      return Array.from(requestedKeys).every((key) => lineKeys.has(key));
    });
    if (duplicate) {
      return ok({
        returnId: duplicate.id,
        status: toStr(duplicate.data()?.return?.status || "requested"),
        alreadyRequested: true,
      });
    }

    const createdAt = new Date().toISOString();
    const returnRef = db.collection("returns_v2").doc();
    const returnDoc = buildReturnCaseDocument({
      returnId: returnRef.id,
      order,
      selected: selection.selected,
      owner: selection.owner,
      customerId: sessionUser.uid,
      reason,
      message,
      evidence,
      createdAt,
    });

    await returnRef.set(returnDoc);

    const origin = new URL(req.url).origin;
    const customerEmail = getCustomerEmail(order);
    const customerName = getCustomerName(order);
    if (customerEmail) {
      await fetch(`${origin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "return-request-submitted",
          to: customerEmail,
          data: {
            customerName,
            orderNumber: toStr(order?.order?.orderNumber || found.id),
            returnId: returnRef.id,
            ownerLabel: selection.owner?.ownerLabel || "Piessang",
            lineCount: selection.selected.length,
            items: returnDoc.lines,
            reason,
          },
        }),
      }).catch(() => null);
    }

    if (selection.owner?.ownerType === "seller") {
      const sellerEmails = await collectSellerNotificationEmails({
        sellerSlug: selection.owner?.seller?.sellerSlug || null,
      });
      await sendSellerNotificationEmails({
        origin,
        type: "seller-return-request",
        to: sellerEmails,
        data: {
          vendorName: selection.owner?.seller?.vendorName || "Seller",
          orderNumber: toStr(order?.order?.orderNumber || found.id),
          returnId: returnRef.id,
          reason,
          itemCount: selection.selected.length,
          items: returnDoc.lines,
          message,
        },
      }).catch(() => []);
    }

    const internalEmails = await collectSystemAdminNotificationEmails();
    await sendSellerNotificationEmails({
      origin,
      type: "return-request-internal",
      to: internalEmails,
      data: {
        ownerLabel: selection.owner?.ownerLabel || "Piessang",
        orderNumber: toStr(order?.order?.orderNumber || found.id),
        returnId: returnRef.id,
        reason,
        itemCount: selection.selected.length,
        items: returnDoc.lines,
        message,
      },
    }).catch(() => []);

    return ok({
      returnId: returnRef.id,
      refundId: returnRef.id,
      status: "requested",
      ownerType: selection.owner?.ownerType || "platform",
      ownerLabel: selection.owner?.ownerLabel || "Piessang",
      responsibility: selection.owner?.responsibility || "",
    });
  } catch (error) {
    return err(500, "Return Request Failed", error?.message || "Unexpected error requesting a return.");
  }
}
