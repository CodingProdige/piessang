import { getAdminDb } from "@/lib/firebase/admin";
import { collectSellerNotificationEmails, sendSellerNotificationEmails } from "@/lib/seller/notifications";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatDateKeyInZone(date: Date, timeZone = "Africa/Johannesburg") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formatHumanDate(dateKey: string, timeZone = "Africa/Johannesburg") {
  const date = new Date(`${dateKey}T09:00:00+02:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString("en-ZA", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function subtractDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T09:00:00+02:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() - days);
  return formatDateKeyInZone(date);
}

function shouldSendReminder(status: string, kind: "inbound" | "outbound") {
  const normalized = toStr(status).toLowerCase();
  return kind === "inbound" ? normalized === "scheduled" : normalized === "requested";
}

async function processCollection(params: {
  collectionName: string;
  dateField: "deliveryDate" | "upliftDate";
  reminderKind: "inbound" | "outbound";
  todayKey: string;
  origin: string;
}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");

  const snap = await db.collection(params.collectionName).get();
  const results: Array<{ id: string; action: string; kind: string }> = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const eventDate = toStr(data?.[params.dateField]);
    if (!eventDate) continue;
    if (!shouldSendReminder(toStr(data?.status), params.reminderKind)) continue;

    const dayBeforeKey = subtractDays(eventDate, 1);
    const reminderType =
      params.todayKey === dayBeforeKey
        ? "day_before"
        : params.todayKey === eventDate
          ? "day_of"
          : "";
    if (!reminderType) continue;

    const reminders = data?.reminders && typeof data.reminders === "object" ? data.reminders : {};
    const reminderKey = reminderType === "day_before" ? "sellerDayBeforeSentDate" : "sellerDayOfSentDate";
    if (toStr(reminders?.[reminderKey]) === params.todayKey) {
      results.push({ id: docSnap.id, action: "already_sent", kind: params.reminderKind });
      continue;
    }

    const recipients = await collectSellerNotificationEmails({
      sellerSlug: toStr(data?.sellerSlug || ""),
      fallbackEmails: [],
    });
    if (!recipients.length) {
      results.push({ id: docSnap.id, action: "no_recipients", kind: params.reminderKind });
      continue;
    }

    const scheduleDateLabel = formatHumanDate(eventDate);
    const productTitle = toStr(data?.productTitle || data?.productId || "Product");
    const vendorName = toStr(data?.vendorName || data?.sellerSlug || data?.sellerCode || "Piessang seller");

    const mail = await sendSellerNotificationEmails({
      origin: params.origin,
      type: "seller-warehouse-event-reminder",
      to: recipients,
      data: {
        vendorName,
        productTitle,
        eventKindLabel: params.reminderKind === "inbound" ? "Inbound booking" : "Outbound booking",
        reminderTimingLabel: reminderType === "day_before" ? "Tomorrow" : "Today",
        scheduleDate: scheduleDateLabel,
        reference: toStr(data?.bookingId || data?.upliftmentId || docSnap.id),
        totalUnits: Number(data?.totalUnits || 0),
        notes: toStr(data?.notes || ""),
        reason: toStr(data?.reason || ""),
      },
    });

    const sent = mail.some((entry) => entry?.ok);
    await docSnap.ref.set(
      {
        reminders: {
          ...reminders,
          [reminderKey]: sent ? params.todayKey : toStr(reminders?.[reminderKey] || ""),
          lastSellerReminderAt: sent ? new Date().toISOString() : toStr(reminders?.lastSellerReminderAt || ""),
        },
      },
      { merge: true },
    );

    results.push({ id: docSnap.id, action: sent ? `sent_${reminderType}` : "send_failed", kind: params.reminderKind });
  }

  return results;
}

export async function processSellerWarehouseEventReminders(origin?: string) {
  const baseUrl = toStr(origin || process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://piessang.com").replace(/\/+$/, "");
  const todayKey = formatDateKeyInZone(new Date());

  const [inbound, outbound] = await Promise.all([
    processCollection({
      collectionName: "seller_inbound_bookings",
      dateField: "deliveryDate",
      reminderKind: "inbound",
      todayKey,
      origin: baseUrl,
    }),
    processCollection({
      collectionName: "seller_stock_upliftments",
      dateField: "upliftDate",
      reminderKind: "outbound",
      todayKey,
      origin: baseUrl,
    }),
  ]);

  return {
    todayKey,
    processed: inbound.length + outbound.length,
    inbound,
    outbound,
  };
}
