// @ts-nocheck
import { getAdminDb } from "@/lib/firebase/admin";
import crypto from "node:crypto";
import { decryptPayoutProfile, encryptPayoutProfile } from "@/lib/security/payout-profile-crypto";

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
    const message = (() => {
      const topLevel = toStr(payload?.error || payload?.message || payload?.error?.message);
      if (topLevel) return topLevel;
      if (Array.isArray(payload?.errors) && payload.errors.length) {
        return payload.errors
          .map((entry) => toStr(entry?.message || entry?.code || entry?.path))
          .filter(Boolean)
          .join(" | ");
      }
      if (Array.isArray(payload?.fieldErrors) && payload.fieldErrors.length) {
        return payload.fieldErrors
          .map((entry) => `${toStr(entry?.field || "field")}: ${toStr(entry?.message || entry?.code)}`)
          .filter(Boolean)
          .join(" | ");
      }
      return "Wise request failed.";
    })();
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
  return toStr(profile?.wiseRequirementType || profile?.wise_requirement_type || "");
}

function normalizeWiseFieldPath(value) {
  return toStr(value).replace(/\//g, ".").trim();
}

function buildLegacyWiseDetails(profile = {}) {
  return {
    "details.accountNumber": toStr(profile?.accountNumber),
    "details.iban": toStr(profile?.iban),
    "details.swiftCode": toStr(profile?.swiftBic),
    "details.routingNumber": toStr(profile?.routingNumber),
    "details.bankCode": toStr(profile?.branchCode),
    zarIdentificationNumber: toStr(profile?.wiseDetails?.zarIdentificationNumber || profile?.wiseDetails?.["details.zarIdentificationNumber"] || profile?.zarIdentificationNumber),
    "details.zarIdentificationNumber": toStr(profile?.wiseDetails?.["details.zarIdentificationNumber"] || profile?.wiseDetails?.zarIdentificationNumber || profile?.zarIdentificationNumber),
    "address.country": toStr(profile?.beneficiaryCountry || profile?.bankCountry || profile?.country),
    "address.firstLine": toStr(profile?.beneficiaryAddressLine1),
    "address.secondLine": toStr(profile?.beneficiaryAddressLine2),
    "address.city": toStr(profile?.beneficiaryCity),
    "address.state": toStr(profile?.beneficiaryRegion),
    "address.postCode": toStr(profile?.beneficiaryPostalCode),
    accountHolderName: toStr(profile?.accountHolderName),
    email: toStr(profile?.recipientEmail),
    currency: toStr(profile?.currency),
  };
}

function getStoredWiseDetails(profile = {}) {
  const raw = profile?.wiseDetails && typeof profile.wiseDetails === "object" ? profile.wiseDetails : {};
  return {
    ...buildLegacyWiseDetails(profile),
    ...Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizeWiseFieldPath(key), toStr(value)])),
  };
}

function setNested(target, path, value) {
  const parts = normalizeWiseFieldPath(path).split(".").filter(Boolean);
  if (!parts.length) return;
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

function normalizeRequirementField(field = {}, groupField = {}) {
  const key = normalizeWiseFieldPath(groupField?.key || field?.key || field?.name || field?.path);
  return {
    key,
    label: toStr(groupField?.name || groupField?.label || field?.name || field?.label || key),
    required: groupField?.required !== false && field?.required !== false,
    refreshRequirementsOnChange: groupField?.refreshRequirementsOnChange === true || field?.refreshRequirementsOnChange === true,
    values: Array.isArray(groupField?.values || field?.values)
      ? (groupField?.values || field?.values).map((entry) =>
          typeof entry === "object"
            ? { value: toStr(entry?.key || entry?.value), label: toStr(entry?.name || entry?.label || entry?.key || entry?.value) }
            : { value: toStr(entry), label: toStr(entry) },
        )
      : [],
  };
}

function normalizeRequirementOption(option = {}) {
  const fields = Array.isArray(option?.fields)
    ? option.fields.flatMap((field) => {
        if (Array.isArray(field?.group) && field.group.length) {
          return field.group.map((groupField) => normalizeRequirementField(field, groupField));
        }
        return [normalizeRequirementField(field, field)];
      })
    : [];
  const type = toStr(option?.type || option?.name || option?.id);
  const normalizedFields = fields.filter((field) => field.key).map((field) => {
    const key = normalizeWiseFieldPath(field.key);
    if (type === "southafrica" && ["zarIdentificationNumber", "details.zarIdentificationNumber"].includes(key)) {
      return {
        ...field,
        required: true,
      };
    }
    return field;
  });

  return {
    type,
    title: toStr(option?.title || option?.name || option?.type),
    fields: normalizedFields,
  };
}

function redactWisePayload(value) {
  const sensitiveKeys = new Set([
    "accountNumber",
    "iban",
    "swiftCode",
    "routingNumber",
    "bankCode",
    "zarIdentificationNumber",
    "ifscCode",
    "clabe",
    "abartn",
  ]);
  if (Array.isArray(value)) return value.map(redactWisePayload);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (sensitiveKeys.has(key)) {
        const stringValue = toStr(entryValue);
        const last4 = stringValue.slice(-4);
        return [key, last4 ? `***${last4}` : "***"];
      }
      return [key, redactWisePayload(entryValue)];
    }),
  );
}

export async function getWiseRecipientRequirements({ payoutProfile = {}, sourceCurrency = "", targetCurrency = "" } = {}) {
  const target = toStr(targetCurrency || payoutProfile?.currency || "USD").toUpperCase();
  const source = toStr(sourceCurrency || process.env.WISE_SOURCE_CURRENCY || target).toUpperCase();
  const sourceAmount = Number(toStr(process.env.WISE_REQUIREMENTS_SOURCE_AMOUNT || "1000")) || 1000;
  const query = new URLSearchParams({
    source,
    target,
    sourceAmount: String(sourceAmount),
  });
  const payload = await wiseRequest(`/v1/account-requirements?${query.toString()}`, {
    method: "GET",
    headers: {
      "Accept-Minor-Version": "1",
    },
  });
  const options = Array.isArray(payload) ? payload.map(normalizeRequirementOption).filter((item) => item.type) : [];
  const selectedType =
    options.find((item) => item.type === toStr(payoutProfile?.wiseRequirementType))?.type ||
    options[0]?.type ||
    "";
  return {
    sourceCurrency: source,
    targetCurrency: target,
    selectedType,
    options,
  };
}

function buildWiseRecipientPayload({ payoutProfile = {}, businessDetails = {}, seller = {}, profileId }) {
  const recipientType = mapWiseRecipientType(payoutProfile);
  if (!recipientType) {
    return {
      valid: false,
      message: "Select a payout country and currency so Piessang can load the right payout fields.",
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
  const detailsMap = getStoredWiseDetails(payoutProfile);
  const payload = {
    profile: profileId,
    accountHolderName,
    currency,
    type: recipientType,
    ownedByCustomer: false,
  };

  const requirements = Array.isArray(payoutProfile?.wiseRequirements) ? payoutProfile.wiseRequirements : [];
  const requiredFields = requirements.filter((field) => field?.required !== false);
  const missingLabels = [];
  const southAfricaIdValue = toStr(
    payoutProfile?.wiseDetails?.zarIdentificationNumber ||
      payoutProfile?.wiseDetails?.["details.zarIdentificationNumber"] ||
      businessDetails?.registrationNumber,
  );
  for (const field of requiredFields) {
    const key = normalizeWiseFieldPath(field?.key);
    if (!key || ["profile", "type", "ownedByCustomer"].includes(key)) continue;
    let value =
      detailsMap[key] ||
      ((key === "zarIdentificationNumber" || key === "details.zarIdentificationNumber")
        ? toStr(payoutProfile?.wiseDetails?.zarIdentificationNumber || payoutProfile?.wiseDetails?.["details.zarIdentificationNumber"] || businessDetails?.registrationNumber)
        : "") ||
      (key === "legalType" ? "BUSINESS" : "") ||
      (key === "address.country" ? toStr(payoutProfile?.beneficiaryCountry || payoutProfile?.bankCountry || payoutProfile?.country || seller?.sellerCountry || "ZA").toUpperCase() : "") ||
      (key === "email" ? toStr(payoutProfile?.recipientEmail || seller?.contactEmail || businessDetails?.email) : "") ||
      (key === "accountHolderName" ? accountHolderName : "") ||
      (key === "currency" ? currency : "");
    if (!toStr(value) && field?.required !== false) {
      missingLabels.push(toStr(field?.label || key));
      continue;
    }
    if (!toStr(value)) continue;
    if (key === "email" || key === "accountHolderName" || key === "currency") {
      payload[key] = value;
      continue;
    }
    if (["zarIdentificationNumber", "details.zarIdentificationNumber"].includes(key)) {
      payload.zarIdentificationNumber = value;
      setNested(payload, "details.zarIdentificationNumber", value);
      continue;
    }
    if (key === "legalType") {
      setNested(payload, "details.legalType", value);
      continue;
    }
    if (key.startsWith("address.")) {
      setNested(payload, `details.${key}`, value);
      continue;
    }
    if (key.startsWith("details.")) {
      setNested(payload, key, value);
      continue;
    }
    if (["country", "city", "state", "postCode", "firstLine", "secondLine"].includes(key)) {
      setNested(payload, `details.address.${key}`, value);
      continue;
    }
    setNested(payload, `details.${key}`, value);
  }

  if (recipientType === "southafrica" && !southAfricaIdValue) {
    return {
      valid: false,
      message: "Add the South African ID or company registration number before connecting payouts.",
    };
  }

  if (missingLabels.length) {
    return {
      valid: false,
      message: `Complete these payout fields first: ${missingLabels.join(", ")}.`,
    };
  }

  return {
    valid: true,
    payload,
    recipientType,
    accountHolderName,
    currency,
  };
}

async function saveSellerPayoutProfile(sellerRef, payoutProfile, updates = {}) {
  const now = new Date().toISOString();
  const nextProfile = encryptPayoutProfile({
    ...payoutProfile,
    ...updates,
    lastVerifiedAt: updates.lastVerifiedAt || now,
  });
  await sellerRef.set(
    {
      seller: {
        payoutProfile: nextProfile,
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
  const payoutProfile = seller?.payoutProfile && typeof seller.payoutProfile === "object" ? decryptPayoutProfile(seller.payoutProfile) : {};
  const requirements = await getWiseRecipientRequirements({ payoutProfile }).catch(() => ({ selectedType: "", options: [] }));
  payoutProfile.wiseRequirementType = toStr(payoutProfile?.wiseRequirementType || requirements?.selectedType || "");
  payoutProfile.wiseRequirements =
    requirements?.options?.find((option) => option.type === payoutProfile.wiseRequirementType)?.fields || [];
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

  let created;
  try {
    created = await wiseRequest("/v1/accounts", {
      method: "POST",
      body: JSON.stringify(built.payload),
    });
  } catch (error) {
    error.payload = {
      wiseError: error?.payload || null,
      requestPayload: redactWisePayload(built.payload),
      selectedRequirementType: built.recipientType,
      selectedRequirementFields: payoutProfile?.wiseRequirements || [],
    };
    throw error;
  }
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
        ? decryptPayoutProfile(seller.payoutProfile)
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
