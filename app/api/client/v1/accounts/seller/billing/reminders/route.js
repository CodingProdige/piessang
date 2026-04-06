export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { formatMoneyExact } from "@/lib/money";
import { SELLER_BILLING_COLLECTION } from "@/lib/seller/billing";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import { applySellerBillingBlock } from "@/lib/seller/billing-enforcement";
import { createSellerNotification } from "@/lib/notifications/seller-inbox";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function daysBetween(now, target) {
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

async function sendReminderEmail({ to, invoiceNumber, dueDate, amountDueIncl, vendorName, billingMonthLabel }) {
  const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
  if (!baseUrl || !to) return { sent: false, reason: "missing_base_url_or_recipient" };

  try {
    const response = await fetch(`${baseUrl}/api/client/v1/notifications/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "seller-billing-reminder",
        to,
        data: {
          invoiceNumber,
          dueDate,
          amountDue: formatMoneyExact(amountDueIncl || 0),
          vendorName,
          billingMonthLabel,
        },
      }),
    });
    return { sent: response.ok };
  } catch {
    return { sent: false, reason: "request_failed" };
  }
}

async function sendReminderSms({ baseUrl, to, uid, invoiceNumber, dueDate, amountDueIncl, vendorName, billingMonthLabel }) {
  if (!baseUrl || !to) return { sent: false, reason: "missing_base_url_or_recipient" };
  try {
    const response = await fetch(`${baseUrl}/api/client/v1/notifications/sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "seller-billing-reminder",
        to,
        uid,
        data: {
          invoiceNumber,
          dueDate,
          amountDue: formatMoneyExact(amountDueIncl || 0),
          vendorName,
          billingMonthLabel,
        },
      }),
    });
    return { sent: response.ok };
  } catch {
    return { sent: false, reason: "request_failed" };
  }
}

async function sendReminderPush({ baseUrl, uid, invoiceNumber, dueDate, amountDueIncl, vendorName, billingMonthLabel, link }) {
  if (!baseUrl || !uid) return { sent: false, reason: "missing_base_url_or_uid" };
  try {
    const response = await fetch(`${baseUrl}/api/client/v1/notifications/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid,
        type: "seller-billing-reminder",
        variables: {
          invoiceNumber,
          dueDate,
          amountDue: formatMoneyExact(amountDueIncl || 0),
          vendorName,
          billingMonthLabel,
          link,
        },
        data: { link },
      }),
    });
    return { sent: response.ok };
  } catch {
    return { sent: false, reason: "request_failed" };
  }
}

async function sendBlockedEmail({ baseUrl, to, vendorName, reasonMessage }) {
  if (!baseUrl || !to) return { sent: false, reason: "missing_base_url_or_recipient" };
  try {
    const response = await fetch(`${baseUrl}/api/client/v1/notifications/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "seller-account-blocked",
        to,
        data: {
          vendorName,
          reasonMessage,
        },
      }),
    });
    return { sent: response.ok };
  } catch {
    return { sent: false, reason: "request_failed" };
  }
}

async function sendBlockedSms({ baseUrl, to, uid, vendorName, reasonMessage }) {
  if (!baseUrl || !to) return { sent: false, reason: "missing_base_url_or_recipient" };
  try {
    const response = await fetch(`${baseUrl}/api/client/v1/notifications/sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "seller-account-blocked",
        to,
        uid,
        data: {
          vendorName,
          reasonMessage,
        },
      }),
    });
    return { sent: response.ok };
  } catch {
    return { sent: false, reason: "request_failed" };
  }
}

async function sendBlockedPush({ baseUrl, uid, vendorName, reasonMessage, link }) {
  if (!baseUrl || !uid) return { sent: false, reason: "missing_base_url_or_uid" };
  try {
    const response = await fetch(`${baseUrl}/api/client/v1/notifications/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid,
        type: "seller-account-blocked",
        variables: {
          vendorName,
          reasonMessage,
          link,
        },
        data: { link },
      }),
    });
    return { sent: response.ok };
  } catch {
    return { sent: false, reason: "request_failed" };
  }
}

export async function POST() {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to process billing reminders.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    if (!isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "Only system admins can process seller billing reminders.");
    }

    const cyclesSnap = await db.collection(SELLER_BILLING_COLLECTION).get();
    const now = new Date();
    const results = [];
    const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "";

    for (const docSnap of cyclesSnap.docs) {
      const cycle = docSnap.data() || {};
      const dueDate = new Date(cycle?.dueDate || "");
      if (Number.isNaN(dueDate.getTime())) continue;
      if (Number(cycle?.totals?.amountDueIncl || 0) <= 0) continue;
      if (String(cycle?.status || "").toLowerCase() === "paid" || String(cycle?.status || "").toLowerCase() === "settled") continue;

      const daysRemaining = daysBetween(now, dueDate);
      const sellerCode = toStr(cycle?.sellerCode);
      const sellerSlug = toStr(cycle?.sellerSlug);
      const sellerUserSnap = await db.collection("users").get();

      let sellerDocRef = null;
      let sellerDocData = null;
      sellerUserSnap.forEach((userDoc) => {
        if (sellerDocRef) return;
        const data = userDoc.data() || {};
        const seller = data?.seller && typeof data.seller === "object" ? data.seller : {};
        const code = toStr(seller?.sellerCode || data?.sellerCode);
        const slug = toStr(seller?.sellerSlug || data?.sellerSlug);
        if ((sellerCode && code.toLowerCase() === sellerCode.toLowerCase()) || (sellerSlug && slug.toLowerCase() === sellerSlug.toLowerCase())) {
          sellerDocRef = userDoc.ref;
          sellerDocData = data;
        }
      });

      const billingLink = sellerSlug
        ? `/seller/dashboard?seller=${encodeURIComponent(sellerSlug)}&section=billing`
        : "/seller/dashboard?section=billing";
      const vendorName =
        cycle?.vendorName ||
        sellerDocData?.sellerVendorName ||
        sellerDocData?.accountName ||
        "Seller";
      const reminderOffsets = cycle?.reminders?.sentReminderOffsets && typeof cycle.reminders.sentReminderOffsets === "object"
        ? cycle.reminders.sentReminderOffsets
        : {};

      if (daysRemaining <= 0 && sellerDocRef) {
        const reasonMessage = "Your seller account is suspended until the outstanding monthly billing amount is settled.";
        await applySellerBillingBlock({
          sellerCode,
          sellerSlug,
          reasonMessage,
          blockedBy: "billing-automation",
          blockedAt: now.toISOString(),
        });

        if (!toStr(cycle?.reminders?.blockedNotifiedAt)) {
          await createSellerNotification({
            sellerCode,
            sellerSlug,
            type: "seller-billing-overdue",
            title: "Billing overdue",
            message: `Your ${cycle?.billingMonthLabel || "current"} seller bill is overdue. Pay it now to restore selling access.`,
            href: billingLink,
            metadata: {
              billingId: docSnap.id,
              invoiceNumber: cycle?.invoice?.invoiceNumber || docSnap.id,
              amountDueIncl: cycle?.totals?.amountDueIncl || 0,
            },
          }).catch(() => null);

          await Promise.all([
            sendBlockedEmail({
              baseUrl,
              to: sellerDocData?.email || "",
              vendorName,
              reasonMessage,
            }),
            sendBlockedSms({
              baseUrl,
              to: sellerDocData?.account?.phoneNumber || sellerDocData?.phoneNumber || sellerDocData?.phone || "",
              uid: sellerDocRef.id,
              vendorName,
              reasonMessage,
            }),
            sendBlockedPush({
              baseUrl,
              uid: sellerDocRef.id,
              vendorName,
              reasonMessage,
              link: billingLink,
            }),
          ]);
        }

        await docSnap.ref.set(
          {
            status: "overdue",
            reminders: {
              lastProcessedAt: now.toISOString(),
              blockedNotifiedAt: cycle?.reminders?.blockedNotifiedAt || now.toISOString(),
            },
          },
          { merge: true },
        );

        results.push({ billingId: docSnap.id, action: "blocked", sellerCode, sellerSlug });
        continue;
      }

      if (daysRemaining >= 1 && daysRemaining <= 7 && !toStr(reminderOffsets?.[String(daysRemaining)])) {
        const invoiceNumber = cycle?.invoice?.invoiceNumber || docSnap.id;
        const dueDate = cycle?.dueDate;
        const amountDueIncl = cycle?.totals?.amountDueIncl || 0;
        const billingMonthLabel = cycle?.billingMonthLabel || cycle?.monthKey || "";
        const [mail, sms, push] = await Promise.all([
          sendReminderEmail({
            to: sellerDocData?.email || "",
            invoiceNumber,
            dueDate,
            amountDueIncl,
            vendorName,
            billingMonthLabel,
          }),
          sendReminderSms({
            baseUrl,
            to: sellerDocData?.account?.phoneNumber || sellerDocData?.phoneNumber || sellerDocData?.phone || "",
            uid: sellerDocRef?.id || "",
            invoiceNumber,
            dueDate,
            amountDueIncl,
            vendorName,
            billingMonthLabel,
          }),
          sendReminderPush({
            baseUrl,
            uid: sellerDocRef?.id || "",
            invoiceNumber,
            dueDate,
            amountDueIncl,
            vendorName,
            billingMonthLabel,
            link: billingLink,
          }),
        ]);

        await createSellerNotification({
          sellerCode,
          sellerSlug,
          type: "seller-billing-reminder",
          title: `Billing due in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`,
          message: `Your ${billingMonthLabel || "current"} seller bill of ${formatMoneyExact(amountDueIncl)} is due by ${dueDate}.`,
          href: billingLink,
          metadata: {
            billingId: docSnap.id,
            invoiceNumber,
            amountDueIncl,
            daysRemaining,
          },
        }).catch(() => null);

        await docSnap.ref.set(
          {
            reminders: {
              lastSentAt: mail.sent || sms.sent || push.sent ? now.toISOString() : cycle?.reminders?.lastSentAt || null,
              lastProcessedAt: now.toISOString(),
              sentReminderOffsets: {
                ...reminderOffsets,
                [String(daysRemaining)]: now.toISOString(),
              },
            },
          },
          { merge: true },
        );

        results.push({ billingId: docSnap.id, action: mail.sent || sms.sent || push.sent ? "reminder_sent" : "reminder_skipped", sellerCode, sellerSlug });
      }
    }

    return ok({ processed: results.length, results });
  } catch (e) {
    console.error("seller billing reminders failed:", e);
    return err(500, "Unexpected Error", "Unable to process seller billing reminders.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
