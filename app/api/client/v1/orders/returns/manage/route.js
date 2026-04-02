export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { canAccessSellerSettlement, isSystemAdminUser } from "@/lib/seller/settlement-access";
import { createOrderTimelineEvent, appendOrderTimelineEvent } from "@/lib/orders/timeline";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function statusHeadline(action, ownerLabel) {
  switch (action) {
    case "under_review":
      return "Your return request is under review";
    case "approve":
      return "Your return request was approved";
    case "reject":
      return "Your return request was not approved";
    case "refund":
      return "Your refund has been processed";
    case "resolve":
      return "Your return request was resolved";
    default:
      return "Your return request has an update";
  }
}

function statusMessage(action, ownerLabel, note) {
  const owner = toStr(ownerLabel, "Piessang");
  switch (action) {
    case "under_review":
      return `${owner} is reviewing your return request.`;
    case "approve":
      return `${owner} approved your return request.${note ? ` ${note}` : ""}`.trim();
    case "reject":
      return `${owner} did not approve your return request.${note ? ` ${note}` : ""}`.trim();
    case "refund":
      return `Your approved return has been refunded.${note ? ` ${note}` : ""}`.trim();
    case "resolve":
      return `Your return request has been resolved.${note ? ` ${note}` : ""}`.trim();
    default:
      return note || "Your return request has been updated.";
  }
}

function getCustomerEmail(returnDoc = {}) {
  const snapshot = returnDoc?.order_snapshot || {};
  const customer = snapshot?.customer || {};
  return (
    toStr(returnDoc?.customer?.email) ||
    toStr(returnDoc?.order_snapshot?.customer_snapshot?.email) ||
    toStr(customer?.email) ||
    toStr(returnDoc?.return?.customerEmail)
  );
}

function getCustomerName(returnDoc = {}) {
  const snapshot = returnDoc?.order_snapshot || {};
  const customer = snapshot?.customer || {};
  return (
    toStr(customer?.accountName) ||
    toStr(snapshot?.customer_snapshot?.account?.accountName) ||
    toStr(snapshot?.customer_snapshot?.personal?.fullName) ||
    "Customer"
  );
}

function getRefundPaymentId(order = {}) {
  const attempts = Array.isArray(order?.payment?.attempts) ? order.payment.attempts : [];
  const charged = attempts
    .filter((attempt) => toStr(attempt?.status).toLowerCase() === "charged" && toStr(attempt?.type).toLowerCase() !== "refund")
    .sort((left, right) => String(right?.createdAt || "").localeCompare(String(left?.createdAt || "")));
  return toStr(charged[0]?.peachTransactionId || charged[0]?.transactionId || "");
}

function getOrderPaymentProvider(order = {}) {
  return toStr(order?.payment?.provider || order?.order?.payment?.provider).toLowerCase();
}

function sentenceStatus(value) {
  const normalized = toStr(value).replace(/[_-]+/g, " ").trim();
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

async function ensureCreditNoteNumber({ db }) {
  const counterRef = db.collection("system_counters").doc("credit_notes");
  let nextNumber = "";
  await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const last = Number(counterSnap.exists ? counterSnap.data()?.last : 0) || 0;
    const next = last + 1;
    nextNumber = `CN-${String(next).padStart(6, "0")}`;
    tx.set(counterRef, { last: next }, { merge: true });
  });
  return nextNumber;
}

async function createSellerCreditNote({ db, orderRef, order, returnId, returnDoc, ownership, refundAmount, issuedBy, issuedAt }) {
  const sellerCode = toStr(ownership?.sellerCode);
  const sellerSlug = toStr(ownership?.sellerSlug);
  const vendorName = toStr(ownership?.label || ownership?.vendorName || "Seller");
  const creditNoteNumber = await ensureCreditNoteNumber({ db });
  const creditNoteId = `cn_${creditNoteNumber.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
  const originalInvoiceNumber = toStr(order?.invoice?.invoiceNumber || order?.order?.orderNumber);
  const originalSellerInvoiceNumber =
    originalInvoiceNumber && (sellerCode || sellerSlug)
      ? `${originalInvoiceNumber}-${toStr(sellerCode || sellerSlug).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toUpperCase()}`
      : originalInvoiceNumber;
  const lines = Array.isArray(returnDoc?.lines) ? returnDoc.lines : [];
  const creditNotePayload = {
    creditNoteId,
    docId: creditNoteId,
    creditNoteNumber,
    orderId: toStr(returnDoc?.return?.orderId),
    orderNumber: toStr(returnDoc?.return?.orderNumber || order?.order?.orderNumber),
    returnId,
    sellerCode: sellerCode || null,
    sellerSlug: sellerSlug || null,
    vendorName,
    customerId: toStr(returnDoc?.return?.customerId || order?.order?.customerId),
    customerName: getCustomerName(returnDoc),
    amountIncl: Number(refundAmount || 0),
    reason: toStr(returnDoc?.return?.reason || "refund"),
    reasonLabel: sentenceStatus(returnDoc?.return?.reason || "refund"),
    status: "issued",
    originalInvoiceNumber: originalInvoiceNumber || null,
    originalSellerInvoiceNumber: originalSellerInvoiceNumber || null,
    lines,
    issuedAt,
    createdAt: issuedAt,
    updatedAt: issuedAt,
    issuedBy,
  };

  const orderTimelineEvent = createOrderTimelineEvent({
    type: "credit_note_issued",
    title: "Credit note issued",
    message: `${vendorName} issued credit note ${creditNoteNumber} for ${Number(refundAmount || 0).toFixed(2)}.`,
    actorType: "admin",
    actorId: issuedBy,
    actorLabel: "Piessang",
    createdAt: issuedAt,
    status: "refunded",
    sellerCode,
    sellerSlug,
    metadata: {
      creditNoteId,
      creditNoteNumber,
      returnId,
      amountIncl: Number(refundAmount || 0),
    },
  });

  await Promise.all([
    db.collection("credit_notes_v2").doc(creditNoteId).set(creditNotePayload, { merge: true }),
    orderRef.set(
      {
        credit_notes: {
          seller_notes: {
            [creditNoteId]: {
              ...creditNotePayload,
              timelineEventId: orderTimelineEvent.id,
            },
          },
        },
        timeline: {
          events: appendOrderTimelineEvent(order, orderTimelineEvent),
        },
        timestamps: {
          ...(order?.timestamps || {}),
          updatedAt: issuedAt,
        },
      },
      { merge: true },
    ),
  ]);

  return creditNotePayload;
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to manage return requests.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const returnId = toStr(body?.returnId || body?.refundId);
    const action = toStr(body?.action).toLowerCase();
    const note = toStr(body?.note || body?.message);
    const amount = Number(body?.amount || 0);

    if (!returnId) return err(400, "Missing Return", "Choose a return request first.");
    if (!["under_review", "approve", "reject", "refund", "resolve"].includes(action)) {
      return err(400, "Invalid Action", "Action must be under_review, approve, reject, refund, or resolve.");
    }

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    const systemAdmin = isSystemAdminUser(requester);

    const returnRef = db.collection("returns_v2").doc(returnId);
    const returnSnap = await returnRef.get();
    if (!returnSnap.exists) return err(404, "Return Not Found", "We could not find that return request.");
    const returnDoc = returnSnap.data() || {};

    const ownership = returnDoc?.ownership || {};
    const sellerSlug = toStr(ownership?.sellerSlug);
    const sellerCode = toStr(ownership?.sellerCode);
    const ownerType = toStr(ownership?.type || returnDoc?.return?.ownerType).toLowerCase();

    const sellerAllowed =
      ownerType === "seller" &&
      canAccessSellerSettlement(requester, sellerSlug, sellerCode);
    if (!systemAdmin && !sellerAllowed) {
      return err(403, "Access Denied", "You do not have permission to manage this return request.");
    }
    if (action === "refund" && !systemAdmin) {
      return err(403, "Admin Required", "Only Piessang admins can process refunds.");
    }

    const currentStatus = toStr(returnDoc?.return?.status).toLowerCase();
    if (action === "refund" && currentStatus !== "approved") {
      return err(409, "Approval Required", "Only approved return requests can be refunded.");
    }

    const now = new Date().toISOString();
    const updatePayload = {
      "timestamps.updatedAt": now,
      "audit.updatedAt": now,
    };

    let nextStatus = currentStatus;
    let responseMessage = "Return request updated.";

    if (action === "under_review") {
      nextStatus = "under_review";
      responseMessage = "Return request moved into review.";
    } else if (action === "approve") {
      nextStatus = "approved";
      responseMessage = "Return request approved.";
    } else if (action === "reject") {
      nextStatus = "rejected";
      responseMessage = "Return request rejected.";
    } else if (action === "resolve") {
      nextStatus = "resolved";
      responseMessage = "Return request resolved.";
    } else if (action === "refund") {
      const orderId = toStr(returnDoc?.return?.orderId);
      const orderNumber = toStr(returnDoc?.return?.orderNumber);
      const merchantTransactionId = toStr(returnDoc?.return?.merchantTransactionId);
      const orderSnap = orderId ? await db.collection("orders_v2").doc(orderId).get() : null;
      const order = orderSnap?.exists ? orderSnap.data() || {} : {};
      const refundAmount = amount > 0 ? amount : Number(returnDoc?.return?.amountIncl || 0);
      const origin = new URL(req.url).origin;
      const paymentProvider = getOrderPaymentProvider(order);
      const refundRoute =
        paymentProvider === "stripe"
          ? "/api/client/v1/payments/stripe/refund"
          : "/api/client/v1/payments/peach/charge-refund";
      const refundPayloadBody =
        paymentProvider === "stripe"
          ? {
              orderId,
              orderNumber,
              merchantTransactionId,
              refundRequestId: returnId,
              amount: refundAmount,
              note: note || returnDoc?.return?.message || "Approved marketplace return refund.",
            }
          : {
              orderId,
              orderNumber,
              merchantTransactionId,
              paymentId: getRefundPaymentId(order),
              refundRequestId: returnId,
              amount: refundAmount,
              currency: "ZAR",
              message: note || returnDoc?.return?.message || "Approved marketplace return refund.",
            };
      if (paymentProvider !== "stripe" && !refundPayloadBody.paymentId) {
        return err(409, "Missing Payment", "We could not find the original charged payment for this order.");
      }
      const refundResponse = await fetch(`${origin}${refundRoute}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(refundPayloadBody),
      });
      const refundPayload = await refundResponse.json().catch(() => ({}));
      if (!refundResponse.ok || refundPayload?.ok === false) {
        return err(
          refundResponse.status || 500,
          refundPayload?.title || "Refund Failed",
          refundPayload?.message || "Unable to process the refund for this return request.",
        );
      }
      nextStatus = "refunded";
      responseMessage = "Refund processed successfully.";
      updatePayload["resolution.refundId"] = refundPayload?.refundId || null;
      updatePayload["resolution.refundedAmountIncl"] = refundAmount;
      updatePayload["resolution.refundedAt"] = now;
      updatePayload["resolution.refundedBy"] = sessionUser.uid;

      if (orderSnap?.exists) {
        await createSellerCreditNote({
          db,
          orderRef: orderSnap.ref,
          order,
          returnId,
          returnDoc,
          ownership,
          refundAmount,
          issuedBy: sessionUser.uid,
          issuedAt: now,
        });
      }
    }

    updatePayload["return.status"] = nextStatus;
    updatePayload["resolution.action"] = action;
    updatePayload["resolution.note"] = note || null;
    updatePayload["resolution.updatedAt"] = now;
    updatePayload["resolution.updatedBy"] = sessionUser.uid;
    updatePayload["audit.events"] = [
      ...(Array.isArray(returnDoc?.audit?.events) ? returnDoc.audit.events : []),
      {
        type: action,
        at: now,
        actorType: systemAdmin ? "admin" : "seller",
        actorId: sessionUser.uid,
        note: note || null,
      },
    ];

    await returnRef.set(updatePayload, { merge: true });

    const customerEmail = getCustomerEmail(returnDoc);
    if (customerEmail) {
      await fetch(`${new URL(req.url).origin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "return-status-update",
          to: customerEmail,
          data: {
            customerName: getCustomerName(returnDoc),
            orderNumber: toStr(returnDoc?.return?.orderNumber || returnDoc?.return?.orderId),
            returnId,
            ownerLabel: toStr(ownership?.label || returnDoc?.return?.ownerLabel || "Piessang"),
            statusLabel: nextStatus.replace(/_/g, " "),
            statusHeadline: statusHeadline(action, ownership?.label),
            statusMessage: statusMessage(action, ownership?.label, note),
            items: Array.isArray(returnDoc?.lines) ? returnDoc.lines : [],
          },
        }),
      }).catch(() => null);
    }

    return ok({
      message: responseMessage,
      returnId,
      status: nextStatus,
    });
  } catch (error) {
    return err(500, "Return Update Failed", error?.message || "Unexpected error managing the return request.");
  }
}
