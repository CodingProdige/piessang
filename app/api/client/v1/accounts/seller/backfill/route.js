export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { sellerCodeFromUid, normalizeSellerDescription } from "@/lib/seller/seller-code";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function isSellerOwnerRecord(data) {
  const seller = data?.seller && typeof data.seller === "object" ? data.seller : {};
  const managed = Array.isArray(seller.managedSellerAccounts) ? seller.managedSellerAccounts : [];
  return Boolean(
    seller &&
      typeof seller === "object" &&
      !seller.teamOwnerUid &&
      managed.length === 0 &&
      (seller.sellerAccess === true || toStr(seller.vendorName) || toStr(seller.sellerSlug)),
  );
}

function sellerMatchesProduct(product, owner) {
  const productSellerCode = toStr(product?.product?.sellerCode || product?.seller?.sellerCode);
  const productSellerSlug = toStr(
    product?.product?.sellerSlug ||
      product?.seller?.sellerSlug ||
      product?.seller?.groupSellerSlug ||
      product?.seller?.activeSellerSlug,
  );
  const productVendorName = toStr(product?.product?.vendorName || product?.seller?.vendorName);
  const ownerSlug = toStr(owner?.seller?.sellerSlug || owner?.seller?.activeSellerSlug || owner?.seller?.groupSellerSlug);
  const ownerCode = toStr(owner?.seller?.sellerCode || owner?.seller?.activeSellerCode || owner?.seller?.groupSellerCode);
  const ownerVendorName = toStr(owner?.seller?.vendorName || owner?.seller?.groupVendorName);

  return Boolean(
    (ownerCode && productSellerCode && ownerCode === productSellerCode) ||
      (ownerSlug && productSellerSlug && ownerSlug === productSellerSlug) ||
      (ownerVendorName && productVendorName && ownerVendorName.toLowerCase() === productVendorName.toLowerCase()),
  );
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }
    const body = await req.json().catch(() => ({}));
    const uid = toStr(body?.uid);
    if (!uid) return err(400, "Missing UID", "uid is required.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) return err(404, "User Not Found", "Could not find the requesting account.");

    const requester = requesterSnap.data() || {};
    if (toStr(requester?.system?.accessType || requester?.systemAccessType).toLowerCase() !== "admin") {
      return err(403, "Access Denied", "System admin access required.");
    }

    const usersSnap = await db.collection("users").get();
    const owners = [];
    for (const docSnap of usersSnap.docs) {
      const data = docSnap.data() || {};
      if (!isSellerOwnerRecord(data)) continue;

      const seller = data.seller || {};
      const sellerCode = sellerCodeFromUid(docSnap.id);
      const vendorName = toStr(seller.vendorName || seller.groupVendorName || data?.account?.accountName || "");
      const vendorDescription = normalizeSellerDescription(seller.vendorDescription || seller.description || "");

      const nextSeller = {
        ...seller,
        sellerCode: seller.sellerCode || sellerCode,
        activeSellerCode: seller.activeSellerCode || sellerCode,
        groupSellerCode: seller.groupSellerCode || sellerCode,
        vendorName,
        vendorDescription,
      };

      if (seller.sellerCode !== sellerCode || seller.activeSellerCode !== sellerCode || seller.groupSellerCode !== sellerCode) {
        await db.collection("users").doc(docSnap.id).update({
          seller: nextSeller,
          "account.accountName": vendorName || data?.account?.accountName || "",
          "timestamps.updatedAt": FieldValue.serverTimestamp(),
        });
      }

      owners.push({
        id: docSnap.id,
        vendorName,
        sellerCode,
        sellerSlug: toStr(seller.sellerSlug || seller.activeSellerSlug || seller.groupSellerSlug),
        vendorDescription,
      });
    }

    const productsSnap = await db.collection("products_v2").get();
    let productUpdates = 0;
    for (const docSnap of productsSnap.docs) {
      const data = docSnap.data() || {};
      const owner = owners.find((item) => sellerMatchesProduct(data, { seller: item }));
      if (!owner) continue;

      await db.collection("products_v2").doc(docSnap.id).update({
        "product.sellerCode": owner.sellerCode,
        "product.vendorName": owner.vendorName,
        "product.vendorDescription": owner.vendorDescription,
        "seller.sellerCode": owner.sellerCode,
        "seller.activeSellerCode": owner.sellerCode,
        "seller.groupSellerCode": owner.sellerCode,
        "seller.vendorName": owner.vendorName,
        "seller.vendorDescription": owner.vendorDescription,
        "timestamps.updatedAt": FieldValue.serverTimestamp(),
      });
      productUpdates += 1;
    }

    return ok({
      message: "Seller codes backfilled.",
      sellersUpdated: owners.length,
      productsUpdated: productUpdates,
    });
  } catch (e) {
    console.error("seller/backfill failed:", e);
    return err(500, "Unexpected Error", "Unable to backfill seller codes.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
