export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { syncOrderSellerSettlements } from "@/lib/seller/settlements";
import { buildPaidStatePatch } from "@/lib/orders/platform-order";
import { findSellerOwnerByCode, findSellerOwnerBySlug } from "@/lib/seller/team-admin";
import { normalizeSellerTeamRole } from "@/lib/seller/team";
import { recordLiveCommerceEvent } from "@/lib/analytics/live-commerce";
import { ensureOrderInvoice } from "@/lib/orders/invoices";
import { getFrozenLineTotalIncl } from "@/lib/orders/frozen-money";
import { normalizeMoneyAmount } from "@/lib/money";
import { appendOrderTimelineEvent, createOrderTimelineEvent } from "@/lib/orders/timeline";
import { stripeRequest } from "@/lib/payments/stripe";
import { buildCardPresentationMetadata } from "@/lib/payments/card-presentation";
import { recordProductSalesMetrics } from "@/lib/analytics/product-engagement";
import { markCheckoutSessionCompleted } from "@/lib/checkout/sessions";
import { createGuestOrderAccessToken } from "@/lib/orders/guest-access";

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

function getLineRevenueIncl(item) {
  return getFrozenLineTotalIncl(item);
}

const FINALIZATION_LOCK_WINDOW_MS = 2 * 60 * 1000;

function parseIsoMs(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/* ───────────────── ENDPOINT ───────────────── */

export async function POST(req) {
  let lockedOrderRef = null;
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { orderId, payment } = await req.json();

    if (!orderId) {
      return err(400, "Missing Order ID", "orderId is required.");
    }

    const provider = toStr(payment?.provider || "").toLowerCase();
    if (!payment || (provider !== "peach" && provider !== "stripe")) {
      return err(
        400,
        "Invalid Provider",
        "payment.provider must be 'peach' or 'stripe'."
      );
    }

    if (provider === "peach" && !payment.peachTransactionId) {
      return err(400, "Missing Transaction ID", "payment.peachTransactionId is required.");
    }

    if (provider === "stripe" && !payment.stripeSessionId && !payment.stripePaymentIntentId) {
      return err(400, "Missing Stripe Reference", "payment.stripeSessionId or payment.stripePaymentIntentId is required.");
    }

    const chargeType = payment.chargeType || (provider === "stripe" ? "embedded_checkout" : "card");

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

    let order = snap.data();
    const createIntentKey =
      typeof order?.meta?.createIntentKey === "string" ? order.meta.createIntentKey.trim() : "";

    /* ───── Idempotency Guard ───── */

    const existingAttempts = Array.isArray(order?.payment?.attempts) ? order.payment.attempts : [];
    const transactionIdentity =
      provider === "stripe"
        ? toStr(payment.stripeSessionId || payment.stripePaymentIntentId || payment.merchantTransactionId || "")
        : toStr(payment.peachTransactionId || payment.merchantTransactionId || "");

    const alreadyProcessed = existingAttempts.some(
      (attempt) =>
        toStr(
          provider === "stripe"
            ? attempt?.stripeSessionId || attempt?.stripePaymentIntentId || attempt?.merchantTransactionId
            : attempt?.peachTransactionId || attempt?.merchantTransactionId,
        ) === transactionIdentity
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

    /* ───── Finalization lock ───── */

    const lockTimestamp = now();
    const lockOutcome = await db.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(ref);
      if (!freshSnap.exists) {
        throw new Error("order_not_found_during_finalization");
      }

      const freshOrder = freshSnap.data() || {};
      const freshAttempts = Array.isArray(freshOrder?.payment?.attempts)
        ? freshOrder.payment.attempts
        : [];
      const freshPaymentStatus = toStr(
        freshOrder?.lifecycle?.paymentStatus ||
          freshOrder?.payment?.status ||
          freshOrder?.order?.status?.payment ||
          "",
      ).toLowerCase();
      const alreadyHandled = freshAttempts.some(
        (attempt) =>
          toStr(
            provider === "stripe"
              ? attempt?.stripeSessionId || attempt?.stripePaymentIntentId || attempt?.merchantTransactionId
              : attempt?.peachTransactionId || attempt?.merchantTransactionId,
          ) === transactionIdentity,
      );

      if (alreadyHandled || freshPaymentStatus === "paid") {
        return { status: "already_processed", order: freshOrder };
      }

      const finalizationMeta =
        freshOrder?.meta?.paymentFinalization && typeof freshOrder.meta.paymentFinalization === "object"
          ? freshOrder.meta.paymentFinalization
          : {};
      const lockState = toStr(finalizationMeta?.state || "").toLowerCase();
      const lockAge = Date.now() - parseIsoMs(finalizationMeta?.startedAt);
      if (lockState === "processing" && lockAge >= 0 && lockAge < FINALIZATION_LOCK_WINDOW_MS) {
        return { status: "processing", order: freshOrder };
      }

      transaction.update(ref, {
        "meta.paymentFinalization": {
          state: "processing",
          provider,
          transactionIdentity: transactionIdentity || null,
          startedAt: lockTimestamp,
          updatedAt: lockTimestamp,
          failedAt: null,
          error: null,
        },
      });

      return { status: "locked", order: freshOrder };
    });

    if (lockOutcome.status === "already_processed") {
      return ok({ orderId, status: "already_processed" });
    }

    if (lockOutcome.status === "processing") {
      return ok({ orderId, status: "processing" });
    }

    lockedOrderRef = ref;
    order = lockOutcome.order;

    /* ───── Build Attempt (CIT + MIT) ───── */

    const attempt = {
      provider,
      method: payment.method || "card",
      chargeType,

      threeDSecureId: provider === "peach" ? payment.threeDSecureId || null : null,

      merchantTransactionId: payment.merchantTransactionId || null,
      peachTransactionId: provider === "peach" ? payment.peachTransactionId : null,
      stripeSessionId: provider === "stripe" ? payment.stripeSessionId || null : null,
      stripePaymentIntentId: provider === "stripe" ? payment.stripePaymentIntentId || null : null,

      token:
        provider === "peach" && chargeType === "token"
          ? {
              registrationId: payment.token?.registrationId || null,
              cardId: payment.token?.cardId || null
            }
          : null,

      amount_incl: paidAmount,
      currency: payment.currency,
      refund_state: "none",
      refunded_amount_incl: 0,
      remaining_refundable_amount_incl: normalizeMoneyAmount(paidAmount),
      status: "charged",
      createdAt: now()
    };

    const nextAttempts = [...existingAttempts, attempt];

    /* ───── Determine editability changes ───── */

    const timestamp = now();
    const updatePayload = {
      ...buildPaidStatePatch(order, {
        provider,
        method: payment.method || "card",
        chargeType,
        merchantTransactionId: payment.merchantTransactionId || null,
        peachTransactionId: provider === "peach" ? payment.peachTransactionId : null,
        stripeSessionId: provider === "stripe" ? payment.stripeSessionId || null : null,
        stripePaymentIntentId: provider === "stripe" ? payment.stripePaymentIntentId || null : null,
        threeDSecureId: provider === "peach" ? payment.threeDSecureId || null : null,
        amount_incl: paidAmount,
        currency: payment.currency,
        token:
          provider === "peach" && chargeType === "token"
            ? {
                registrationId: payment.token?.registrationId || null,
                cardId: payment.token?.cardId || null
              }
            : null,
        timestamp,
      }),
      "payment.attempts": nextAttempts,
      "meta.paymentFinalization": {
        state: "completed",
        provider,
        transactionIdentity: transactionIdentity || null,
        startedAt: lockTimestamp,
        updatedAt: timestamp,
        completedAt: timestamp,
        failedAt: null,
        error: null,
      },
    };
    updatePayload["timeline.events"] = appendOrderTimelineEvent(
      order,
      createOrderTimelineEvent({
        type: "payment_success",
        title: "Payment received",
        message: `${provider === "stripe" ? "Stripe" : "Peach"} successfully captured payment for this order.`,
        actorType: "system",
        actorLabel: "Piessang",
        createdAt: timestamp,
        status: "confirmed",
        metadata: {
          provider,
          amountIncl: paidAmount,
          currency: payment.currency,
        },
      }),
    );
    updatePayload["timeline.updatedAt"] = timestamp;

    const paymentDoc = {
      payment: {
        method: payment.method || "card",
        amount_incl: paidAmount,
        remaining_amount_incl: 0,
        currency: payment.currency,
        status: "allocated",
        reference:
          provider === "stripe"
            ? payment.stripePaymentIntentId || payment.stripeSessionId || null
            : payment.peachTransactionId || null,
        note:
          provider === "stripe"
            ? "Card payment captured via Stripe Embedded Checkout."
            : "Card payment captured via Peach."
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

    const checkoutSessionId = toStr(order?.meta?.checkoutSessionId || "");
    if (checkoutSessionId) {
      await markCheckoutSessionCompleted({
        sessionId: checkoutSessionId,
        orderId,
        merchantTransactionId: toStr(payment?.merchantTransactionId || order?.order?.merchantTransactionId || ""),
      }).catch(() => null);
    }

    if (provider === "stripe") {
      const customerId = toStr(
        order?.payment?.stripeCustomerId ||
          order?.payment_summary?.stripeCustomerId ||
          order?.customer?.stripeCustomerId ||
          "",
      );
      const paymentIntentId = toStr(payment?.stripePaymentIntentId || payment?.stripeSessionId || "");
      const orderCustomerId = toStr(order?.order?.customerId || order?.customer?.customerId || "");
      if (customerId && paymentIntentId && orderCustomerId) {
        try {
          const intent = await stripeRequest(`/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`);
          const paymentMethodId = toStr(intent?.payment_method || "");
          const cardBrand = toStr(intent?.charges?.data?.[0]?.payment_method_details?.card?.brand || "");
          const last4 = toStr(intent?.charges?.data?.[0]?.payment_method_details?.card?.last4 || "");
          if (paymentMethodId) {
            const cardPresentation = buildCardPresentationMetadata({
              cardId: paymentMethodId,
              brand: cardBrand,
              last4,
            });
            await db.collection("users").doc(orderCustomerId).set(
              {
                paymentMethods: {
                  cardPresentation: {
                    [paymentMethodId]: {
                      ...cardPresentation,
                      brand: cardBrand ? cardBrand.toUpperCase() : null,
                      last4: last4 || null,
                    },
                  },
                  updatedAt: timestamp,
                },
              },
              { merge: true },
            );
          }
        } catch (error) {
          console.error("stripe card presentation sync failed:", error);
        }
      }
    }

    if (createIntentKey) {
      await db.collection("idempotency_order_create_v2").doc(createIntentKey).delete().catch(() => null);
    }

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

    await recordProductSalesMetrics(items, { reason: "payment_success" }).catch((metricsError) => {
      console.error("product sales metrics update failed:", metricsError);
    });

    await syncOrderSellerSettlements({
      orderId,
      orderNumber: order?.order?.orderNumber || null,
      eventType: "payment_success",
    });

    await ensureOrderInvoice({
      db,
      orderId,
      generatedBy: "payment_success",
      issuedAt: timestamp,
    }).catch((invoiceError) => {
      console.error("order invoice creation failed:", invoiceError);
    });

    const customerEmail =
      toStr(order?.customer?.email) ||
      toStr(order?.customer_snapshot?.email) ||
      toStr(order?.customer_snapshot?.account?.email) ||
      toStr(order?.customer_snapshot?.personal?.email);
    const customerName =
      toStr(order?.customer?.accountName) ||
      toStr(order?.customer_snapshot?.account?.accountName) ||
      toStr(order?.customer_snapshot?.business?.companyName) ||
      toStr(order?.customer_snapshot?.personal?.fullName) ||
      "Customer";
    const guestOrderAccessToken =
      toStr(order?.order?.customerId).toLowerCase().startsWith("cart_guest_") && customerEmail
        ? createGuestOrderAccessToken({
            orderId,
            email: customerEmail,
          })
        : "";
    const guestOrderAccessUrl = guestOrderAccessToken
      ? `${originBase}/guest/orders/${encodeURIComponent(guestOrderAccessToken)}`
      : "";

    if (customerEmail) {
      fetch(`${originBase}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "order-confirmation",
          to: customerEmail,
          data: {
            order,
            orderNumber: order?.order?.orderNumber || null,
            customerName,
            customerEmail,
            amount: normalizeMoneyAmount(payment?.amount_incl ?? order?.payment?.amount_incl ?? 0).toFixed(2),
            currency: toStr(payment?.currency || order?.payment?.currency || "ZAR").toUpperCase(),
            message: "Your order has been received and your payment was confirmed successfully.",
            guestOrderAccessUrl: guestOrderAccessUrl || null,
          },
        }),
      }).catch((notificationError) => {
        console.error("customer order confirmation email failed:", notificationError);
      });
    }

    const customerId = toStr(order?.order?.customerId || order?.customer?.customerId || "");
    if (customerId) {
      const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const clicksSnap = await db
        .collection("campaign_clicks_v1")
        .where("userId", "==", customerId)
        .where("createdAt", ">=", windowStart)
        .get()
        .catch(() => null);

      const clickDocs = clicksSnap?.docs ?? [];
      if (clickDocs.length) {
        const latestByProduct = new Map();
        for (const doc of clickDocs) {
          const click = doc.data() || {};
          const productId = getLineProductId({ product_unique_id: click?.productId });
          if (!productId) continue;
          const current = latestByProduct.get(productId);
          if (!current || String(click?.createdAt || "") > String(current?.createdAt || "")) {
            latestByProduct.set(productId, { id: doc.id, ...click });
          }
        }

        for (const item of items) {
          const productId = getLineProductId(item);
          const attributedClick = latestByProduct.get(productId);
          if (!productId || !attributedClick?.campaignId) continue;

          const quantity = getLineQty(item);
          const revenueIncl = normalizeMoneyAmount(getLineRevenueIncl(item));

          await db.collection("campaign_conversions_v1").add({
            campaignId: attributedClick.campaignId,
            clickId: attributedClick.id || null,
            orderId,
            orderNumber: order?.order?.orderNumber || null,
            userId: customerId,
            productId,
            variantId: getLineVariantId(item) || null,
            quantity,
            revenueIncl,
            attributedBy: "last_click",
            createdAt: timestamp,
            _createdAt: timestamp,
          });

          await db.collection("campaign_daily_stats_v1").doc(`${String(attributedClick.campaignId)}:${timestamp.slice(0, 10)}`).set(
            {
              campaignId: String(attributedClick.campaignId),
              dayKey: timestamp.slice(0, 10),
              conversions: FieldValue.increment(1),
              revenue: FieldValue.increment(revenueIncl),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );

          await db.collection("campaigns_v1").doc(String(attributedClick.campaignId)).set(
            {
              analytics: {
                conversions: FieldValue.increment(1),
                revenue: FieldValue.increment(revenueIncl),
              },
              dailyMetrics: {
                dayKey: timestamp.slice(0, 10),
                conversionsToday: FieldValue.increment(1),
                revenueToday: FieldValue.increment(revenueIncl),
              },
              timestamps: {
                updatedAt: timestamp,
              },
            },
            { merge: true },
          );
        }
      }
    }

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
    if (lockedOrderRef) {
      const failedAt = now();
      await lockedOrderRef
        .set(
          {
            meta: {
              paymentFinalization: {
                state: "failed",
                failedAt,
                updatedAt: failedAt,
                error: e?.message || "payment_finalization_failed",
              },
            },
          },
          { merge: true },
        )
        .catch(() => null);
    }
    return err(500, "Server Error", e.message);
  }
}
