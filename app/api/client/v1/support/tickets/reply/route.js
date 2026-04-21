export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import {
  buildSupportStatusUpdateCopy,
  buildSupportTicketMessageDoc,
  getSupportTicketMessages,
  isSystemAdminUid,
  sanitizeSupportMessage,
} from "@/lib/support/tickets";
import { collectSystemAdminNotificationEmails, sendSellerNotificationEmails } from "@/lib/seller/notifications";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to reply to your ticket.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const ticketId = toStr(body?.ticketId);
    const message = sanitizeSupportMessage(body?.message);
    const adminReply = body?.adminReply === true;

    if (!ticketId) return err(400, "Missing Ticket", "ticketId is required.");
    if (!message) return err(400, "Missing Reply", "Please enter your reply before sending.");

    const ticketRef = db.collection("support_tickets_v1").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) return err(404, "Ticket Not Found", "We could not find that support ticket.");

    const ticket = ticketSnap.data() || {};
    const isAdmin = adminReply ? await isSystemAdminUid(sessionUser.uid) : false;
    const ownerUid = toStr(ticket?.customer?.uid);

    if (adminReply) {
      if (!isAdmin) return err(403, "Access Denied", "Only Piessang admins can post support replies.");
    } else if (!ownerUid || ownerUid !== sessionUser.uid) {
      return err(403, "Access Denied", "You can only reply to your own support ticket.");
    }

    const status = toStr(ticket?.ticket?.status).toLowerCase();
    if (status === "closed") {
      return err(409, "Ticket Closed", "This support ticket has already been closed.");
    }

    const createdAt = new Date().toISOString();
    const messageRef = ticketRef.collection("messages").doc();
    const authorType = adminReply ? "support" : "customer";
    await messageRef.set(
      buildSupportTicketMessageDoc({
        messageId: messageRef.id,
        authorType,
        authorUid: sessionUser.uid,
        authorName: adminReply ? "Piessang support" : toStr(ticket?.customer?.name || sessionUser?.displayName || "Customer"),
        body: message,
        createdAt,
      }),
    );

    await ticketRef.set(
      {
        ticket: {
          ...ticket?.ticket,
          status: adminReply ? "waiting_on_customer" : "waiting_on_support",
          updatedAt: createdAt,
          lastReplyAt: createdAt,
          lastReplyBy: adminReply ? "support" : "customer",
          messagePreview: message.slice(0, 180),
          unreadForCustomer: adminReply,
          unreadForSupport: !adminReply,
        },
        reminders: adminReply
          ? {
              closureWarningSentAt: null,
              autoClosedAt: null,
            }
          : ticket?.reminders || {},
        metrics: {
          ...ticket?.metrics,
          messageCount: Number(ticket?.metrics?.messageCount || 0) + 1,
        },
      },
      { merge: true },
    );

    const origin = new URL(req.url).origin;
    const customerEmail = toStr(ticket?.customer?.email);
    const customerName = toStr(ticket?.customer?.name || "Customer");
    const subject = toStr(ticket?.ticket?.subject || "Support ticket");

    if (adminReply && customerEmail) {
      const copy = buildSupportStatusUpdateCopy("waiting_on_customer");
      await fetch(`${origin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "support-ticket-updated",
          to: customerEmail,
          data: {
            customerName,
            ticketId,
            subject,
            statusLabel: copy.title,
            summary: copy.summary,
            replyPreview: message,
          },
        }),
      }).catch(() => null);
    }

    if (!adminReply) {
      const internalEmails = await collectSystemAdminNotificationEmails({ fallbackEmails: ["admin@piessang.com"] });
      await sendSellerNotificationEmails({
        origin,
        type: "support-ticket-customer-reply-internal",
        to: internalEmails,
        data: {
          customerName,
          customerEmail,
          ticketId,
          subject,
          replyPreview: message,
        },
      }).catch(() => []);
    }

    return ok({
      ticketId,
      status: adminReply ? "waiting_on_customer" : "waiting_on_support",
      messages: await getSupportTicketMessages(ticketId),
    });
  } catch (error) {
    return err(500, "Reply Failed", error?.message || "Unable to post your reply.");
  }
}
