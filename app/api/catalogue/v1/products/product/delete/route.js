export const runtime = "nodejs";
export const preferredRegion = "fra1";

/**
 * NAME: Delete Product (soft delete)
 * PATH: /api/products_v2/delete
 * METHOD: POST
 *
 * PURPOSE:
 *   - Soft delete a product document from Firestore.
 *   - Preserve the document for linked orders, reports, and audit history.
 *
 * INPUTS (Body JSON):
 *   - unique_id (string, required): 8-digit product id (Firestore doc id)
 *
 * RESPONSE:
 *   - 200: { ok: true, unique_id, message: "Product archived." }
 *   - 404: { ok: false, title: "Product Not Found", message: "..." }
 *   - 400/500: { ok: false, title, message }
 */

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
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

    await ref.set(
      {
        placement: {
          ...(current?.placement && typeof current.placement === "object" ? current.placement : {}),
          isActive: false,
          isFeatured: false,
          in_stock: false,
          supplier_out_of_stock: true,
        },
        moderation: {
          ...(current?.moderation && typeof current.moderation === "object" ? current.moderation : {}),
          status: "archived",
          reason: "deleted",
          notes: "This product was soft deleted and archived to preserve linked records.",
          reviewedAt: null,
          reviewedBy: null,
        },
        timestamps: {
          ...(current?.timestamps && typeof current.timestamps === "object" ? current.timestamps : {}),
          updatedAt: FieldValue.serverTimestamp(),
          deletedAt: FieldValue.serverTimestamp(),
        },
        deletedAt: FieldValue.serverTimestamp(),
        deletedBy: toStr(profile?.uid),
        deletedReason: orderRefs.length
          ? "soft_deleted_with_linked_orders"
          : "soft_deleted",
        live_snapshot: current?.live_snapshot && typeof current.live_snapshot === "object"
          ? current.live_snapshot
          : current,
      },
      { merge: true },
    );

    return ok({
      unique_id: pid,
      archived: true,
      linkedOrders: orderRefs,
      message: "Product archived.",
    });
  } catch (e) {
    console.error("products_v2/delete (soft) failed:", e);
    return err(500, "Unexpected Error", "Something went wrong while deleting the product.");
  }
}
