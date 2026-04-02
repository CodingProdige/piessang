export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

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

const matchesStatus = (note, statusFilter) => {
  if (!statusFilter || statusFilter.length === 0) return true;
  const status = String(note?.status || "").toLowerCase();
  return statusFilter.includes(status);
};

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function sortByRecent(a, b) {
  const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
  const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
  return bTime - aTime;
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const body = await req.json().catch(() => ({}));
    const creditNoteId = asMeaningfulString(body?.creditNoteId);
    const customerId = asMeaningfulString(body?.customerId);
    const orderNumber = asMeaningfulString(body?.orderNumber);
    const rawStatus = Array.isArray(body?.status)
      ? body.status
      : asMeaningfulString(body?.status)
        ? [body.status]
        : [];
    const statusFilter = rawStatus
      .map(s => String(s || "").trim().toLowerCase())
      .filter(Boolean);

    const page = toPositiveInt(body?.page, 1);
    const pageSize = toPositiveInt(body?.pageSize, 50);

    if (!creditNoteId && !customerId && !orderNumber) {
      return err(
        400,
        "Missing Input",
        "Provide at least one of: creditNoteId, customerId, orderNumber."
      );
    }

    if (creditNoteId) {
      const snap = await db.collection("credit_notes_v2").doc(creditNoteId).get();
      if (!snap.exists()) {
        return err(404, "Credit Note Not Found", "No credit note found for provided creditNoteId.");
      }
      const note = { creditNoteId: snap.id, ...snap.data() };
      if (!matchesStatus(note, statusFilter)) {
        return ok({ data: null });
      }
      return ok({ data: note });
    }

    let sourceSnap;
    if (customerId) {
      sourceSnap = await db
        .collection("credit_notes_v2")
        .where("customerId", "==", customerId)
        .limit(500)
        .get();
    } else {
      sourceSnap = await db
        .collection("credit_notes_v2")
        .where("source.orderNumber", "==", orderNumber)
        .limit(500)
        .get();
    }

    let notes = sourceSnap.docs.map(d => ({
      creditNoteId: d.id,
      ...d.data()
    }));

    if (customerId && orderNumber) {
      notes = notes.filter(n => String(n?.source?.orderNumber || "") === orderNumber);
    }
    notes = notes.filter(n => matchesStatus(n, statusFilter)).sort(sortByRecent);

    const total = notes.length;
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
    const safePage = Math.min(page, Math.max(totalPages, 1));
    const start = (safePage - 1) * pageSize;
    const data = notes.slice(start, start + pageSize).map((n, i) => ({
      ...n,
      credit_note_index: start + i + 1
    }));

    return ok({
      data,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages
      }
    });
  } catch (e) {
    return err(
      500,
      "Fetch Credit Notes Failed",
      e?.message || "Unexpected error fetching credit notes."
    );
  }
}
