export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import {
  ACTIVE_SUPPORT_TICKET_STATUSES,
  buildSupportTicketDoc,
  buildSupportTicketMessageDoc,
  getActiveSupportTicket,
  sanitizeSupportMessage,
  slugifySupportCategory,
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
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in to submit a support ticket.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const issueType = toStr(body?.issueType);
    const otherIssue = toStr(body?.otherIssue);
    const derivedSubject = issueType === "other" ? otherIssue : issueType.replace(/_/g, " ");
    const subject = toStr(body?.subject || derivedSubject);
    const category = slugifySupportCategory(body?.category);
    const message = sanitizeSupportMessage(body?.message);
    const customerEmail = toStr(sessionUser?.email || body?.email);
    const customerName = toStr(body?.customerName || sessionUser?.displayName || sessionUser?.name || "Customer");

    if (!subject) return err(400, "Missing Subject", "Please add a short subject for your ticket.");
    if (!message) return err(400, "Missing Details", "Please tell us how we can help.");

    const active = await getActiveSupportTicket(sessionUser.uid);
    if (active) {
      return err(409, "Active Ticket Already Open", "You already have an active support ticket. Please continue that conversation instead of opening a new one.", {
        ticketId: active.docId,
        status: active?.ticket?.status || "open",
        activeStatuses: ACTIVE_SUPPORT_TICKET_STATUSES,
      });
    }

    const createdAt = new Date().toISOString();
    const ticketRef = db.collection("support_tickets_v1").doc();
    const messageRef = ticketRef.collection("messages").doc();
    const ticketDoc = buildSupportTicketDoc({
      ticketId: ticketRef.id,
      uid: sessionUser.uid,
      email: customerEmail,
      customerName,
      subject,
      category,
      message,
      createdAt,
    });
    const ticketMessage = buildSupportTicketMessageDoc({
      messageId: messageRef.id,
      authorType: "customer",
      authorUid: sessionUser.uid,
      authorName: customerName,
      body: message,
      createdAt,
    });

    await ticketRef.set(ticketDoc);
    await messageRef.set(ticketMessage);

    const origin = new URL(req.url).origin;
    const internalEmails = await collectSystemAdminNotificationEmails({ fallbackEmails: ["admin@piessang.com"] });
    await sendSellerNotificationEmails({
      origin,
      type: "support-ticket-created-internal",
      to: internalEmails,
      data: {
        customerName,
        customerEmail,
        ticketId: ticketRef.id,
        subject,
        category,
        issueType: issueType || category,
        message,
      },
    }).catch(() => []);

    if (customerEmail) {
      await fetch(`${origin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "support-ticket-created",
          to: customerEmail,
          data: {
            customerName,
            ticketId: ticketRef.id,
            subject,
            category,
          },
        }),
      }).catch(() => null);
    }

    return ok({
      ticketId: ticketRef.id,
      status: "open",
    }, 201);
  } catch (error) {
    return err(500, "Ticket Failed", error?.message || "Unable to create your support ticket.");
  }
}
