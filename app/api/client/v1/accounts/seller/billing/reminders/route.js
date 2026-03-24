export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { SELLER_BILLING_COLLECTION } from "@/lib/seller/billing";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";

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
          amountDue: `R${Number(amountDueIncl || 0).toFixed(2)}`,
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

      if (daysRemaining <= 0 && sellerDocRef) {
        await sellerDocRef.set(
          {
            seller: {
              ...(sellerDocData?.seller || {}),
              status: "blocked",
              blockedReasonCode: "payment_issue",
              blockedReasonMessage: "Your seller account is suspended until the outstanding monthly billing amount is settled.",
              blockedAt: now.toISOString(),
              blockedBy: "billing-automation",
            },
          },
          { merge: true },
        );

        await docSnap.ref.set(
          {
            status: "overdue",
            reminders: {
              lastProcessedAt: now.toISOString(),
            },
          },
          { merge: true },
        );

        results.push({ billingId: docSnap.id, action: "blocked", sellerCode, sellerSlug });
        continue;
      }

      if (daysRemaining >= 1 && daysRemaining <= 7 && sellerDocData?.email) {
        const mail = await sendReminderEmail({
          to: sellerDocData.email,
          invoiceNumber: cycle?.invoice?.invoiceNumber || docSnap.id,
          dueDate: cycle?.dueDate,
          amountDueIncl: cycle?.totals?.amountDueIncl || 0,
          vendorName: cycle?.vendorName || sellerDocData?.sellerVendorName || sellerDocData?.accountName || "Seller",
          billingMonthLabel: cycle?.billingMonthLabel || cycle?.monthKey || "",
        });

        await docSnap.ref.set(
          {
            reminders: {
              lastSentAt: mail.sent ? now.toISOString() : cycle?.reminders?.lastSentAt || null,
              lastProcessedAt: now.toISOString(),
            },
          },
          { merge: true },
        );

        results.push({ billingId: docSnap.id, action: mail.sent ? "reminder_sent" : "reminder_skipped", sellerCode, sellerSlug });
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

