export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { buildSupportStatusUpdateCopy, buildSupportTicketMessageDoc, isSystemAdminUid } from "@/lib/support/tickets";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to manage your support ticket.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const ticketId = toStr(body?.ticketId);
    const adminClose = body?.adminClose === true;
    const note = toStr(body?.note || (adminClose ? "Ticket closed by Piessang support." : "Ticket closed by customer."));
    if (!ticketId) return err(400, "Missing Ticket", "ticketId is required.");

    const ticketRef = db.collection("support_tickets_v1").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) return err(404, "Ticket Not Found", "We could not find that support ticket.");

    const ticket = ticketSnap.data() || {};
    const isAdmin = adminClose ? await isSystemAdminUid(sessionUser.uid) : false;
    const ownerUid = toStr(ticket?.customer?.uid);
    if (adminClose) {
      if (!isAdmin) return err(403, "Access Denied", "Only Piessang admins can close support tickets for customers.");
    } else if (ownerUid !== sessionUser.uid) {
      return err(403, "Access Denied", "You can only close your own support ticket.");
    }

    const createdAt = new Date().toISOString();
    const messageRef = ticketRef.collection("messages").doc();
    await messageRef.set(
      buildSupportTicketMessageDoc({
        messageId: messageRef.id,
        authorType: adminClose ? "support" : "customer",
        authorUid: sessionUser.uid,
        authorName: adminClose ? "Piessang support" : toStr(ticket?.customer?.name || "Customer"),
        body: note,
        createdAt,
      }),
    );

    await ticketRef.set(
      {
        ticket: {
          ...ticket?.ticket,
          status: "closed",
          active: false,
          closedAt: createdAt,
          updatedAt: createdAt,
          lastReplyAt: createdAt,
          lastReplyBy: adminClose ? "support" : "customer",
          unreadForCustomer: adminClose,
          unreadForSupport: !adminClose,
          messagePreview: note.slice(0, 180),
        },
        closure: {
          closedByUid: sessionUser.uid,
          closedByType: adminClose ? "support" : "customer",
          note,
        },
        metrics: {
          ...ticket?.metrics,
          messageCount: Number(ticket?.metrics?.messageCount || 0) + 1,
        },
      },
      { merge: true },
    );

    const customerEmail = toStr(ticket?.customer?.email);
    if (adminClose && customerEmail) {
      const origin = new URL(req.url).origin;
      const copy = buildSupportStatusUpdateCopy("closed");
      await fetch(`${origin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "support-ticket-updated",
          to: customerEmail,
          data: {
            customerName: toStr(ticket?.customer?.name || "Customer"),
            ticketId,
            subject: toStr(ticket?.ticket?.subject || "Support ticket"),
            statusLabel: copy.title,
            summary: copy.summary,
            replyPreview: note,
          },
        }),
      }).catch(() => null);
    }

    return ok({ ticketId, status: "closed" });
  } catch (error) {
    return err(500, "Close Failed", error?.message || "Unable to close that support ticket.");
  }
}
