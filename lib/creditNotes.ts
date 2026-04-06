// @ts-nocheck
import crypto from "crypto";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  setDoc
} from "firebase/firestore";
import { db } from "@/lib/firebaseConfig";
import { normalizeMoneyAmount } from "@/lib/money";

const now = () => new Date().toISOString();
const r2 = value => normalizeMoneyAmount(Number(value) || 0);

function asText(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return "";
  return trimmed;
}

async function resolveOrderSnap({ orderId, orderNumber }) {
  if (orderId) {
    const ref = doc(db, "orders_v2", orderId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { ref, snap, orderId: snap.id, orderNumber: snap.data()?.order?.orderNumber || orderNumber || null };
  }

  if (!orderNumber) return null;

  const matches = await getDocs(
    query(collection(db, "orders_v2"), where("order.orderNumber", "==", orderNumber))
  );

  if (matches.empty) return null;
  if (matches.size > 1) {
    throw new Error("multiple_orders");
  }

  const snap = matches.docs[0];
  return {
    ref: snap.ref,
    snap,
    orderId: snap.id,
    orderNumber: snap.data()?.order?.orderNumber || orderNumber
  };
}

export async function resolveOrderRefById(orderId) {
  const resolved = await resolveOrderSnap({ orderId });
  if (!resolved) return null;
  return {
    orderId: resolved.orderId,
    orderNumber: resolved.orderNumber || null,
    ref: resolved.ref,
    snap: resolved.snap,
    order: resolved.snap.data() || {}
  };
}

export async function resolveOrderRefByNumber(orderNumber) {
  const resolved = await resolveOrderSnap({ orderNumber });
  if (!resolved) return null;
  return {
    orderId: resolved.orderId,
    orderNumber: resolved.orderNumber || null,
    ref: resolved.ref,
    snap: resolved.snap,
    order: resolved.snap.data() || {}
  };
}

async function saveCreditNote(noteId, payload) {
  const ref = doc(db, "credit_notes_v2", noteId);
  await setDoc(ref, payload, { merge: true });
  const snap = await getDoc(ref);
  return { creditNoteId: snap.id, ...snap.data() };
}

async function attachCreditNoteToOrder(orderRef, payload) {
  if (!orderRef) return;
  await updateDoc(orderRef, {
    credit_notes: payload,
    "timestamps.updatedAt": now()
  });
}

export async function createManualCreditNote({
  customerId,
  amountIncl,
  reason,
  issuedBy,
  source = {}
}) {
  const creditNoteId = `cn_${crypto.randomUUID().replace(/-/g, "")}`;
  const issuedAmount = r2(amountIncl);
  const note = {
    creditNoteId,
    docId: creditNoteId,
    customerId: asText(customerId),
    reason: asText(reason) || "manual_credit_note",
    issuedBy: asText(issuedBy) || "system",
    source: {
      type: asText(source?.type) || "manual",
      orderId: asText(source?.orderId) || null,
      orderNumber: asText(source?.orderNumber) || null
    },
    status: "open",
    issued_amount_incl: issuedAmount,
    remaining_amount_incl: issuedAmount,
    used_amount_incl: 0,
    createdAt: now(),
    updatedAt: now(),
    _updatedAt: serverTimestamp()
  };

  const saved = await saveCreditNote(creditNoteId, note);

  if (source?.orderId || source?.orderNumber) {
    const resolved = source?.orderId
      ? await resolveOrderRefById(source.orderId)
      : await resolveOrderRefByNumber(source.orderNumber);
    if (resolved?.ref) {
      await attachCreditNoteToOrder(resolved.ref, {
        ...saved,
        type: "manual",
        customerId: note.customerId
      });
    }
  }

  return saved;
}

export async function upsertAutoReturnsExcessCreditNote({
  orderId,
  orderNumber,
  customerId,
  excessAmountIncl,
  issuedBy = "system"
}) {
  const amount = r2(excessAmountIncl);
  if (amount <= 0) return null;

  const resolved = await resolveOrderSnap({ orderId, orderNumber });
  if (!resolved) return null;

  const creditNoteId = `auto_returns_${resolved.orderId}`;
  const existing = await getDoc(doc(db, "credit_notes_v2", creditNoteId));
  const existingData = existing.exists() ? existing.data() || {} : {};
  const usedAmount = r2(existingData?.used_amount_incl || 0);
  const issuedAmount = Math.max(amount, r2(existingData?.issued_amount_incl || 0), usedAmount);
  const remainingAmount = r2(Math.max(issuedAmount - usedAmount, 0));

  const payload = {
    creditNoteId,
    docId: creditNoteId,
    customerId: asText(customerId) || asText(existingData?.customerId) || null,
    issuedBy,
    reason: "auto_returns_excess_credit",
    source: {
      type: "auto_returns_excess_credit",
      orderId: resolved.orderId,
      orderNumber: resolved.orderNumber || orderNumber || null
    },
    status: remainingAmount <= 0 ? "fully_used" : "open",
    issued_amount_incl: issuedAmount,
    remaining_amount_incl: remainingAmount,
    used_amount_incl: usedAmount,
    updatedAt: now(),
    createdAt: existingData?.createdAt || now(),
    _updatedAt: serverTimestamp()
  };

  const saved = await saveCreditNote(creditNoteId, payload);
  await attachCreditNoteToOrder(resolved.ref, {
    creditNoteId: saved.creditNoteId,
    type: "auto_returns_excess_credit",
    amount_incl: amount,
    updatedAt: now()
  });

  return saved;
}

export default {
  createManualCreditNote,
  resolveOrderRefById,
  resolveOrderRefByNumber,
  upsertAutoReturnsExcessCreditNote
};
