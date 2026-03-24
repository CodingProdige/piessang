export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where
} from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";

const ok = (data = {}, status = 200) =>
  NextResponse.json({ ok: true, data }, { status });

const err = (status = 500, title = "Server Error", message = "Unknown error", extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

const r2 = value => Number((Number(value) || 0).toFixed(2));
const now = () => new Date().toISOString();

const asMeaningfulString = value => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return "";
  return trimmed;
};

function deriveStatus(usedAmountIncl, remainingAmountIncl) {
  if (remainingAmountIncl <= 0) return "fully_used";
  if (usedAmountIncl > 0) return "partially_used";
  return "open";
}

function pickLatestCandidate(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const aData = a?.data || a || {};
    const bData = b?.data || b || {};
    const aTime = new Date(aData?.updatedAt || aData?.createdAt || 0).getTime();
    const bTime = new Date(bData?.updatedAt || bData?.createdAt || 0).getTime();
    return bTime - aTime;
  })[0];
}

async function resolveCreditNoteRef({ creditNoteId, customerId, orderNumber }) {
  if (creditNoteId) {
    const ref = doc(db, "credit_notes_v2", creditNoteId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { ref, snap };
  }

  if (!orderNumber) return null;

  const q = query(
    collection(db, "credit_notes_v2"),
    where("source.orderNumber", "==", orderNumber),
    limit(100)
  );
  const matches = await getDocs(q);
  if (matches.empty) return null;

  const candidates = matches.docs
    .map(d => ({ id: d.id, ref: d.ref, data: d.data() || {} }))
    .filter(item => {
      if (!customerId) return true;
      return String(item?.data?.customerId || "") === customerId;
    });

  if (candidates.length === 0) return null;

  const openOrPartial = candidates.filter(c => {
    const status = String(c?.data?.status || "").toLowerCase();
    return status === "open" || status === "partially_used";
  });

  const chosen = pickLatestCandidate(openOrPartial) || pickLatestCandidate(candidates);
  if (!chosen || !chosen.ref) {
    const fallback = candidates[0];
    return fallback ? { ref: fallback.ref, snap: await getDoc(fallback.ref) } : null;
  }
  return { ref: chosen.ref, snap: await getDoc(chosen.ref) };
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const creditNoteId = asMeaningfulString(body?.creditNoteId);
    const customerId = asMeaningfulString(body?.customerId);
    const orderNumber = asMeaningfulString(body?.orderNumber);
    const reason = asMeaningfulString(body?.reason);
    const issuedBy = asMeaningfulString(body?.issuedBy);
    const statusRequest = asMeaningfulString(body?.status).toLowerCase();
    const rawAmountIncl = body?.amountIncl;
    const amountInclProvided = !(
      rawAmountIncl === undefined ||
      rawAmountIncl === null ||
      (typeof rawAmountIncl === "string" && rawAmountIncl.trim() === "")
    );
    const amountIncl = Number(rawAmountIncl);

    if (!creditNoteId && !orderNumber) {
      return err(400, "Missing Input", "Provide creditNoteId or orderNumber.");
    }

    if (!issuedBy) {
      return err(400, "Missing Input", "issuedBy is required.");
    }

    if (amountInclProvided && (!Number.isFinite(amountIncl) || amountIncl <= 0)) {
      return err(400, "Invalid Input", "amountIncl must be a number greater than 0.");
    }

    const resolved = await resolveCreditNoteRef({ creditNoteId, customerId, orderNumber });
    if (!resolved || !resolved.snap?.exists()) {
      return err(404, "Credit Note Not Found", "Could not locate credit note for provided reference.");
    }

    const before = resolved.snap.data() || {};
    const beforeStatus = String(before?.status || "").toLowerCase();
    const beforeIssued = r2(before?.issued_amount_incl || 0);
    const beforeRemaining = r2(before?.remaining_amount_incl || 0);
    const usedAmount = r2(Math.max(beforeIssued - beforeRemaining, 0));

    if (beforeStatus === "fully_used") {
      return err(
        409,
        "Credit Note Locked",
        "Fully used credit notes cannot be updated."
      );
    }
    if (beforeStatus === "void") {
      return err(
        409,
        "Credit Note Locked",
        "Voided credit notes cannot be updated."
      );
    }

    const wantsVoid = statusRequest === "void";
    if (wantsVoid && usedAmount > 0) {
      return err(
        409,
        "Cannot Void Credit Note",
        "Credit note has used funds and cannot be voided."
      );
    }

    const nextIssued = amountInclProvided ? r2(amountIncl) : beforeIssued;
    if (nextIssued < usedAmount) {
      return err(
        409,
        "Invalid Amount",
        "amountIncl cannot be below already used amount."
      );
    }

    const nextRemaining = wantsVoid ? 0 : r2(Math.max(nextIssued - usedAmount, 0));
    const nextStatus = wantsVoid ? "void" : deriveStatus(usedAmount, nextRemaining);

    const updatePayload = {
      issued_amount_incl: nextIssued,
      remaining_amount_incl: nextRemaining,
      used_amount_incl: usedAmount,
      status: nextStatus,
      updatedAt: now(),
      _updatedAt: serverTimestamp(),
      updatedBy: issuedBy
    };

    if (reason) updatePayload.reason = reason;
    if (wantsVoid) {
      updatePayload.voidedAt = now();
      updatePayload.voidReason = reason || "manual_void";
    }

    await runTransaction(db, async tx => {
      const snap = await tx.get(resolved.ref);
      if (!snap.exists()) return;
      tx.update(resolved.ref, updatePayload);
    });

    const updatedSnap = await getDoc(resolved.ref);
    return ok({
      credit_note: {
        creditNoteId: updatedSnap.id,
        ...updatedSnap.data()
      }
    });
  } catch (e) {
    return err(
      500,
      "Update Credit Note Failed",
      e?.message || "Unexpected error updating credit note."
    );
  }
}
