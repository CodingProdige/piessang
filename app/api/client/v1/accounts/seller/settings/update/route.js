export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeSellerDeliveryProfile } from "@/lib/seller/delivery-profile";
import { SUPPORTED_PAYOUT_COUNTRIES, SUPPORTED_PAYOUT_CURRENCIES } from "@/lib/seller/payout-config";
import { SUPPORTED_MARKETPLACE_CHECKOUT_COUNTRIES, normalizeCountryLabel } from "@/lib/marketplace/country-config";
import { canManageSellerTeam, findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { ensureSellerCode, normalizeSellerDescription } from "@/lib/seller/seller-code";
import { titleCaseVendorName } from "@/lib/seller/vendor-name";
import { normalizeMoneyAmount } from "@/lib/money";
import { encryptPayoutProfile } from "@/lib/security/payout-profile-crypto";
import { enqueueGoogleSyncForSeller } from "@/lib/integrations/google-sync-queue";
import { NextResponse } from "next/server";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
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

function normalizeSupportedCountryLabel(value, fallback = "") {
  return normalizeCountryLabel(value, SUPPORTED_MARKETPLACE_CHECKOUT_COUNTRIES, fallback);
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
      country: normalizeSupportedCountryLabel(normalized.origin?.country, ""),
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
      pricingRules: Array.isArray(normalized.directDelivery?.pricingRules)
        ? normalized.directDelivery.pricingRules.map((rule) => ({
            id: toStr(rule.id),
            label: sanitizeText(rule.label),
            minDistanceKm: rule.minDistanceKm == null ? null : sanitizePositiveInt(rule.minDistanceKm, 0),
            maxDistanceKm: rule.maxDistanceKm == null ? null : sanitizePositiveInt(rule.maxDistanceKm, 0),
            minOrderValue: rule.minOrderValue == null ? null : sanitizeMoney(rule.minOrderValue),
            maxOrderValue: rule.maxOrderValue == null ? null : sanitizeMoney(rule.maxOrderValue),
            fee: sanitizeMoney(rule.fee),
            freeAboveOrderValue: rule.freeAboveOrderValue == null ? null : sanitizeMoney(rule.freeAboveOrderValue),
            isActive: rule.isActive !== false,
          }))
        : [],
    },
    shippingZones: Array.isArray(normalized.shippingZones)
      ? normalized.shippingZones.map((zone) => ({
          id: toStr(zone.id),
          label: sanitizeText(zone.label),
          scopeType: sanitizeText(zone.scopeType || "country"),
          country: normalizeSupportedCountryLabel(zone.country, ""),
          region: sanitizeText(zone.region),
          city: sanitizeText(zone.city),
          postalCodes: Array.isArray(zone.postalCodes) ? zone.postalCodes.map((code) => sanitizeText(code)).filter(Boolean) : [],
          leadTimeDays: sanitizePositiveInt(zone.leadTimeDays, 2),
          cutoffTime: resolveCutoffTime(zone.cutoffTime),
          pricingRules: Array.isArray(zone.pricingRules)
            ? zone.pricingRules.map((rule) => ({
                id: toStr(rule.id),
                label: sanitizeText(rule.label),
                minDistanceKm: rule.minDistanceKm == null ? null : sanitizePositiveInt(rule.minDistanceKm, 0),
                maxDistanceKm: rule.maxDistanceKm == null ? null : sanitizePositiveInt(rule.maxDistanceKm, 0),
                minOrderValue: rule.minOrderValue == null ? null : sanitizeMoney(rule.minOrderValue),
                maxOrderValue: rule.maxOrderValue == null ? null : sanitizeMoney(rule.maxOrderValue),
                fee: sanitizeMoney(rule.fee),
                freeAboveOrderValue: rule.freeAboveOrderValue == null ? null : sanitizeMoney(rule.freeAboveOrderValue),
                isActive: rule.isActive !== false,
              }))
            : [],
          isFallback: zone.isFallback === true,
          isActive: zone.isActive !== false,
        }))
      : [],
    pickup: {
      enabled: normalized.pickup?.enabled === true,
      leadTimeDays: sanitizePositiveInt(normalized.pickup?.leadTimeDays, 0),
    },
    notes: sanitizeLongText(normalized.notes || ""),
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
    const businessDetails = parseBusinessDetails(data?.businessDetails || data?.business || {}, currentSeller, owner.data || {});
    const nextVendorName = vendorName || toStr(currentSeller.vendorName || currentSeller.groupVendorName || "");
    const nextVendorDescription = sanitizeLongText(
      vendorDescription || currentSeller.vendorDescription || currentSeller.description || "",
    );
    const sellerCode = ensureSellerCode(currentSeller.sellerCode, owner.id);

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
      "seller.deliveryProfile": deliveryProfile,
      "seller.payoutProfile": encryptedPayoutProfile,
      "seller.payoutProvider": payoutProvider,
      "seller.businessDetails": businessDetails,
      "seller.media": branding,
      "timestamps.updatedAt": new Date(),
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
      branding,
      deliveryProfile,
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
