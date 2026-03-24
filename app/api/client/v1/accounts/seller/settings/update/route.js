export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { canManageSellerTeam, findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { ensureSellerCode, normalizeSellerDescription } from "@/lib/seller/seller-code";
import { titleCaseVendorName } from "@/lib/seller/vendor-name";
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

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const uid = toStr(body?.uid);
    const sellerSlug = toStr(body?.sellerSlug || body?.seller?.sellerSlug);
    const data = body?.data && typeof body.data === "object" ? body.data : body;
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    const branding = parseBranding(data?.branding || data);
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
    const nextVendorName = vendorName || toStr(currentSeller.vendorName || currentSeller.groupVendorName || "");
    const nextVendorDescription = sanitizeLongText(
      vendorDescription || currentSeller.vendorDescription || currentSeller.description || "",
    );
    const sellerCode = ensureSellerCode(currentSeller.sellerCode, owner.id);

    await db.collection("users").doc(owner.id).update({
      "account.accountName": nextVendorName || currentSeller.vendorName || currentSeller.groupVendorName || "",
      "seller.vendorName": nextVendorName || currentSeller.vendorName || currentSeller.groupVendorName || "",
      "seller.groupVendorName": nextVendorName || currentSeller.vendorName || currentSeller.groupVendorName || "",
      "seller.vendorDescription": nextVendorDescription,
      "seller.description": nextVendorDescription,
      "seller.sellerCode": sellerCode,
      "seller.activeSellerCode": sellerCode,
      "seller.groupSellerCode": sellerCode,
      "seller.branding": branding,
      "seller.media": branding,
      "timestamps.updatedAt": new Date(),
    });

    return ok({
      message: "Seller branding updated.",
      seller: {
        vendorName: nextVendorName || currentSeller.vendorName || currentSeller.groupVendorName || "",
        vendorDescription: nextVendorDescription,
        sellerCode,
      },
      branding,
    });
  } catch (e) {
    console.error("seller/settings/update failed:", e);
    return err(500, "Unexpected Error", "Unable to update seller settings.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
