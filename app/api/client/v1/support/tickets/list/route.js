export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { getCustomerSupportTickets, getSupportTicketMessages, isSystemAdminUid } from "@/lib/support/tickets";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function GET(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to view support tickets.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const { searchParams } = new URL(req.url);
    const includeMessages = searchParams.get("includeMessages") === "true";
    const adminMode = searchParams.get("adminMode") === "true";
    const status = toStr(searchParams.get("status")).toLowerCase();

    let rows = [];
    if (adminMode) {
      const isAdmin = await isSystemAdminUid(sessionUser.uid);
      if (!isAdmin) return err(403, "Access Denied", "Only Piessang admins can view the support queue.");
      const snap = await db.collection("support_tickets_v1").get();
      rows = snap.docs.map((docSnap) => ({ docId: docSnap.id, ...docSnap.data() }));
      rows.sort((a, b) => {
        const left = Date.parse(toStr(a?.ticket?.updatedAt || a?.ticket?.createdAt));
        const right = Date.parse(toStr(b?.ticket?.updatedAt || b?.ticket?.createdAt));
        return right - left;
      });
    } else {
      rows = await getCustomerSupportTickets(sessionUser.uid);
    }

    if (status && status !== "all") {
      rows = rows.filter((row) => toStr(row?.ticket?.status).toLowerCase() === status);
    }

    const counts = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        const rowStatus = toStr(row?.ticket?.status).toLowerCase();
        if (rowStatus === "open") acc.open += 1;
        if (rowStatus === "waiting_on_support") acc.waitingOnSupport += 1;
        if (rowStatus === "waiting_on_customer") acc.waitingOnCustomer += 1;
        if (rowStatus === "closed") acc.closed += 1;
        if (rowStatus !== "closed") acc.active += 1;
        return acc;
      },
      { total: 0, active: 0, open: 0, waitingOnSupport: 0, waitingOnCustomer: 0, closed: 0 },
    );

    const data = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        messages: includeMessages ? await getSupportTicketMessages(row.docId) : undefined,
      })),
    );

    return ok({ items: data, counts });
  } catch (error) {
    return err(500, "Load Failed", error?.message || "Unable to load support tickets.");
  }
}
