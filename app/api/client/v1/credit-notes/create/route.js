export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  createManualCreditNote,
  resolveOrderRefById,
  resolveOrderRefByNumber
} from "@/lib/creditNotes";

const ok = (data = {}, status = 200) =>
  NextResponse.json({ ok: true, data }, { status });

const err = (status = 500, title = "Server Error", message = "Unknown error", extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

const asMeaningfulString = value => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return "";
  return trimmed;
};

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const customerId = asMeaningfulString(body?.customerId);
    const reason = asMeaningfulString(body?.reason) || "manual_credit_note";
    const issuedBy = asMeaningfulString(body?.issuedBy) || null;
    const orderId = asMeaningfulString(body?.orderId);
    const orderNumber = asMeaningfulString(body?.orderNumber);
    const amountIncl = Number(body?.amountIncl);

    if (!customerId) {
      return err(400, "Missing Input", "customerId is required.");
    }

    if (!issuedBy) {
      return err(400, "Missing Input", "issuedBy is required for manual credit notes.");
    }

    if (reason.length < 5) {
      return err(400, "Invalid Input", "reason must be at least 5 characters.");
    }

    if (!Number.isFinite(amountIncl) || amountIncl <= 0) {
      return err(400, "Invalid Input", "amountIncl must be a number greater than 0.");
    }

    const manualCreditMax = Number(process.env.MANUAL_CREDIT_NOTE_MAX_INCL || 25000);
    if (Number.isFinite(manualCreditMax) && amountIncl > manualCreditMax) {
      return err(
        400,
        "Manual Credit Limit Exceeded",
        `amountIncl exceeds allowed limit (${manualCreditMax}).`
      );
    }

    let source = {
      type: "manual",
      orderId: null,
      orderNumber: null
    };

    if (orderId || orderNumber) {
      const resolved = orderId
        ? await resolveOrderRefById(orderId)
        : await resolveOrderRefByNumber(orderNumber);

      if (!resolved) {
        return err(404, "Order Not Found", "Provided orderId/orderNumber could not be located.");
      }

      const order = resolved.order || {};
      const orderCustomerId =
        order?.meta?.orderedFor ||
        order?.order?.customerId ||
        order?.customer_snapshot?.uid ||
        null;

      if (orderCustomerId && orderCustomerId !== customerId) {
        return err(
          409,
          "Customer Mismatch",
          "Provided customerId does not match the order customer."
        );
      }

      source = {
        type: "manual_order_adjustment",
        orderId: resolved.orderId,
        orderNumber: resolved.orderNumber
      };
    }

    const note = await createManualCreditNote({
      customerId,
      amountIncl,
      reason,
      issuedBy,
      source
    });

    return ok({
      credit_note: note
    });
  } catch (e) {
    return err(
      500,
      "Create Credit Note Failed",
      e?.message || "Unexpected error creating credit note."
    );
  }
}
