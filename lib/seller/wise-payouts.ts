// @ts-nocheck
import { getAdminDb } from "@/lib/firebase/admin";
import crypto from "node:crypto";

const WISE_API_BASE = toStr(process.env.WISE_API_BASE || process.env.NEXT_PUBLIC_WISE_API_BASE || "https://api.transferwise.com");

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function sanitizeLegacyPayoutNote(value) {
  const note = toStr(value);
  if (!note) return "";
  const normalized = note.toLowerCase();
  if (normalized.includes("stripe")) {
    return "Save your payout details and connect your payout destination to start receiving seller payouts.";
  }
  return note;
}

function requireWiseToken() {
  const token = toStr(process.env.WISE_API_TOKEN);
  if (!token) {
    throw new Error("WISE_API_TOKEN is not configured.");
  }
  return token;
}

async function wiseRequest(path, options = {}) {
  const token = requireWiseToken();
  const response = await fetch(`${WISE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = toStr(payload?.error || payload?.message || payload?.error?.message || "Wise request failed.");
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function toNum(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeWiseOnboardingStatus(summary = {}) {
  if (summary?.active === true) return "ready";
  if (summary?.recipientId) return "information_needed";
  return "created";
}

function verificationNotesFromWiseSummary(summary = {}) {
  if (summary?.active === true) {
    return "Wise recipient is ready for payouts.";
  }
  if (summary?.requirementsMessage) {
    return sanitizeLegacyPayoutNote(summary.requirementsMessage);
  }
  if (summary?.recipientId) {
    return "Wise recipient exists but still needs validated payout details.";
  }
  return "";
}

function getWiseProfileIdFromEnv() {
  return Number(toStr(process.env.WISE_PROFILE_ID || 0));
}

export async function getWiseProfileId() {
  const configured = getWiseProfileIdFromEnv();
  if (Number.isFinite(configured) && configured > 0) return configured;
  const profiles = await wiseRequest("/v2/profiles", { method: "GET" });
  const business = Array.isArray(profiles)
    ? profiles.find((entry) => toStr(entry?.type).toLowerCase() === "business")
    : null;
  const profileId = Number(business?.id || 0);
  if (!Number.isFinite(profileId) || profileId <= 0) {
    throw new Error("Unable to resolve a Wise business profile id.");
  }
  return profileId;
}

function mapWiseRecipientType(profile = {}) {
  if (toStr(profile?.iban)) return "iban";
  if (toStr(profile?.swiftBic)) return "swift_code";
  return "";
}

function buildWiseRecipientPayload({ payoutProfile = {}, businessDetails = {}, seller = {}, profileId }) {
  const recipientType = mapWiseRecipientType(payoutProfile);
  if (!recipientType) {
    return {
      valid: false,
      message: "Save an IBAN or SWIFT/BIC payout destination before setting up Wise payouts.",
    };
  }

  const accountHolderName =
    toStr(payoutProfile?.accountHolderName) ||
    toStr(businessDetails?.companyName) ||
    toStr(seller?.vendorName);
  if (!accountHolderName) {
    return {
      valid: false,
      message: "Save the payout account holder name before setting up Wise payouts.",
    };
  }

  const currency = toStr(payoutProfile?.currency || "USD").toUpperCase();
  const legalType = "BUSINESS";

  const details =
    recipientType === "iban"
      ? {
          legalType,
          iban: toStr(payoutProfile?.iban),
        }
      : {
          legalType,
          swiftCode: toStr(payoutProfile?.swiftBic),
          accountNumber: toStr(payoutProfile?.accountNumber),
          bankName: toStr(payoutProfile?.bankName),
          address: {
            country: toStr(payoutProfile?.beneficiaryCountry || payoutProfile?.country || seller?.sellerCountry || "ZA").toUpperCase(),
            city: toStr(payoutProfile?.beneficiaryCity),
            firstLine: toStr(payoutProfile?.beneficiaryAddressLine1),
            postCode: toStr(payoutProfile?.beneficiaryPostalCode),
            state: toStr(payoutProfile?.beneficiaryRegion),
          },
        };

  if (recipientType === "swift_code" && !details.swiftCode) {
    return {
      valid: false,
      message: "Save a SWIFT/BIC code before setting up Wise payouts.",
    };
  }

  return {
    valid: true,
    payload: {
      profile: profileId,
      accountHolderName,
      currency,
      type: recipientType,
      ownedByCustomer: false,
      details,
    },
    recipientType,
    accountHolderName,
    currency,
  };
}

async function saveSellerPayoutProfile(sellerRef, payoutProfile, updates = {}) {
  const now = new Date().toISOString();
  await sellerRef.set(
    {
      seller: {
        payoutProfile: {
          ...payoutProfile,
          ...updates,
          lastVerifiedAt: updates.lastVerifiedAt || now,
        },
        payoutProvider: updates.payoutProvider || "wise",
      },
      timestamps: {
        updatedAt: now,
      },
    },
    { merge: true },
  );
}

export async function getWiseRecipientSummary(recipientId) {
  const id = Number(recipientId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("wise recipient id is required.");
  }

  const recipient = await wiseRequest(`/v2/accounts/${id}`, { method: "GET" });
  return {
    connected: true,
    recipientId: Number(recipient?.id || 0),
    active: recipient?.active !== false,
    currency: toStr(recipient?.currency),
    accountSummary: toStr(recipient?.accountSummary || recipient?.longAccountSummary),
    accountHolderName: toStr(recipient?.accountHolderName),
    bankName: toStr(recipient?.details?.bankName || ""),
    status: recipient?.active === false ? "inactive" : "active",
    raw: recipient,
  };
}

function mapWiseTransferBatchStatus(status) {
  const normalized = toStr(status).toLowerCase();
  if (["outgoing_payment_sent", "funds_converted", "bounced_back"].includes(normalized)) {
    return "paid";
  }
  if (["cancelled", "failed", "charged_back"].includes(normalized)) {
    return "submission_failed";
  }
  return "submitted";
}

export async function createWiseQuote({
  profileId,
  sourceCurrency = "",
  targetCurrency = "",
  targetAmount = 0,
}) {
  return wiseRequest(`/v3/profiles/${profileId}/quotes`, {
    method: "POST",
    body: JSON.stringify({
      profile: profileId,
      sourceCurrency: toStr(sourceCurrency).toUpperCase(),
      targetCurrency: toStr(targetCurrency).toUpperCase(),
      targetAmount: Number(targetAmount),
      payOut: "BANK_TRANSFER",
      preferredPayIn: "BALANCE",
    }),
  });
}

export async function createWiseTransfer({
  recipientId,
  quoteUuid,
  reference = "",
  customerTransactionId = "",
}) {
  return wiseRequest("/v1/transfers", {
    method: "POST",
    body: JSON.stringify({
      targetAccount: Number(recipientId),
      quoteUuid: toStr(quoteUuid),
      customerTransactionId: toStr(customerTransactionId) || crypto.randomUUID(),
      details: {
        reference: toStr(reference).slice(0, 140),
      },
    }),
  });
}

export async function fundWiseTransfer({
  profileId,
  transferId,
  fundingType = "BALANCE",
}) {
  return wiseRequest(`/v3/profiles/${profileId}/transfers/${transferId}/payments`, {
    method: "POST",
    body: JSON.stringify({
      type: toStr(fundingType || "BALANCE").toUpperCase(),
    }),
  });
}

export async function getWiseTransfer(transferId) {
  return wiseRequest(`/v1/transfers/${transferId}`, {
    method: "GET",
  });
}

export async function createOrRefreshWiseRecipientSetup({ sellerUid, sellerSlug }) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  if (!sellerUid) throw new Error("sellerUid is required.");

  const sellerRef = db.collection("users").doc(sellerUid);
  const sellerSnap = await sellerRef.get();
  if (!sellerSnap.exists) throw new Error("Seller account not found.");

  const sellerData = sellerSnap.data() || {};
  const seller = sellerData?.seller && typeof sellerData.seller === "object" ? sellerData.seller : {};
  const payoutProfile = seller?.payoutProfile && typeof seller.payoutProfile === "object" ? seller.payoutProfile : {};
  const businessDetails = seller?.businessDetails && typeof seller.businessDetails === "object" ? seller.businessDetails : {};

  const existingRecipientId = Number(payoutProfile?.wiseRecipientId || 0);
  if (Number.isFinite(existingRecipientId) && existingRecipientId > 0) {
    const summary = await getWiseRecipientSummary(existingRecipientId);
    const onboardingStatus = normalizeWiseOnboardingStatus(summary);
    await saveSellerPayoutProfile(sellerRef, payoutProfile, {
      payoutProvider: "wise",
      wiseProfileId: Number(payoutProfile?.wiseProfileId || 0) || (await getWiseProfileId()),
      wiseRecipientId: existingRecipientId,
      wiseRecipientStatus: toStr(summary?.status || onboardingStatus),
      onboardingStatus,
      verificationStatus: onboardingStatus === "ready" ? "verified" : "pending",
      payoutMethodEnabled: summary?.active === true,
      verificationNotes: verificationNotesFromWiseSummary(summary),
    });
    return {
      recipientId: existingRecipientId,
      onboardingStatus,
      message:
        onboardingStatus === "ready"
          ? "Wise recipient is already set up and ready for payouts."
          : "Wise recipient already exists. Update the saved payout details if anything has changed.",
    };
  }

  const profileId = await getWiseProfileId();
  const built = buildWiseRecipientPayload({ payoutProfile, businessDetails, seller, profileId });
  if (!built.valid) {
    await saveSellerPayoutProfile(sellerRef, payoutProfile, {
      payoutProvider: "wise",
      wiseProfileId: profileId,
      onboardingStatus: "information_needed",
      verificationStatus: "not_submitted",
      payoutMethodEnabled: false,
      verificationNotes: built.message,
      recipientEmail: toStr(payoutProfile?.recipientEmail || seller?.contactEmail || sellerData?.email),
    });
    return {
      onboardingStatus: "information_needed",
      message: built.message,
    };
  }

  const created = await wiseRequest("/v1/accounts", {
    method: "POST",
    body: JSON.stringify(built.payload),
  });
  const recipientId = Number(created?.id || 0);
  const onboardingStatus = created?.active === false ? "information_needed" : "ready";

  await saveSellerPayoutProfile(sellerRef, payoutProfile, {
    payoutProvider: "wise",
    wiseProfileId: profileId,
    wiseRecipientId: recipientId,
    wiseRecipientStatus: toStr(created?.active === false ? "inactive" : "active"),
    onboardingStatus,
    verificationStatus: onboardingStatus === "ready" ? "verified" : "pending",
    payoutMethodEnabled: created?.active !== false,
    verificationNotes: verificationNotesFromWiseSummary({
      recipientId,
      active: created?.active !== false,
      requirementsMessage:
        created?.active === false
          ? "Wise created the recipient, but the payout details still need attention."
          : "",
    }),
    recipientEmail: toStr(payoutProfile?.recipientEmail || seller?.contactEmail || sellerData?.email),
  });

  return {
    recipientId,
    onboardingStatus,
    message:
      onboardingStatus === "ready"
        ? "Wise payout recipient created successfully."
        : "Wise recipient was created, but the payout details still need attention.",
  };
}

export async function syncWiseRecipientStateForSeller({ sellerUid = "", sellerRef = null, payoutProfile = null } = {}) {
  const db = getAdminDb();
  if (!db) throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  const resolvedSellerRef = sellerRef || (sellerUid ? db.collection("users").doc(sellerUid) : null);
  if (!resolvedSellerRef) throw new Error("sellerUid is required.");

  const sellerSnap = await resolvedSellerRef.get();
  if (!sellerSnap.exists) throw new Error("Seller account not found.");

  const sellerData = sellerSnap.data() || {};
  const seller = sellerData?.seller && typeof sellerData.seller === "object" ? sellerData.seller : {};
  const currentPayoutProfile =
    payoutProfile && typeof payoutProfile === "object"
      ? payoutProfile
      : seller?.payoutProfile && typeof seller.payoutProfile === "object"
        ? seller.payoutProfile
        : {};

  const recipientId = Number(currentPayoutProfile?.wiseRecipientId || 0);
  if (!Number.isFinite(recipientId) || recipientId <= 0) {
    await saveSellerPayoutProfile(resolvedSellerRef, currentPayoutProfile, {
      payoutProvider: "wise",
      onboardingStatus: "created",
      verificationStatus: "not_submitted",
      payoutMethodEnabled: false,
      verificationNotes: "Save your payout details and connect your payout destination to start receiving seller payouts.",
    });
    return {
      connected: false,
      onboardingStatus: "created",
      verificationStatus: "not_submitted",
      payoutMethodEnabled: false,
      status: "not_started",
    };
  }

  const summary = await getWiseRecipientSummary(recipientId);
  const onboardingStatus = normalizeWiseOnboardingStatus(summary);
  const verificationStatus = onboardingStatus === "ready" ? "verified" : "pending";

  await saveSellerPayoutProfile(resolvedSellerRef, currentPayoutProfile, {
    payoutProvider: "wise",
    wiseRecipientId: recipientId,
    wiseRecipientStatus: toStr(summary?.status || onboardingStatus),
    onboardingStatus,
    verificationStatus,
    payoutMethodEnabled: summary?.active === true,
    verificationNotes: verificationNotesFromWiseSummary(summary),
  });

  return {
    connected: true,
    onboardingStatus,
    verificationStatus,
    payoutsEnabled: summary?.active === true,
    hasBankDestination: summary?.active === true,
    payoutMethodEnabled: summary?.active === true,
    wiseRecipientId: recipientId,
    bankName: toStr(summary?.bankName),
    accountSummary: toStr(summary?.accountSummary),
    status: toStr(summary?.status || onboardingStatus),
  };
}

export async function createWisePayoutForBatch(batch = {}) {
  const profileId = await getWiseProfileId();
  const recipientId = Number(batch?.bankProfile?.wiseRecipientId || 0);
  if (!Number.isFinite(recipientId) || recipientId <= 0) {
    const error = new Error("Seller payout profile has not completed Wise recipient setup yet.");
    error.reason = "missing_wise_recipient";
    throw error;
  }

  const currency = toStr(batch?.currency || batch?.bankProfile?.currency || "USD").toUpperCase();
  const targetAmount = toNum(batch?.netDueIncl, 0);
  if (targetAmount <= 0) {
    const error = new Error("Wise payout amount must be greater than zero.");
    error.reason = "invalid_batch_amount";
    throw error;
  }

  const quote = await createWiseQuote({
    profileId,
    sourceCurrency: currency,
    targetCurrency: currency,
    targetAmount,
  });
  const quoteUuid = toStr(quote?.id || quote?.quoteId || "");
  if (!quoteUuid) {
    const error = new Error("Wise did not return a quote id.");
    error.reason = "missing_wise_quote";
    error.payload = quote;
    throw error;
  }

  const transfer = await createWiseTransfer({
    recipientId,
    quoteUuid,
    reference: `Piessang seller payout ${toStr(batch?.batchId)}`,
    customerTransactionId: crypto.randomUUID(),
  });
  const transferId = Number(transfer?.id || 0);
  if (!Number.isFinite(transferId) || transferId <= 0) {
    const error = new Error("Wise did not return a transfer id.");
    error.reason = "missing_wise_transfer";
    error.payload = transfer;
    throw error;
  }

  const payment = await fundWiseTransfer({
    profileId,
    transferId,
    fundingType: process.env.WISE_PAYOUT_FUNDING_TYPE || "BALANCE",
  });
  const providerStatus = toStr(payment?.status || transfer?.status || "submitted");
  return {
    provider: "wise",
    profileId,
    recipientId,
    quote,
    quoteUuid,
    transfer,
    transferId,
    payment,
    providerStatus,
    batchStatus: mapWiseTransferBatchStatus(providerStatus),
  };
}

export async function getWisePayoutStatusForBatch(providerPayoutId) {
  const transfer = await getWiseTransfer(providerPayoutId);
  const providerStatus = toStr(transfer?.status || "submitted");
  return {
    providerStatus,
    batchStatus: mapWiseTransferBatchStatus(providerStatus),
    payload: transfer,
  };
}
