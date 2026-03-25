/**
 * NAME: Delete Product (hard delete)
 * PATH: /api/products_v2/delete
 * METHOD: POST
 *
 * PURPOSE:
 *   - Permanently delete a product document from Firestore.
 *   - No cascading deletes/updates are performed here.
 *
 * INPUTS (Body JSON):
 *   - unique_id (string, required): 8-digit product id (Firestore doc id)
 *
 * RESPONSE:
 *   - 200: { ok: true, unique_id, message: "Product permanently deleted." }
 *   - 404: { ok: false, title: "Product Not Found", message: "..." }
 *   - 400/500: { ok: false, title, message }
 */

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getServerAuthBootstrap } from "@/lib/auth/server";
import { findOrderReferencesForProduct } from "@/lib/orders/product-usage";

/* helpers */
const ok  = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });
const is8 = (s) => /^\d{8}$/.test(String(s ?? "").trim());
const toStr = (value, fallback = "") => (value == null ? fallback : String(value).trim());

function normalizeKey(value) {
  return toStr(value).toLowerCase();
}

function buildAllowedSellerKeys(profile) {
  const keys = new Set();
  const add = (value) => {
    const normalized = normalizeKey(value);
    if (normalized) keys.add(normalized);
  };

  add(profile?.sellerSlug);
  add(profile?.sellerCode);
  add(profile?.sellerActiveSellerSlug);

  const managedAccounts = Array.isArray(profile?.sellerManagedAccounts) ? profile.sellerManagedAccounts : [];
  for (const item of managedAccounts) {
    add(item?.sellerSlug);
    add(item?.sellerCode);
  }

  return keys;
}

function canManageProduct(profile, { sellerSlug, sellerCode }) {
  const systemAccessType = normalizeKey(profile?.systemAccessType);
  if (systemAccessType === "admin") return true;

  if (!profile?.uid || profile?.isSeller !== true) return false;

  const allowedKeys = buildAllowedSellerKeys(profile);
  return allowedKeys.has(normalizeKey(sellerSlug)) || allowedKeys.has(normalizeKey(sellerCode));
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const auth = await getServerAuthBootstrap();
    const profile = auth?.profile || null;
    if (!profile?.uid) {
      return err(401, "Unauthorized", "Sign in again to delete this product.");
    }

    const { unique_id } = await req.json();
    const pid = String(unique_id ?? "").trim();

    if (!is8(pid)) {
      return err(400, "Invalid Product ID", "unique_id must be an 8-digit string.");
    }

    const ref = db.collection("products_v2").doc(pid);
    const snap = await ref.get();
    if (!snap.exists) {
      return err(404, "Product Not Found", `No product exists with unique_id ${pid}.`);
    }

    const current = snap.data() || {};
    const currentSellerSlug = toStr(
      current?.seller?.sellerSlug ||
      current?.seller?.groupSellerSlug ||
      current?.product?.sellerSlug ||
      "",
    );
    const currentSellerCode = toStr(
      current?.seller?.sellerCode ||
      current?.seller?.activeSellerCode ||
      current?.product?.sellerCode ||
      "",
    );
    if (!canManageProduct(profile, { sellerSlug: currentSellerSlug, sellerCode: currentSellerCode })) {
      return err(403, "Forbidden", "You do not have permission to delete this product.");
    }

    const orderRefs = await findOrderReferencesForProduct(db, pid);
    if (orderRefs.length) {
      return err(
        409,
        "Product In Use",
        "This product cannot be deleted because it is already part of an order history.",
        { orders: orderRefs },
      );
    }

    await ref.delete();

    return ok({ unique_id: pid, message: "Product permanently deleted." });
  } catch (e) {
    console.error("products_v2/delete (hard) failed:", e);
    return err(500, "Unexpected Error", "Something went wrong while deleting the product.");
  }
}
