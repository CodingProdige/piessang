export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeSellerDeliveryProfile } from "@/lib/seller/delivery-profile";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { NextResponse } from "next/server";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
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
  return {
    payoutMethod: toStr(source.payoutMethod || "local_bank"),
    accountHolderName: toStr(source.accountHolderName || source.account_name),
    bankName: toStr(source.bankName || source.bank_name),
    bankCountry: toStr(source.bankCountry || source.bank_country || source.country || "ZA"),
    bankAddress: toStr(source.bankAddress || source.bank_address),
    branchCode: toStr(source.branchCode || source.branch_code),
    accountNumber: toStr(source.accountNumber || source.account_number),
    iban: toStr(source.iban),
    swiftBic: toStr(source.swiftBic || source.swift_bic),
    routingNumber: toStr(source.routingNumber || source.routing_number),
    accountType: toStr(source.accountType || source.account_type || "business_cheque"),
    country: toStr(source.country || "ZA"),
    currency: toStr(source.currency || "ZAR"),
    beneficiaryReference: toStr(source.beneficiaryReference || source.reference),
    beneficiaryAddressLine1: toStr(source.beneficiaryAddressLine1 || source.beneficiary_address_line_1),
    beneficiaryAddressLine2: toStr(source.beneficiaryAddressLine2 || source.beneficiary_address_line_2),
    beneficiaryCity: toStr(source.beneficiaryCity || source.beneficiary_city),
    beneficiaryRegion: toStr(source.beneficiaryRegion || source.beneficiary_region),
    beneficiaryPostalCode: toStr(source.beneficiaryPostalCode || source.beneficiary_postal_code),
    beneficiaryCountry: toStr(source.beneficiaryCountry || source.beneficiary_country || source.country || "ZA"),
    verificationStatus: toStr(source.verificationStatus || "not_submitted"),
    verificationNotes: toStr(source.verificationNotes || ""),
    peachRecipientId: toStr(source.peachRecipientId || ""),
    lastVerifiedAt: toStr(source.lastVerifiedAt || ""),
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

    const deliveryProfile = normalizeSellerDeliveryProfile(seller?.deliveryProfile || {});
    const payoutProfile = normalizePayoutProfile(seller?.payoutProfile || {});

    return ok({
      seller: {
        uid: owner.id,
        sellerSlug: toStr(seller?.sellerSlug || seller?.groupSellerSlug || sellerSlug),
        sellerCode: toStr(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode || ""),
        vendorName: toStr(seller?.vendorName || seller?.groupVendorName || ""),
        vendorDescription: toStr(seller?.vendorDescription || seller?.description || "").slice(0, 500),
      },
      deliveryProfile,
      payoutProfile,
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
