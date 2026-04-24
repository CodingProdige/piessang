export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeSellerDeliveryProfile } from "@/lib/seller/delivery-profile";
import { SUPPORTED_PAYOUT_COUNTRIES, SUPPORTED_PAYOUT_CURRENCIES } from "@/lib/seller/payout-config";
import { collectProductWeightRequirementIssues, sellerHasWeightBasedShipping } from "@/lib/seller/shipping-weight-requirements";
import { canManageSellerTeam, findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { ensureSellerCode, normalizeSellerDescription } from "@/lib/seller/seller-code";
import { titleCaseVendorName } from "@/lib/seller/vendor-name";
import { normalizeMoneyAmount } from "@/lib/money";
import { normalizeSellerCourierProfile } from "@/lib/integrations/easyship-profile";
import {
  buildShippingSettingsFromLegacySeller,
  normalizeShippingSettings,
  shippingModeRequiresWeight,
  validateShippingSettings,
} from "@/lib/shipping/settings";
import { validateShippingSettingsGoogleRegions } from "@/lib/server/google-admin-regions";
import { encryptPayoutProfile } from "@/lib/security/payout-profile-crypto";
import { enqueueGoogleSyncForSeller } from "@/lib/integrations/google-sync-queue";
import { enrichLocationWithGeocode } from "@/lib/server/google-geocode";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

async function propagateSellerDisplayFieldsToProducts(db, {
  sellerCode = "",
  sellerSlug = "",
  vendorName = "",
  vendorDescription = "",
}) {
  const normalizedSellerCode = toStr(sellerCode);
  const normalizedSellerSlug = toStr(sellerSlug);
  const updatedIds = new Set();
  let updatedCount = 0;

  const applySnapshot = async (snap) => {
    if (!snap || snap.empty) return;
    let batch = db.batch();
    let ops = 0;

    for (const docSnap of snap.docs) {
      if (!docSnap.exists) continue;
      if (updatedIds.has(docSnap.id)) continue;
      updatedIds.add(docSnap.id);

      batch.update(docSnap.ref, {
        "product.vendorName": vendorName || null,
        "product.vendorDescription": vendorDescription || null,
        "seller.vendorName": vendorName || null,
        "seller.vendorDescription": vendorDescription || null,
        "seller.sellerCode": normalizedSellerCode || null,
        "seller.activeSellerCode": normalizedSellerCode || null,
        "seller.groupSellerCode": normalizedSellerCode || null,
        "seller.sellerSlug": normalizedSellerSlug || null,
        "seller.activeSellerSlug": normalizedSellerSlug || null,
        "seller.groupSellerSlug": normalizedSellerSlug || null,
        "timestamps.updatedAt": FieldValue.serverTimestamp(),
      });
      ops += 1;
      updatedCount += 1;

      if (ops === 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) await batch.commit();
  };

  if (normalizedSellerCode) {
    await applySnapshot(
      await db.collection("products_v2").where("product.sellerCode", "==", normalizedSellerCode).get(),
    );
    await applySnapshot(
      await db.collection("products_v2").where("seller.sellerCode", "==", normalizedSellerCode).get(),
    );
  }

  if (normalizedSellerSlug) {
    await applySnapshot(
      await db.collection("products_v2").where("product.sellerSlug", "==", normalizedSellerSlug).get(),
    );
    await applySnapshot(
      await db.collection("products_v2").where("seller.sellerSlug", "==", normalizedSellerSlug).get(),
    );
  }

  return updatedCount;
}

function sanitizeUrl(value) {
  const input = toStr(value);
  if (!input) return "";
  return /^(https?:\/\/|data:)/i.test(input) ? input : "";
}

function sanitizeBlurHash(value) {
  return toStr(value);
}

function sanitizeText(value) {
  return toStr(value).slice(0, 120);
}

function sanitizeLongText(value) {
  return toStr(value).replace(/\s+/g, " ").trim().slice(0, 500);
}

function sanitizeMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return normalizeMoneyAmount(numeric);
}

function sanitizePositiveInt(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.trunc(numeric);
}

function sanitizePlacement(value) {
  const candidate = toStr(value, "center center").toLowerCase();
  const percentageMatch = candidate.match(/^(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/);
  if (percentageMatch) {
    const x = Math.min(100, Math.max(0, Number.parseFloat(percentageMatch[1])));
    const y = Math.min(100, Math.max(0, Number.parseFloat(percentageMatch[2])));
    return `${x.toFixed(1)}% ${y.toFixed(1)}%`;
  }
  const allowed = new Set(["left center", "center top", "center center", "center bottom", "right center"]);
  return allowed.has(candidate) ? candidate : "center center";
}

function sanitizeCoordinate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(6));
}

function sanitizeOffsetMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
}

function sanitizeTime(value) {
  const input = toStr(value);
  if (!input) return null;
  const match = input.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function resolveCutoffTime(value, fallback = "10:00") {
  return sanitizeTime(value) || fallback;
}

function sanitizeEnum(value, allowed, fallback) {
  const normalized = toStr(value).toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function sanitizeBankAccountNumber(value) {
  return toStr(value).replace(/[^\d]/g, "").slice(0, 20);
}

function sanitizeBranchCode(value) {
  return toStr(value).replace(/[^\d]/g, "").slice(0, 10);
}

function sanitizeAlphaNumeric(value, max = 34) {
  return toStr(value).replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, max);
}

function parsePayoutProfile(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const supportedCountryCodes = SUPPORTED_PAYOUT_COUNTRIES.map((entry) => entry.code);
  const supportedCurrencyCodes = SUPPORTED_PAYOUT_CURRENCIES.map((entry) => entry.code);
  const country = sanitizeEnum(source.country || "ZA", supportedCountryCodes.map((code) => code.toLowerCase()), "za").toUpperCase();
  const bankCountry = sanitizeEnum(source.bankCountry || source.bank_country || source.country || "ZA", supportedCountryCodes.map((code) => code.toLowerCase()), "za").toUpperCase();
  const rawPayoutMethod = sanitizeEnum(source.payoutMethod, ["same_country_bank", "other_country_bank"], "same_country_bank");
  const payoutMethod = country || bankCountry ? "other_country_bank" : rawPayoutMethod;
  return {
    provider: "wise",
    payoutMethod,
    accountHolderName: sanitizeText(source.accountHolderName || source.account_name || "").slice(0, 120),
    bankName: sanitizeText(source.bankName || source.bank_name || "").slice(0, 120),
    bankCountry,
    bankAddress: sanitizeLongText(source.bankAddress || source.bank_address || "").slice(0, 200),
    branchCode: sanitizeBranchCode(source.branchCode || source.branch_code || ""),
    accountNumber: sanitizeBankAccountNumber(source.accountNumber || source.account_number || ""),
    iban: sanitizeAlphaNumeric(source.iban || "", 34),
    swiftBic: sanitizeAlphaNumeric(source.swiftBic || source.swift_bic || "", 11),
    routingNumber: sanitizeAlphaNumeric(source.routingNumber || source.routing_number || "", 20),
    accountType: sanitizeEnum(source.accountType || source.account_type, ["business_cheque", "business_savings", "cheque", "savings"], "business_cheque"),
    country,
    currency: sanitizeEnum(source.currency || "ZAR", supportedCurrencyCodes.map((code) => code.toLowerCase()), "zar").toUpperCase(),
    beneficiaryReference: sanitizeText(source.beneficiaryReference || source.reference || "").slice(0, 120),
    beneficiaryAddressLine1: sanitizeText(source.beneficiaryAddressLine1 || source.beneficiary_address_line_1 || "").slice(0, 120),
    beneficiaryAddressLine2: sanitizeText(source.beneficiaryAddressLine2 || source.beneficiary_address_line_2 || "").slice(0, 120),
    beneficiaryCity: sanitizeText(source.beneficiaryCity || source.beneficiary_city || "").slice(0, 120),
    beneficiaryRegion: sanitizeText(source.beneficiaryRegion || source.beneficiary_region || "").slice(0, 120),
    beneficiaryPostalCode: sanitizeText(source.beneficiaryPostalCode || source.beneficiary_postal_code || "").slice(0, 30),
    beneficiaryCountry: sanitizeEnum(source.beneficiaryCountry || source.beneficiary_country || source.country || "ZA", supportedCountryCodes.map((code) => code.toLowerCase()), "za").toUpperCase(),
    verificationStatus: sanitizeEnum(source.verificationStatus, ["not_submitted", "pending", "verified", "failed"], "not_submitted"),
    verificationNotes: sanitizeLongText(source.verificationNotes || ""),
    stripeRecipientAccountId: sanitizeText(source.stripeRecipientAccountId || "").slice(0, 120),
    stripeRecipientEntityType: sanitizeText(source.stripeRecipientEntityType || "").slice(0, 40),
    stripeRecipientCountry: sanitizeText(source.stripeRecipientCountry || "").slice(0, 2).toUpperCase(),
    stripeLastAccountLinkCreatedAt: toStr(source.stripeLastAccountLinkCreatedAt || ""),
    wiseProfileId: sanitizeText(source.wiseProfileId || "").slice(0, 120),
    wiseRecipientId: sanitizeText(source.wiseRecipientId || "").slice(0, 120),
    wiseRecipientStatus: sanitizeText(source.wiseRecipientStatus || "").slice(0, 60),
    wiseRequirementType: sanitizeText(source.wiseRequirementType || source.wise_requirement_type || "").slice(0, 80),
    wiseRequirements: Array.isArray(source.wiseRequirements) ? source.wiseRequirements : [],
    wiseDetails:
      source.wiseDetails && typeof source.wiseDetails === "object"
        ? Object.fromEntries(
            Object.entries(source.wiseDetails).map(([key, value]) => [sanitizeText(key).replace(/\//g, ".").slice(0, 120), sanitizeText(value).slice(0, 240)]),
          )
        : {},
    onboardingStatus: sanitizeEnum(source.onboardingStatus, ["created", "information_needed", "collecting", "pending_review", "ready", "failed"], "created"),
    payoutMethodEnabled: source.payoutMethodEnabled === true,
    lastCollectionLinkSentAt: toStr(source.lastCollectionLinkSentAt || ""),
    recipientEmail: sanitizeText(source.recipientEmail || source.email || "").slice(0, 120),
    lastVerifiedAt: toStr(source.lastVerifiedAt || ""),
  };
}

function parseBranding(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    bannerImageUrl: sanitizeUrl(source.bannerImageUrl || source.bannerUrl),
    bannerBlurHashUrl: sanitizeBlurHash(source.bannerBlurHashUrl || source.bannerBlurHash),
    bannerAltText: sanitizeText(source.bannerAltText || source.bannerAlt || ""),
    bannerObjectPosition: sanitizePlacement(source.bannerObjectPosition),
    logoImageUrl: sanitizeUrl(source.logoImageUrl || source.logoUrl),
    logoBlurHashUrl: sanitizeBlurHash(source.logoBlurHashUrl || source.logoBlurHash),
    logoAltText: sanitizeText(source.logoAltText || source.logoAlt || ""),
    logoObjectPosition: sanitizePlacement(source.logoObjectPosition),
  };
}

function parseBusinessDetails(payload, seller = {}, owner = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const account = owner?.account && typeof owner.account === "object" ? owner.account : {};
  return {
    companyName: sanitizeText(source.companyName || account?.accountName || seller?.vendorName || seller?.groupVendorName || ""),
    registrationNumber: sanitizeText(source.registrationNumber || account?.registrationNumber || ""),
    vatNumber: sanitizeText(source.vatNumber || account?.vatNumber || ""),
    email: sanitizeText(source.email || owner?.email || ""),
    phoneNumber: sanitizeText(source.phoneNumber || account?.phoneNumber || ""),
    addressText: sanitizeLongText(source.addressText || "").slice(0, 240),
  };
}

function parseDeliveryProfile(payload) {
  const normalized = normalizeSellerDeliveryProfile(payload && typeof payload === "object" ? payload : {});
  return {
    origin: {
      streetAddress: sanitizeText(normalized.origin?.streetAddress),
      addressLine2: sanitizeText(normalized.origin?.addressLine2),
      country: sanitizeText(normalized.origin?.country),
      region: sanitizeText(normalized.origin?.region),
      city: sanitizeText(normalized.origin?.city),
      suburb: sanitizeText(normalized.origin?.suburb),
      postalCode: sanitizeText(normalized.origin?.postalCode),
      utcOffsetMinutes: sanitizeOffsetMinutes(normalized.origin?.utcOffsetMinutes),
      latitude: sanitizeCoordinate(normalized.origin?.latitude),
      longitude: sanitizeCoordinate(normalized.origin?.longitude),
    },
    directDelivery: {
      enabled: normalized.directDelivery?.enabled === true,
      title: "Direct delivery",
      radiusKm: sanitizePositiveInt(normalized.directDelivery?.radiusKm, 0),
      leadTimeDays: sanitizePositiveInt(normalized.directDelivery?.leadTimeDays, 1),
      cutoffTime: resolveCutoffTime(normalized.directDelivery?.cutoffTime),
      pricingRules: [
        {
          id: toStr(normalized.directDelivery?.pricingRules?.[0]?.id || "direct-flat"),
          label: sanitizeText(normalized.directDelivery?.pricingRules?.[0]?.label || "Direct delivery"),
          minDistanceKm: null,
          maxDistanceKm: null,
          minOrderValue: null,
          maxOrderValue: null,
          fee: sanitizeMoney(normalized.directDelivery?.pricingRules?.[0]?.fee),
          freeAboveOrderValue:
            normalized.directDelivery?.pricingRules?.[0]?.freeAboveOrderValue == null
              ? null
              : sanitizeMoney(normalized.directDelivery.pricingRules[0].freeAboveOrderValue),
          isActive: normalized.directDelivery?.enabled === true,
        },
      ],
    },
    shippingZones: Array.isArray(normalized.shippingZones)
      ? (normalized.shippingZones.map((zone) => ({
          id: toStr(zone.id),
          label: sanitizeText(zone.label || zone.country),
          scopeType: "country",
          country: sanitizeText(zone.country),
          region: "",
          city: "",
          postalCodes: [],
          leadTimeDays: sanitizePositiveInt(zone.leadTimeDays, 2),
          cutoffTime: resolveCutoffTime(zone.cutoffTime),
          rateMode: "flat",
          pricingBasis: ["per_order", "per_item", "per_kg"].includes(toStr(zone.pricingBasis || zone.pricing_basis || "per_order"))
            ? toStr(zone.pricingBasis || zone.pricing_basis || "per_order")
            : "per_order",
          courierKey: "",
          courierServiceLabel: "",
          pricingRules: [
            {
              id: toStr(zone.pricingRules?.[0]?.id || `${toStr(zone.id || "zone")}-standard`),
              label: sanitizeText(zone.pricingRules?.[0]?.label || zone.country || "Standard shipping"),
              pricingBasis: ["per_order", "per_item", "per_kg"].includes(toStr(zone.pricingBasis || zone.pricing_basis || "per_order"))
                ? toStr(zone.pricingBasis || zone.pricing_basis || "per_order")
                : "per_order",
              minDistanceKm: null,
              maxDistanceKm: null,
              minOrderValue: null,
              maxOrderValue: null,
              fee: sanitizeMoney(zone.pricingRules?.[0]?.fee),
              freeAboveOrderValue:
                zone.pricingRules?.[0]?.freeAboveOrderValue == null
                  ? null
                  : sanitizeMoney(zone.pricingRules[0].freeAboveOrderValue),
              isActive: zone.isActive !== false,
            },
          ],
          isFallback: false,
          isActive: zone.isActive !== false,
        }))
          .filter((zone) => zone.country))
      : [],
    pickup: {
      enabled: normalized.pickup?.enabled === true,
      leadTimeDays: sanitizePositiveInt(normalized.pickup?.leadTimeDays, 0),
    },
    notes: sanitizeLongText(normalized.notes || ""),
  };
}

function parseCourierProfile(payload) {
  const normalized = normalizeSellerCourierProfile(payload && typeof payload === "object" ? payload : {});
  return {
    enabled: normalized.enabled === true,
    provider: "easyship",
    internationalEnabled: normalized.internationalEnabled !== false,
    handoverMode: normalized.handoverMode === "dropoff" ? "dropoff" : "pickup",
    allowedCouriers: [],
    allowedDestinationCountries: [],
    platformMarkupMode: "platform_default",
  };
}

async function enforceSellerWeightShippingRequirements(db, sellerSlug, deliveryProfile) {
  if (!sellerSlug || !sellerHasWeightBasedShipping(deliveryProfile)) {
    return { hasWeightBasedShipping: false, missingWeightCount: 0, affectedTitles: [], deactivatedCount: 0 };
  }

  const hasLocalFallback = deliveryProfile?.directDelivery?.enabled === true;
  const snap = await db.collection("products_v2").where("product.sellerSlug", "==", sellerSlug).get();
  const affectedTitles = [];
  let deactivatedCount = 0;
  const writes = [];

  for (const docSnap of snap.docs) {
    const product = docSnap.data() || {};
    const issues = collectProductWeightRequirementIssues(product);
    if (!issues.includes("Variant weight")) continue;
    affectedTitles.push(toStr(product?.product?.title || docSnap.id));
    if (!hasLocalFallback && product?.placement?.isActive === true) {
      deactivatedCount += 1;
      writes.push(
        docSnap.ref.set(
          {
            placement: {
              ...(product?.placement || {}),
              isActive: false,
            },
            listing_block_reason_code: "missing_variant_weight_for_shipping",
            listing_block_reason:
              "This product needs variant weight details before it can be published with per-kg shipping zones.",
            timestamps: {
              ...(product?.timestamps || {}),
              updatedAt: new Date(),
            },
          },
          { merge: true },
        ),
      );
    }
  }

  if (writes.length) await Promise.all(writes);

  return {
    hasWeightBasedShipping: true,
    missingWeightCount: affectedTitles.length,
    affectedTitles: affectedTitles.slice(0, 8),
    deactivatedCount,
  };
}

async function enforceSellerShippingWeightRequirements(db, sellerSlug, shippingSettings) {
  if (!sellerSlug || !shippingModeRequiresWeight(shippingSettings)) {
    return { hasWeightBasedShipping: false, missingWeightCount: 0, affectedTitles: [], deactivatedCount: 0 };
  }

  const snap = await db.collection("products_v2").where("product.sellerSlug", "==", sellerSlug).get();
  const affectedTitles = [];
  let deactivatedCount = 0;
  const writes = [];

  for (const docSnap of snap.docs) {
    const product = docSnap.data() || {};
    const issues = collectProductWeightRequirementIssues(product);
    if (!issues.includes("Variant weight")) continue;
    affectedTitles.push(toStr(product?.product?.title || docSnap.id));
    if (product?.placement?.isActive === true) {
      deactivatedCount += 1;
      writes.push(
        docSnap.ref.set(
          {
            placement: {
              ...(product?.placement || {}),
              isActive: false,
            },
            listing_block_reason_code: "missing_variant_weight_for_shipping",
            listing_block_reason:
              "This product needs variant weight details before it can be published with weight-based shipping settings.",
            timestamps: {
              ...(product?.timestamps || {}),
              updatedAt: new Date(),
            },
          },
          { merge: true },
        ),
      );
    }
  }

  if (writes.length) await Promise.all(writes);

  return {
    hasWeightBasedShipping: true,
    missingWeightCount: affectedTitles.length,
    affectedTitles: affectedTitles.slice(0, 8),
    deactivatedCount,
  };
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const uid = toStr(body?.uid);
    const sellerSlug = toStr(body?.sellerSlug || body?.seller?.sellerSlug);
    const data = body?.data && typeof body.data === "object" ? body.data : body;
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    const branding = parseBranding(data?.branding || data);
    const deliveryProfile = parseDeliveryProfile(data?.deliveryProfile || data?.delivery || {});
    const courierProfile = parseCourierProfile(data?.courierProfile || data?.courier || {});
    const providedShippingSettings = data?.shippingSettings && typeof data.shippingSettings === "object" ? data.shippingSettings : null;
    deliveryProfile.origin = await enrichLocationWithGeocode({
      streetAddress: deliveryProfile.origin?.streetAddress,
      addressLine2: deliveryProfile.origin?.addressLine2,
      country: deliveryProfile.origin?.country,
      region: deliveryProfile.origin?.region,
      city: deliveryProfile.origin?.city,
      suburb: deliveryProfile.origin?.suburb,
      postalCode: deliveryProfile.origin?.postalCode,
      latitude: deliveryProfile.origin?.latitude,
      longitude: deliveryProfile.origin?.longitude,
    });
    const payoutProfile = parsePayoutProfile(data?.payoutProfile || data?.payout || {});
    const encryptedPayoutProfile = encryptPayoutProfile(payoutProfile);
    const payoutProvider = "wise";
    const vendorName = titleCaseVendorName(data?.vendorName || data?.seller?.vendorName || "");
    const vendorDescription = normalizeSellerDescription(
      data?.vendorDescription || data?.description || data?.seller?.vendorDescription || data?.seller?.description,
      500,
    );

    if (!uid) return err(400, "Missing UID", "uid is required.");
    if (!sellerSlug) return err(400, "Missing Seller", "sellerSlug is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");

    const requester = requesterSnap.data() || {};
    const systemAccessType = toStr(requester?.system?.accessType || requester?.systemAccessType).toLowerCase();
    if (systemAccessType !== "admin" && !canManageSellerTeam(requester, sellerSlug)) {
      return err(403, "Access Denied", "You do not have permission to update this seller.");
    }

    const owner = await findSellerOwnerByIdentifier(sellerSlug);
    if (!owner) return err(404, "Seller Not Found", "Could not find a seller account for that seller slug.");

    const currentSeller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
    const legacyDerivedShippingSettings = buildShippingSettingsFromLegacySeller({
      ...currentSeller,
      deliveryProfile,
      courierProfile,
    });
    const shippingValidation = validateShippingSettings(providedShippingSettings || legacyDerivedShippingSettings);
    if (!shippingValidation.valid) {
      return err(400, "Invalid Shipping Settings", "Seller shipping settings are invalid.", {
        issues: shippingValidation.issues,
      });
    }
    const shippingSettings = normalizeShippingSettings(shippingValidation.settings);
    const googleRegionIssues = await validateShippingSettingsGoogleRegions(shippingSettings);
    if (googleRegionIssues.length) {
      return err(400, "Invalid Shipping Settings", "Seller shipping settings are invalid.", {
        issues: googleRegionIssues,
      });
    }
    const businessDetails = parseBusinessDetails(data?.businessDetails || data?.business || {}, currentSeller, owner.data || {});
    const nextVendorName = vendorName || toStr(currentSeller.vendorName || currentSeller.groupVendorName || "");
    const nextVendorDescription = sanitizeLongText(
      vendorDescription || currentSeller.vendorDescription || currentSeller.description || "",
    );
    const sellerCode = ensureSellerCode(currentSeller.sellerCode, owner.id);
    const shippingWeightRequirements = await enforceSellerShippingWeightRequirements(db, sellerSlug, shippingSettings);

    await db.collection("users").doc(owner.id).update({
      "account.accountName": nextVendorName || currentSeller.vendorName || currentSeller.groupVendorName || "",
      "account.vatNumber": businessDetails.vatNumber,
      "account.registrationNumber": businessDetails.registrationNumber,
      "account.phoneNumber": businessDetails.phoneNumber || requester?.account?.phoneNumber || "",
      "seller.vendorName": nextVendorName || currentSeller.vendorName || currentSeller.groupVendorName || "",
      "seller.groupVendorName": nextVendorName || currentSeller.vendorName || currentSeller.groupVendorName || "",
      "seller.vendorDescription": nextVendorDescription,
      "seller.description": nextVendorDescription,
      "seller.sellerCode": sellerCode,
      "seller.activeSellerCode": sellerCode,
      "seller.groupSellerCode": sellerCode,
      "seller.branding": branding,
      "seller.shippingSettings": shippingSettings,
      "seller.deliveryProfile": deliveryProfile,
      "seller.courierProfile": courierProfile,
      "seller.payoutProfile": encryptedPayoutProfile,
      "seller.payoutProvider": payoutProvider,
      "seller.businessDetails": businessDetails,
      "seller.media": branding,
      "timestamps.updatedAt": new Date(),
    });
    const propagatedProducts = await propagateSellerDisplayFieldsToProducts(db, {
      sellerCode,
      sellerSlug,
      vendorName: nextVendorName || currentSeller.vendorName || currentSeller.groupVendorName || "",
      vendorDescription: nextVendorDescription,
    });
    await enqueueGoogleSyncForSeller({
      sellerCode,
      sellerSlug,
      reason: "seller_settings_changed",
    });

    return ok({
      message: "Seller branding updated.",
      seller: {
        vendorName: nextVendorName || currentSeller.vendorName || currentSeller.groupVendorName || "",
        vendorDescription: nextVendorDescription,
        sellerCode,
      },
      propagatedProducts,
      branding,
      shippingSettings,
      deliveryProfile,
      courierProfile,
      shippingWeightRequirements,
      payoutProfile,
      payoutProvider,
      businessDetails,
    });
  } catch (e) {
    console.error("seller/settings/update failed:", e);
    return err(500, "Unexpected Error", "Unable to update seller settings.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
