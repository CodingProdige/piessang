import { findSellerOwnerByCode, findSellerOwnerBySlug } from "@/lib/seller/team-admin";
import { normalizeSellerTeamRole } from "@/lib/seller/team";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function getUserEmail(user = {}) {
  return (
    toStr(user?.email) ||
    toStr(user?.account?.email) ||
    toStr(user?.personal?.email) ||
    ""
  );
}

function isOperationalTeamRole(role) {
  return ["owner", "admin", "manager", "orders"].includes(normalizeSellerTeamRole(String(role || "")));
}

function buildSellerNotificationRecipients(ownerDoc) {
  const recipients = new Map();
  const ownerData = ownerDoc?.data || {};
  const seller = ownerData?.seller && typeof ownerData.seller === "object" ? ownerData.seller : {};
  const team = seller?.team && typeof seller.team === "object" ? seller.team : {};

  const collect = (userRecord, fallback = {}) => {
    const uid = toStr(fallback?.uid || userRecord?.uid || "");
    const email = getUserEmail(userRecord);
    if (!uid && !email) return;
    const key = uid || email;
    recipients.set(key, {
      uid: uid || null,
      email: email || null,
      role: toStr(fallback?.role || userRecord?.seller?.teamRole) || null,
    });
  };

  collect(ownerData, { uid: ownerDoc?.id, role: seller?.teamRole || "owner" });

  const memberEntries = Array.isArray(team?.members) ? team.members : [];
  const grantEntries = Array.isArray(team?.accessGrants) ? team.accessGrants : [];

  for (const member of [...memberEntries, ...grantEntries]) {
    const status = toStr(member?.status || "active").toLowerCase();
    const role = normalizeSellerTeamRole(String(member?.role || "manager"));
    if (status !== "active" || !isOperationalTeamRole(role)) continue;
    const uid = toStr(member?.uid || member?.userUid || member?.memberUid);
    const email = toStr(member?.email || member?.contactEmail);
    const key = uid || email;
    if (!key) continue;
    recipients.set(key, {
      uid: uid || null,
      email: email || null,
      role,
    });
  }

  return Array.from(recipients.values()).filter((recipient) => recipient.email);
}

export function getCancellationCustomerIdentity(order = {}) {
  return {
    email:
      toStr(order?.customer?.email) ||
      toStr(order?.customer_snapshot?.email) ||
      toStr(order?.customer_snapshot?.account?.email) ||
      toStr(order?.customer_snapshot?.personal?.email),
    name:
      toStr(order?.customer?.accountName) ||
      toStr(order?.customer_snapshot?.account?.accountName) ||
      toStr(order?.customer_snapshot?.business?.companyName) ||
      toStr(order?.customer_snapshot?.personal?.fullName) ||
      "Customer",
  };
}

export async function getCancellationSellerRecipients(sellerTargets = []) {
  const all = [];
  for (const target of Array.isArray(sellerTargets) ? sellerTargets : []) {
    const ownerDoc =
      (target?.sellerCode ? await findSellerOwnerByCode(target.sellerCode) : null) ||
      (target?.sellerSlug ? await findSellerOwnerBySlug(target.sellerSlug) : null);
    const recipients = buildSellerNotificationRecipients(ownerDoc);
    for (const recipient of recipients) {
      all.push({
        ...recipient,
        sellerCode: toStr(target?.sellerCode),
        sellerSlug: toStr(target?.sellerSlug),
        vendorName: toStr(target?.vendorName || ownerDoc?.data?.seller?.vendorName || "Seller"),
      });
    }
  }

  const seen = new Set();
  return all.filter((recipient) => {
    const key = `${recipient.sellerCode}:${recipient.sellerSlug}:${recipient.email}`;
    if (!recipient.email || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function sendCancellationEmails({
  origin,
  order = {},
  orderId = "",
  sellerTargets = [],
  customerReason = "",
  refundStarted = false,
  requestOnly = false,
}) {
  const baseOrigin = toStr(origin).replace(/\/+$/, "");
  if (!baseOrigin) return;

  const orderNumber = toStr(order?.order?.orderNumber || orderId);
  const { email: customerEmail, name: customerName } = getCancellationCustomerIdentity(order);

  if (customerEmail) {
    await fetch(`${baseOrigin}/api/client/v1/notifications/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: requestOnly ? "order-cancellation-requested" : "order-cancelled",
        to: customerEmail,
        data: {
          order,
          orderNumber,
          customerName,
          reason: customerReason,
          refundStarted,
        },
      }),
    }).catch(() => null);
  }

  const sellerRecipients = await getCancellationSellerRecipients(sellerTargets);
  await Promise.all(
    sellerRecipients.map((recipient) =>
      fetch(`${baseOrigin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: requestOnly ? "seller-order-cancellation-requested" : "seller-order-cancelled",
          to: recipient.email,
          data: {
            vendorName: recipient.vendorName,
            order,
            orderNumber,
            customerName,
            reason: customerReason,
            refundStarted,
          },
        }),
      }).catch(() => null),
    ),
  );
}
