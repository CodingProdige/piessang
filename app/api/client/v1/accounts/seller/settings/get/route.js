export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
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

    return ok({
      seller: {
        uid: owner.id,
        sellerSlug: toStr(seller?.sellerSlug || seller?.groupSellerSlug || sellerSlug),
        sellerCode: toStr(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode || ""),
        vendorName: toStr(seller?.vendorName || seller?.groupVendorName || ""),
        vendorDescription: toStr(seller?.vendorDescription || seller?.description || "").slice(0, 500),
      },
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
