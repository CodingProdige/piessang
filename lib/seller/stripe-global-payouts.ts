// @ts-nocheck
import { getAdminDb } from "@/lib/firebase/admin";

const STRIPE_API_BASE = "https://api.stripe.com";
const STRIPE_API_VERSION = "2026-01-28.preview";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function requireStripeSecret() {
  const secret = toStr(process.env.STRIPE_SECRET_KEY);
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return secret;
}

async function stripeRequest(path, options = {}) {
  const secret = requireStripeSecret();
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      "Stripe-Version": STRIPE_API_VERSION,
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = toStr(payload?.error?.message || payload?.message || "Stripe request failed.");
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function stripeMoneyManagementRequest(path, options = {}) {
  const secret = requireStripeSecret();
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      "Stripe-Version": "2026-02-25.preview",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = toStr(payload?.error?.message || payload?.message || "Stripe money movement request failed.");
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const next = toStr(value);
    if (next) return next;
  }
  return "";
}

function recipientCapabilitiesForProfile(profile) {
  const payoutMethod = toStr(profile?.payoutMethod || "same_country_bank").toLowerCase();
  return payoutMethod === "other_country_bank"
    ? {
        bank_accounts: {
          wire: {
            requested: true,
          },
        },
      }
    : {
        bank_accounts: {
          local: {
            requested: true,
          },
        },
      };
}

export async function createOrRefreshStripeRecipientOnboardingLink({
  sellerUid,
  sellerSlug,
  returnUrl,
  refreshUrl,
}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  if (!sellerUid) throw new Error("sellerUid is required.");

  const sellerRef = db.collection("users").doc(sellerUid);
  const sellerSnap = await sellerRef.get();
  if (!sellerSnap.exists) throw new Error("Seller account not found.");

  const sellerData = sellerSnap.data() || {};
  const seller = sellerData?.seller && typeof sellerData.seller === "object" ? sellerData.seller : {};
  const payoutProfile = seller?.payoutProfile && typeof seller.payoutProfile === "object" ? seller.payoutProfile : {};

  const country = toStr(payoutProfile?.country || seller?.sellerCountry || "ZA").toLowerCase();
  const email = toStr(seller?.contactEmail || sellerData?.email);
  const displayName = toStr(seller?.vendorName || sellerData?.account?.accountName || sellerSlug || "Seller");
  const entityType = "company";
  let accountId = toStr(payoutProfile?.stripeRecipientAccountId);

  if (!accountId) {
    const created = await stripeRequest("/v2/core/accounts", {
      method: "POST",
      body: JSON.stringify({
        contact_email: email,
        display_name: displayName,
        identity: {
          country,
          entity_type: entityType,
        },
        configuration: {
          recipient: {
            capabilities: recipientCapabilitiesForProfile(payoutProfile),
          },
        },
        include: ["identity", "configuration.recipient", "requirements"],
      }),
    });

    accountId = toStr(created?.id);
    await sellerRef.set(
      {
        seller: {
          payoutProfile: {
            ...payoutProfile,
            stripeRecipientAccountId: accountId,
            stripeRecipientEntityType: entityType,
            stripeRecipientCountry: country.toUpperCase(),
            verificationStatus: toStr(payoutProfile?.verificationStatus || "pending"),
          },
        },
        timestamps: {
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true },
    );
  }

  const link = await stripeRequest("/v2/core/account_links", {
    method: "POST",
    body: JSON.stringify({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          return_url: returnUrl,
          refresh_url: refreshUrl,
        },
      },
    }),
  });

  await sellerRef.set(
    {
      seller: {
        payoutProfile: {
          ...payoutProfile,
          stripeRecipientAccountId: accountId,
          stripeLastAccountLinkCreatedAt: new Date().toISOString(),
        },
      },
      timestamps: {
        updatedAt: new Date().toISOString(),
      },
    },
    { merge: true },
  );

  return {
    accountId,
    url: toStr(link?.url),
    expiresAt: toStr(link?.expires_at || ""),
  };
}

export async function getStripeRecipientAccountSummary(accountId) {
  const id = toStr(accountId);
  if (!id) {
    throw new Error("stripe recipient account id is required.");
  }

  const params = new URLSearchParams();
  params.append("include", "identity");
  params.append("include", "configuration.recipient");
  params.append("include", "requirements");

  const account = await stripeRequest(`/v2/core/accounts/${encodeURIComponent(id)}?${params.toString()}`, {
    method: "GET",
  });

  const requirements = account?.requirements && typeof account.requirements === "object" ? account.requirements : {};
  const recipientConfig = account?.configuration?.recipient && typeof account.configuration.recipient === "object"
    ? account.configuration.recipient
    : {};
  const bankAccount = recipientConfig?.bank_account && typeof recipientConfig.bank_account === "object"
    ? recipientConfig.bank_account
    : {};
  const recipientFeatures = recipientConfig?.features && typeof recipientConfig.features === "object"
    ? recipientConfig.features
    : {};
  const bankAccountFeatures = recipientFeatures?.bank_accounts && typeof recipientFeatures.bank_accounts === "object"
    ? recipientFeatures.bank_accounts
    : {};
  const localBankFeature = bankAccountFeatures?.local && typeof bankAccountFeatures.local === "object"
    ? bankAccountFeatures.local
    : {};
  const wireBankFeature = bankAccountFeatures?.wire && typeof bankAccountFeatures.wire === "object"
    ? bankAccountFeatures.wire
    : {};
  const identity = account?.identity && typeof account.identity === "object" ? account.identity : {};

  const currentlyDue = Array.isArray(requirements?.currently_due) ? requirements.currently_due : [];
  const eventuallyDue = Array.isArray(requirements?.eventually_due) ? requirements.eventually_due : [];
  const pastDue = Array.isArray(requirements?.past_due) ? requirements.past_due : [];
  const pendingVerification = Array.isArray(requirements?.pending_verification) ? requirements.pending_verification : [];

  const hasBankDestination =
    Boolean(firstNonEmpty(recipientConfig?.default_outbound_destination?.id, bankAccount?.id, bankAccount?.last4));
  const localEnabled = toStr(localBankFeature?.status).toLowerCase() === "enabled";
  const wireEnabled = toStr(wireBankFeature?.status).toLowerCase() === "enabled";

  const payoutsEnabled =
    recipientConfig?.status === "active" ||
    recipientConfig?.payouts_enabled === true ||
    bankAccount?.status === "validated" ||
    (hasBankDestination && (localEnabled || wireEnabled));

  const detailsSubmitted =
    Boolean(firstNonEmpty(bankAccount?.last4, bankAccount?.bank_name, identity?.country)) &&
    currentlyDue.length === 0;

  const overallStatus = payoutsEnabled
    ? "ready"
    : pastDue.length
      ? "action_required"
      : currentlyDue.length || pendingVerification.length
        ? "pending"
        : detailsSubmitted
          ? "submitted"
          : "not_started";

  return {
    accountId: id,
    country: firstNonEmpty(identity?.country, account?.country),
    entityType: firstNonEmpty(identity?.entity_type, account?.entity_type),
    email: firstNonEmpty(account?.contact_email, account?.email),
    displayName: firstNonEmpty(account?.display_name, account?.business_profile?.name),
    payoutsEnabled,
    detailsSubmitted,
    status: overallStatus,
    bankName: firstNonEmpty(bankAccount?.bank_name),
    accountLast4: firstNonEmpty(bankAccount?.last4),
    currency: firstNonEmpty(bankAccount?.currency),
    hasBankDestination,
    localEnabled,
    wireEnabled,
    currentlyDue,
    eventuallyDue,
    pastDue,
    pendingVerification,
    raw: {
      requirements,
      recipientConfig,
    },
  };
}

export async function createStripeOutboundPayment({
  financialAccountId,
  recipientAccountId,
  amountMinor,
  currency,
  payoutMethod = null,
  description = null,
  metadata = {},
  recipientNotification = "none",
}) {
  if (!toStr(financialAccountId)) throw new Error("Stripe financial account id is required.");
  if (!toStr(recipientAccountId)) throw new Error("Stripe recipient account id is required.");
  if (!Number.isFinite(Number(amountMinor)) || Number(amountMinor) <= 0) {
    throw new Error("Stripe outbound payment amount must be greater than zero.");
  }

  const payload = {
    amount: {
      currency: toStr(currency || "zar").toLowerCase(),
      value: Math.trunc(Number(amountMinor)),
    },
    from: {
      currency: toStr(currency || "zar").toLowerCase(),
      financial_account: toStr(financialAccountId),
    },
    to: {
      recipient: toStr(recipientAccountId),
    },
    delivery_options: {
      bank_account: "automatic",
    },
    recipient_notification: {
      setting: toStr(recipientNotification || "none").toLowerCase() === "configured" ? "configured" : "none",
    },
    metadata,
  };

  if (toStr(payoutMethod)) {
    payload.to.payout_method = toStr(payoutMethod);
  }
  if (toStr(description)) {
    payload.description = toStr(description);
  }

  return stripeMoneyManagementRequest("/v2/money_management/outbound_payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getStripeOutboundPayment(outboundPaymentId) {
  const id = toStr(outboundPaymentId);
  if (!id) throw new Error("Stripe outbound payment id is required.");
  return stripeMoneyManagementRequest(`/v2/money_management/outbound_payments/${encodeURIComponent(id)}`, {
    method: "GET",
  });
}
