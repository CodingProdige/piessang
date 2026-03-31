import { getAdminDb } from "@/lib/firebase/admin";
import { buildSupportStatusUpdateCopy, buildSupportTicketMessageDoc } from "@/lib/support/tickets";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function daysSince(iso) {
  const input = toStr(iso);
  if (!input) return 0;
  const ms = Date.now() - new Date(input).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

async function sendEmail(baseUrl, type, to, data) {
  if (!baseUrl || !to) return false;
  try {
    const response = await fetch(`${baseUrl}/api/client/v1/notifications/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, to, data }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function processSupportTicketLifecycle() {
  const db = getAdminDb();
  if (!db) throw new Error("Firebase Admin is not configured.");

  const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
  const reminderDays = Math.max(1, Number(process.env.SUPPORT_TICKET_REMINDER_DAYS || 3));
  const closeDays = Math.max(reminderDays + 1, Number(process.env.SUPPORT_TICKET_AUTO_CLOSE_DAYS || 7));

  const snap = await db.collection("support_tickets_v1").get();
  const results = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const ticket = data?.ticket && typeof data.ticket === "object" ? data.ticket : {};
    const reminders = data?.reminders && typeof data.reminders === "object" ? data.reminders : {};
    const customer = data?.customer && typeof data.customer === "object" ? data.customer : {};

    if (toStr(ticket?.status).toLowerCase() !== "waiting_on_customer") continue;
    if (toStr(ticket?.lastReplyBy).toLowerCase() !== "support") continue;

    const waitingDays = daysSince(ticket?.lastReplyAt || ticket?.updatedAt);
    const customerEmail = toStr(customer?.email);
    const customerName = toStr(customer?.name || "Customer");
    const subject = toStr(ticket?.subject || "Support ticket");

    if (waitingDays >= closeDays) {
      const createdAt = new Date().toISOString();
      const messageRef = docSnap.ref.collection("messages").doc();
      await messageRef.set(
        buildSupportTicketMessageDoc({
          messageId: messageRef.id,
          authorType: "system",
          authorName: "Piessang support",
          body: "This support ticket was closed automatically because we did not receive a reply within the response window.",
          createdAt,
        }),
      );
      await docSnap.ref.set(
        {
          ticket: {
            ...ticket,
            status: "closed",
            active: false,
            closedAt: createdAt,
            updatedAt: createdAt,
            lastReplyAt: createdAt,
            lastReplyBy: "system",
            messagePreview: "Ticket auto-closed after no customer response.",
          },
          reminders: {
            ...reminders,
            autoClosedAt: createdAt,
          },
        },
        { merge: true },
      );
      const copy = buildSupportStatusUpdateCopy("closed");
      await sendEmail(baseUrl, "support-ticket-updated", customerEmail, {
        customerName,
        ticketId: docSnap.id,
        subject,
        statusLabel: copy.title,
        summary: "We closed this ticket because we did not receive a reply within the response window. You can open a new ticket if you still need help.",
        replyPreview: "Ticket auto-closed after no customer response.",
      });
      results.push({ ticketId: docSnap.id, action: "auto_closed", waitingDays });
      continue;
    }

    if (waitingDays >= reminderDays && !toStr(reminders?.closureWarningSentAt)) {
      const sent = await sendEmail(baseUrl, "support-ticket-closing-warning", customerEmail, {
        customerName,
        ticketId: docSnap.id,
        subject,
        daysRemaining: closeDays - waitingDays,
      });
      if (sent) {
        await docSnap.ref.set(
          {
            reminders: {
              ...reminders,
              closureWarningSentAt: new Date().toISOString(),
            },
          },
          { merge: true },
        );
      }
      results.push({ ticketId: docSnap.id, action: sent ? "warning_sent" : "warning_failed", waitingDays });
    }
  }

  return { processed: results.length, results, reminderDays, closeDays };
}
