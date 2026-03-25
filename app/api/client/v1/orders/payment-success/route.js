export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { syncOrderSellerSettlements } from "@/lib/seller/settlements";
import { buildPaidStatePatch } from "@/lib/orders/platform-order";
import { findSellerOwnerByCode, findSellerOwnerBySlug } from "@/lib/seller/team-admin";
import { normalizeSellerTeamRole } from "@/lib/seller/team";
import { recordLiveCommerceEvent } from "@/lib/analytics/live-commerce";

/* ───────────────── HELPERS ───────────────── */

const ok = (data = {}, status = 200) =>
  NextResponse.json({ ok: true, data }, { status });

const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

const now = () => new Date().toISOString();

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function getUserEmail(user = {}) {
  return (
    String(user?.email || "").trim() ||
    String(user?.account?.email || "").trim() ||
    String(user?.personal?.email || "").trim() ||
    ""
  );
}

function getUserPhone(user = {}) {
  return (
    String(user?.phoneNumber || "").trim() ||
    String(user?.account?.phoneNumber || "").trim() ||
    String(user?.account?.mobileNumber || "").trim() ||
    String(user?.personal?.phoneNumber || "").trim() ||
    String(user?.personal?.mobileNumber || "").trim() ||
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
    const uid = String(fallback?.uid || userRecord?.uid || "").trim();
    const email = getUserEmail(userRecord);
    const phone = getUserPhone(userRecord);
    if (!uid && !email && !phone) return;
    const key = uid || email || phone;
    recipients.set(key, {
      uid: uid || null,
      email: email || null,
      phone: phone || null,
      role: String(fallback?.role || userRecord?.seller?.teamRole || "").trim() || null,
    });
  };

  collect(ownerData, { uid: ownerDoc?.id, role: seller?.teamRole || "owner" });

  const memberEntries = Array.isArray(team?.members) ? team.members : [];
  const grantEntries = Array.isArray(team?.accessGrants) ? team.accessGrants : [];

  for (const member of [...memberEntries, ...grantEntries]) {
    const status = String(member?.status || "active").trim().toLowerCase();
    const role = normalizeSellerTeamRole(String(member?.role || "manager"));
    if (status !== "active" || !isOperationalTeamRole(role)) continue;
    const uid = String(member?.uid || member?.userUid || member?.memberUid || "").trim();
    const email = String(member?.email || member?.contactEmail || "").trim();
    const phone = String(member?.phoneNumber || member?.mobileNumber || "").trim();
    const key = uid || email || phone;
    if (!key) continue;
    recipients.set(key, {
      uid: uid || null,
      email: email || null,
      phone: phone || null,
      role,
    });
  }

  return Array.from(recipients.values());
}

function getLineSellerIdentity(item) {
  const product = item?.product_snapshot || item?.product || {};
  return {
    sellerCode: String(product?.product?.sellerCode || product?.seller?.sellerCode || "").trim(),
    sellerSlug: String(product?.product?.sellerSlug || product?.seller?.sellerSlug || "").trim(),
    vendorName: String(product?.product?.vendorName || product?.seller?.vendorName || "").trim(),
  };
}

function getLineTitle(item) {
  const product = item?.product_snapshot || item?.product || {};
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return String(product?.product?.title || product?.title || variant?.label || "Product").trim();
}

function getLineVariantLabel(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return String(variant?.label || variant?.variant_id || "").trim();
}

function getLineQty(item) {
  return Math.max(0, Number(item?.quantity || 0));
}

function getLineProductId(item) {
  const product = item?.product_snapshot || item?.product || {};
  return String(
    item?.product_unique_id ||
      product?.product?.unique_id ||
      product?.unique_id ||
      product?.docId ||
      "",
  ).trim();
}

function getLineVariantId(item) {
  const variant = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  return String(
    item?.selected_variant_id ||
      variant?.variant_id ||
      variant?.variantId ||
      "",
  ).trim();
}

/* ───────────────── ENDPOINT ───────────────── */

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { orderId, payment } = await req.json();

    if (!orderId) {
      return err(400, "Missing Order ID", "orderId is required.");
    }

    if (!payment || payment.provider !== "peach") {
      return err(
        400,
        "Invalid Provider",
        "payment.provider must be 'peach'."
      );
    }

    if (!payment.peachTransactionId) {
      return err(
        400,
        "Missing Transaction ID",
        "payment.peachTransactionId is required."
      );
    }

    const chargeType = payment.chargeType || "card";

    if (chargeType !== "card" && chargeType !== "token") {
      return err(
        400,
        "Invalid Charge Type",
        "payment.chargeType must be 'card' or 'token'."
      );
    }

    if (!payment.currency || typeof payment.amount_incl !== "number") {
      return err(
        400,
        "Missing Amount",
        "payment.amount_incl (number) and payment.currency are required."
      );
    }

    /* ───── Load Order ───── */

    const ref = db.collection("orders_v2").doc(orderId);
    const snap = await ref.get();

    if (!snap.exists) {
      return err(404, "Order Not Found", "Invalid orderId.");
    }

    const order = snap.data();

    /* ───── Idempotency Guard ───── */

    const existingAttempts = Array.isArray(order?.payment?.attempts)
      ? order.payment.attempts
      : [];

    const alreadyProcessed = existingAttempts.some(
      a => a?.peachTransactionId === payment.peachTransactionId
    );

    if (alreadyProcessed) {
      return ok({
        orderId,
        status: "already_processed"
      });
    }

    /* ───── Validate order currency & amount ───── */

    const requiredAmount = Number(order?.payment?.required_amount_incl || 0);
    const paidAmount = Number(payment.amount_incl || 0);

    if (paidAmount !== requiredAmount) {
      return err(
        400,
        "Payment Mismatch",
        "Paid amount does not match order required_amount_incl.",
        {
          required_amount_incl: requiredAmount,
          paid_amount_incl: paidAmount
        }
      );
    }

    if (payment.currency !== order?.payment?.currency) {
      return err(
        400,
        "Currency Mismatch",
        "Paid currency does not match order currency.",
        {
          required_currency: order?.payment?.currency,
          paid_currency: payment.currency
        }
      );
    }

    /* ───── Build Attempt (CIT + MIT) ───── */

    const attempt = {
      provider: "peach",
      method: payment.method || "card",
      chargeType,

      threeDSecureId: payment.threeDSecureId || null,

      merchantTransactionId: payment.merchantTransactionId || null,
      peachTransactionId: payment.peachTransactionId,

      token:
        chargeType === "token"
          ? {
              registrationId: payment.token?.registrationId || null,
              cardId: payment.token?.cardId || null
            }
          : null,

      amount_incl: paidAmount,
      currency: payment.currency,
      refund_state: "none",
      refunded_amount_incl: 0,
      remaining_refundable_amount_incl: Number(paidAmount.toFixed(2)),
      status: "charged",
      createdAt: now()
    };

    const nextAttempts = [...existingAttempts, attempt];

    /* ───── Determine editability changes ───── */

    const timestamp = now();
    const updatePayload = {
      ...buildPaidStatePatch(order, {
        provider: "peach",
        method: payment.method || "card",
        chargeType,
        merchantTransactionId: payment.merchantTransactionId || null,
        peachTransactionId: payment.peachTransactionId,
        threeDSecureId: payment.threeDSecureId || null,
        amount_incl: paidAmount,
        currency: payment.currency,
        token:
          chargeType === "token"
            ? {
                registrationId: payment.token?.registrationId || null,
                cardId: payment.token?.cardId || null
              }
            : null,
        timestamp,
      }),
      "payment.attempts": nextAttempts,
      timestamps: {
        ...(order.timestamps || {}),
        updatedAt: timestamp,
        lockedAt: order?.timestamps?.lockedAt || timestamp,
      }
    };

    const paymentDoc = {
      payment: {
        method: payment.method || "card",
        amount_incl: paidAmount,
        remaining_amount_incl: 0,
        currency: payment.currency,
        status: "allocated",
        reference: payment.peachTransactionId || null,
        note: "Card payment captured via Peach."
      },
      customer: {
        customerId: order?.order?.customerId || null,
        customerCode: order?.customer_snapshot?.account?.customerCode || null
      },
      proof: {
        type: "transaction",
        url: null
      },
      allocations: [
        {
          orderId,
          orderNumber: order?.order?.orderNumber || null,
          amount_incl: paidAmount,
          allocatedAt: timestamp
        }
      ],
      timestamps: {
        createdAt: timestamp,
        updatedAt: timestamp
      },
      meta: {
        createdBy: "system"
      }
    };

    await db.collection("payments_v2").add(paymentDoc);

    await ref.update(updatePayload);

    const items = Array.isArray(order?.items) ? order.items : [];
    const productSales = new Map();

    for (const item of items) {
      const productId = getLineProductId(item);
      const variantId = getLineVariantId(item);
      const quantity = getLineQty(item);
      if (!productId || quantity <= 0) continue;

      const existing = productSales.get(productId) || {
        totalUnits: 0,
        variants: new Map(),
      };
      existing.totalUnits += quantity;
      if (variantId) {
        existing.variants.set(variantId, (existing.variants.get(variantId) || 0) + quantity);
      }
      productSales.set(productId, existing);
    }

    for (const [productId, summary] of productSales.entries()) {
      const productRef = db.collection("products_v2").doc(productId);
      const productSnap = await productRef.get();
      if (!productSnap.exists) continue;
      const productData = productSnap.data() || {};
      const currentProductSold = Number(productData?.product?.sales?.total_units_sold || 0);
      const variants = Array.isArray(productData?.variants) ? productData.variants : [];
      const nextVariants = variants.map((variant) => {
        const variantId = String(variant?.variant_id || "").trim();
        if (!variantId || !summary.variants.has(variantId)) return variant;
        const currentVariantSold = Number(variant?.sales?.total_units_sold || 0);
        return {
          ...variant,
          sales: {
            ...(variant?.sales && typeof variant.sales === "object" ? variant.sales : {}),
            total_units_sold: currentVariantSold + Number(summary.variants.get(variantId) || 0),
          },
        };
      });

      await productRef.set(
        {
          product: {
            ...(productData?.product && typeof productData.product === "object" ? productData.product : {}),
            sales: {
              ...(productData?.product?.sales && typeof productData.product.sales === "object" ? productData.product.sales : {}),
              total_units_sold: currentProductSold + Number(summary.totalUnits || 0),
            },
          },
          variants: nextVariants,
        },
        { merge: true },
      );
    }

    await syncOrderSellerSettlements({
      orderId,
      orderNumber: order?.order?.orderNumber || null,
      eventType: "payment_success",
    });

    const originBase = new URL(req.url).origin;
    const sellerGroups = new Map();

    for (const item of items) {
      const identity = getLineSellerIdentity(item);
      const sellerKey = identity.sellerCode || identity.sellerSlug;
      if (!sellerKey) continue;
      if (!sellerGroups.has(sellerKey)) {
        sellerGroups.set(sellerKey, {
          ...identity,
          items: [],
        });
      }
      sellerGroups.get(sellerKey).items.push({
        title: getLineTitle(item),
        variant: getLineVariantLabel(item),
        quantity: getLineQty(item),
      });
    }

    await Promise.all(
      Array.from(sellerGroups.values()).map(async (group) => {
        const sellerOwner =
          (group.sellerCode ? await findSellerOwnerByCode(group.sellerCode) : null) ||
          (group.sellerSlug ? await findSellerOwnerBySlug(group.sellerSlug) : null);
        const sellerData = sellerOwner?.data || {};
        const vendorName = group.vendorName || sellerData?.seller?.vendorName || "Seller";
        const customerName =
          order?.customer?.accountName ||
          order?.customer_snapshot?.account?.accountName ||
          order?.customer_snapshot?.business?.companyName ||
          order?.customer_snapshot?.personal?.fullName ||
          "Customer";
        const recipients = buildSellerNotificationRecipients(sellerOwner);
        const jobs = [];

        for (const recipient of recipients) {
          let recipientEmail = recipient.email || "";
          let recipientPhone = recipient.phone || "";

          if ((!recipientEmail || !recipientPhone) && recipient.uid) {
            try {
              const memberSnap = await db.collection("users").doc(recipient.uid).get();
              if (memberSnap.exists) {
                const memberData = memberSnap.data() || {};
                recipientEmail = recipientEmail || getUserEmail(memberData);
                recipientPhone = recipientPhone || getUserPhone(memberData);
              }
            } catch {
              // Ignore recipient enrichment failures.
            }
          }

          if (recipientEmail) {
            jobs.push(
              fetch(`${originBase}/api/client/v1/notifications/email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "seller-order-received",
                  to: recipientEmail,
                  data: {
                    vendorName,
                    orderNumber: order?.order?.orderNumber || null,
                    customerName,
                    items: group.items,
                  },
                }),
              }).catch(() => null),
            );
          }

          if (recipientPhone) {
            jobs.push(
              fetch(`${originBase}/api/client/v1/notifications/sms`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "seller-new-order",
                  to: recipientPhone,
                  data: {
                    orderNumber: order?.order?.orderNumber || null,
                  },
                }),
              }).catch(() => null),
            );
          }
        }

        await Promise.all(jobs);
      }),
    );

    await recordLiveCommerceEvent("order_paid", {
      orderId,
      orderNumber: order?.order?.orderNumber || null,
      customerId: order?.order?.customerId || order?.customer?.customerId || null,
      amountIncl: paidAmount,
    });

    return ok({
      orderId,
      orderType: order?.order?.type || null,
      paymentStatus: "paid",
      orderStatus: "confirmed",
      editable: false
    });

  } catch (e) {
    return err(500, "Server Error", e.message);
  }
}
