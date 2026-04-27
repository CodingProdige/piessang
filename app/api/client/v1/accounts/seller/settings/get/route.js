export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { buildShippingSettingsFromLegacySeller } from "@/lib/shipping/settings";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { decryptPayoutProfile } from "@/lib/security/payout-profile-crypto";
import { NextResponse } from "next/server";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function sanitizeLegacyPayoutNote(value) {
  const note = toStr(value);
  if (!note) return "";
  if (note.toLowerCase().includes("stripe")) {
    return "Save your payout details and connect your payout destination to start receiving seller payouts.";
  }
  return note;
}

function normalizePlacement(value) {
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

function normalizePayoutProfile(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const sellerCountry = toStr(source.sellerCountry || source.seller_country || "ZA").toUpperCase();
  const normalizedPayoutMethod = (() => {
    const payoutCountry = toStr(source.bankCountry || source.beneficiaryCountry || source.country || sellerCountry || "ZA").toUpperCase();
    const candidate = toStr(source.payoutMethod || "same_country_bank").toLowerCase();
    if (candidate === "other_country_bank" || candidate === "international_bank") return "other_country_bank";
    if (payoutCountry) return "other_country_bank";
    return "same_country_bank";
  })();
  return {
    provider: "wise",
    payoutMethod: normalizedPayoutMethod,
    accountHolderName: toStr(source.accountHolderName || source.account_name),
    bankName: toStr(source.bankName || source.bank_name),
    bankCountry: toStr(source.bankCountry || source.bank_country || source.country || sellerCountry || "ZA"),
    bankAddress: toStr(source.bankAddress || source.bank_address),
    branchCode: toStr(source.branchCode || source.branch_code),
    accountNumber: toStr(source.accountNumber || source.account_number),
    iban: toStr(source.iban),
    swiftBic: toStr(source.swiftBic || source.swift_bic),
    routingNumber: toStr(source.routingNumber || source.routing_number),
    accountType: toStr(source.accountType || source.account_type || "business_cheque"),
    country: toStr(source.country || sellerCountry || "ZA"),
    currency: toStr(source.currency || "ZAR"),
    beneficiaryReference: toStr(source.beneficiaryReference || source.reference),
    beneficiaryAddressLine1: toStr(source.beneficiaryAddressLine1 || source.beneficiary_address_line_1),
    beneficiaryAddressLine2: toStr(source.beneficiaryAddressLine2 || source.beneficiary_address_line_2),
    beneficiaryCity: toStr(source.beneficiaryCity || source.beneficiary_city),
    beneficiaryRegion: toStr(source.beneficiaryRegion || source.beneficiary_region),
    beneficiaryPostalCode: toStr(source.beneficiaryPostalCode || source.beneficiary_postal_code),
    beneficiaryCountry: toStr(source.beneficiaryCountry || source.beneficiary_country || source.country || sellerCountry || "ZA"),
    verificationStatus: toStr(source.verificationStatus || "not_submitted"),
    verificationNotes: sanitizeLegacyPayoutNote(source.verificationNotes || ""),
    stripeRecipientAccountId: toStr(source.stripeRecipientAccountId || ""),
    stripeRecipientEntityType: toStr(source.stripeRecipientEntityType || ""),
    stripeRecipientCountry: toStr(source.stripeRecipientCountry || ""),
    stripeLastAccountLinkCreatedAt: toStr(source.stripeLastAccountLinkCreatedAt || ""),
    wiseProfileId: toStr(source.wiseProfileId || ""),
    wiseRecipientId: toStr(source.wiseRecipientId || ""),
    wiseRecipientStatus: toStr(source.wiseRecipientStatus || ""),
    wiseRequirementType: toStr(source.wiseRequirementType || source.wise_requirement_type || ""),
    wiseRequirements: Array.isArray(source.wiseRequirements) ? source.wiseRequirements : [],
    wiseDetails: source.wiseDetails && typeof source.wiseDetails === "object" ? source.wiseDetails : {},
    onboardingStatus: toStr(source.onboardingStatus || "created"),
    payoutMethodEnabled: source.payoutMethodEnabled === true,
    lastCollectionLinkSentAt: toStr(source.lastCollectionLinkSentAt || ""),
    recipientEmail: toStr(source.recipientEmail || source.email || ""),
    lastVerifiedAt: toStr(source.lastVerifiedAt || ""),
  };
}

function normalizeBusinessDetails(details, seller, owner) {
  const source = details && typeof details === "object" ? details : {};
  const account = owner?.account && typeof owner.account === "object" ? owner.account : {};
  return {
    companyName: toStr(source.companyName || account?.accountName || seller?.vendorName || seller?.groupVendorName || ""),
    registrationNumber: toStr(source.registrationNumber || account?.registrationNumber || ""),
    vatNumber: toStr(source.vatNumber || account?.vatNumber || ""),
    email: toStr(source.email || owner?.email || ""),
    phoneNumber: toStr(source.phoneNumber || account?.phoneNumber || ""),
    addressText: toStr(source.addressText || ""),
  };
}

export async function GET(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const { searchParams } = new URL(req.url);
    const sellerSlug = toStr(searchParams.get("sellerSlug") || searchParams.get("seller"));
    if (!sellerSlug) return err(400, "Missing Seller", "sellerSlug is required.");

    const owner = await findSellerOwnerByIdentifier(sellerSlug);
    if (!owner) return err(404, "Seller Not Found", "Could not find a seller account for that seller slug.");

    const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
    const branding = seller?.branding && typeof seller.branding === "object"
      ? seller.branding
      : seller?.media && typeof seller.media === "object"
        ? seller.media
        : {};

    const shippingSettings = buildShippingSettingsFromLegacySeller(seller);
    const payoutProfile = normalizePayoutProfile({
      ...decryptPayoutProfile(seller?.payoutProfile || {}),
      sellerCountry: seller?.sellerCountry || "",
    });
    const businessDetails = normalizeBusinessDetails(seller?.businessDetails || {}, seller, owner.data || {});

    return ok({
      seller: {
        uid: owner.id,
        sellerSlug: toStr(seller?.sellerSlug || seller?.groupSellerSlug || sellerSlug),
      sellerCode: toStr(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode || ""),
      vendorName: toStr(seller?.vendorName || seller?.groupVendorName || ""),
      vendorDescription: toStr(seller?.vendorDescription || seller?.description || "").slice(0, 500),
      payoutProvider: "wise",
      },
      shippingSettings,
      payoutProfile,
      businessDetails,
      branding: {
        bannerImageUrl: toStr(branding?.bannerImageUrl || branding?.bannerUrl),
        bannerBlurHashUrl: toStr(branding?.bannerBlurHashUrl || branding?.bannerBlurHash),
        bannerAltText: toStr(branding?.bannerAltText || branding?.bannerAlt || ""),
        bannerObjectPosition: normalizePlacement(branding?.bannerObjectPosition),
        logoImageUrl: toStr(branding?.logoImageUrl || branding?.logoUrl),
        logoBlurHashUrl: toStr(branding?.logoBlurHashUrl || branding?.logoBlurHash),
        logoAltText: toStr(branding?.logoAltText || branding?.logoAlt || ""),
        logoObjectPosition: normalizePlacement(branding?.logoObjectPosition),
      },
    });
  } catch (e) {
    console.error("seller/settings/get failed:", e);
    return err(500, "Unexpected Error", "Unable to load seller settings.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
