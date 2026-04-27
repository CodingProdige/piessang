import { getAdminDb } from "@/lib/firebase/admin";
import { buildShippingSettingsFromLegacySeller, validateShippingSettings } from "@/lib/shipping/settings";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

async function sendReminderEmail({ baseUrl, to, vendorName, hiddenCount }) {
  if (!baseUrl || !to) return { sent: false, reason: "missing_base_url_or_recipient" };
  try {
    const response = await fetch(`${baseUrl}/api/client/v1/notifications/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "seller-delivery-settings-reminder",
        to,
        data: { vendorName, hiddenCount },
      }),
    });
    return { sent: response.ok };
  } catch {
    return { sent: false, reason: "request_failed" };
  }
}

export async function processSellerShippingSettingsReminders() {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Server Firestore access is not configured.");
  }

  const [usersSnap, productsSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("products_v2").get(),
  ]);

  const usersBySeller = new Map();
  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data() || {};
    const seller = data?.seller && typeof data.seller === "object" ? data.seller : {};
    const sellerSlug = toStr(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug);
    const sellerCode = toStr(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode);
    if (!sellerSlug && !sellerCode) continue;
    usersBySeller.set(sellerSlug || sellerCode, { ref: userDoc.ref, id: userDoc.id, data });
    if (sellerCode) usersBySeller.set(sellerCode, { ref: userDoc.ref, id: userDoc.id, data });
  }

  const hiddenCounts = new Map();
  for (const productDoc of productsSnap.docs) {
    const data = productDoc.data() || {};
    const fulfillmentMode = String(data?.fulfillment?.mode ?? "seller").trim().toLowerCase();
    if (fulfillmentMode !== "seller") continue;
    const sellerKey = toStr(
      data?.product?.sellerCode ||
      data?.seller?.sellerCode ||
      data?.product?.sellerSlug ||
      data?.seller?.sellerSlug,
    );
    if (!sellerKey) continue;
    hiddenCounts.set(sellerKey, Number(hiddenCounts.get(sellerKey) || 0) + 1);
  }

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "";
  const results = [];

  for (const [sellerKey, hiddenCount] of hiddenCounts.entries()) {
    const owner = usersBySeller.get(sellerKey);
    if (!owner) continue;

    const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
    if (validateShippingSettings(buildShippingSettingsFromLegacySeller(seller)).valid) continue;

    const reminders = seller?.shippingSettingsReminders && typeof seller.shippingSettingsReminders === "object"
      ? seller.shippingSettingsReminders
      : seller?.deliverySettingsReminders && typeof seller.deliverySettingsReminders === "object"
        ? seller.deliverySettingsReminders
        : {};

    if (toStr(reminders?.lastSentDate) === todayKey) {
      results.push({ sellerKey, action: "already_sent_today", hiddenCount });
      continue;
    }

    const email = toStr(owner.data?.email || owner.data?.account?.email || owner.data?.personal?.email);
    const vendorName = toStr(seller?.vendorName || seller?.groupVendorName || owner.data?.account?.accountName || "Seller");
    const mail = await sendReminderEmail({ baseUrl, to: email, vendorName, hiddenCount });

    await owner.ref.set(
      {
        seller: {
          ...seller,
          shippingSettingsReminders: {
            lastSentAt: mail.sent ? now.toISOString() : reminders?.lastSentAt || null,
            lastSentDate: mail.sent ? todayKey : reminders?.lastSentDate || null,
            hiddenCount,
          },
        },
      },
      { merge: true },
    );

    results.push({ sellerKey, hiddenCount, action: mail.sent ? "sent" : "skipped" });
  }

  return { processed: results.length, results };
}

