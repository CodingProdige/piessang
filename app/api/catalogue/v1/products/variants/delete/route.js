export const runtime = "nodejs";
export const preferredRegion = "fra1";

// app/api/products_v2/variants/delete/route.js
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { findOrderReferencesForProduct } from "@/lib/orders/product-usage";

const ok  = (p = {}, s = 200) => NextResponse.json({ ok: true,  ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });
const is8 = (s) => /^\d{8}$/.test(String(s ?? "").trim());
const toBool = (v, f = false) =>
  typeof v === "boolean"
    ? v
    : typeof v === "number"
    ? v !== 0
    : typeof v === "string"
    ? ["true", "1", "yes", "y"].includes(v.toLowerCase())
    : f;

function hasLiveSnapshotRecord(product) {
  return Boolean(product?.live_snapshot && typeof product.live_snapshot === "object");
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { unique_id, variant_id, adminReviewEdit } = await req.json();

    // Validate product id (8-digit)
    const pid = String(unique_id ?? "").trim();
    if (!is8(pid)) return err(400, "Invalid Product ID", "'unique_id' must be an 8-digit string.");

    // Validate variant_id (accepts string "10000023" or number 10000023)
    const vidRaw = variant_id;
    const vidStr = String(vidRaw ?? "").trim();
    if (!is8(vidStr)) return err(400, "Invalid Variant ID", "'variant_id' must be an 8-digit string or number.");

    // Load product
    const ref = db.collection("products_v2").doc(pid);
    const snap = await ref.get();
    if (!snap.exists) return err(404, "Product Not Found", `No product exists with unique_id ${pid}.`);

    const data = snap.data() || {};
    const list = Array.isArray(data.variants) ? [...data.variants] : [];
    if (!list.length) return err(409, "No Variants", "This product has no variants to delete.");

    // Find by variant_id (exact 8-digit match after stringifying)
    const idx = list.findIndex(v => String(v?.variant_id ?? "").trim() === vidStr);
    if (idx < 0) return err(404, "Variant Not Found", `No variant with variant_id ${vidStr} on this product.`);

    const orderRefs = await findOrderReferencesForProduct(db, pid, vidStr);
    if (orderRefs.length) {
      return err(
        409,
        "Variant In Use",
        "This variant cannot be deleted because it is already part of an order history.",
        { orders: orderRefs },
      );
    }

    const deleted = list[idx];
    // Remove it — and DO NOT reassign default automatically
    list.splice(idx, 1);

    const preserveLiveVersionDuringReview =
      String(data?.moderation?.status ?? "").trim().toLowerCase() === "published" || hasLiveSnapshotRecord(data);
    const keepAdminEditedReviewInQueue =
      toBool(adminReviewEdit) &&
      String(data?.moderation?.status ?? "").trim().toLowerCase() === "in_review";

    const updatePayload = {
      variants: list,
      moderation: {
        ...(data?.moderation || {}),
        status:
          preserveLiveVersionDuringReview || keepAdminEditedReviewInQueue
            ? "in_review"
            : "draft",
        reason: "variant_changed",
        notes: keepAdminEditedReviewInQueue
          ? "Updated by Piessang during review. The listing remains in the review queue until approval or rejection."
          : preserveLiveVersionDuringReview
          ? "Variant deletion is in review. The current live version stays visible until the changes are approved."
          : "Variant deletion requires the listing to be reviewed again before it goes live.",
        reviewedAt: null,
        reviewedBy: null,
      },
      placement: {
        ...(data?.placement || {}),
        isActive:
          preserveLiveVersionDuringReview || keepAdminEditedReviewInQueue
            ? Boolean(data?.placement?.isActive)
            : false,
      },
      "timestamps.updatedAt": FieldValue.serverTimestamp()
    };
    if (preserveLiveVersionDuringReview && !hasLiveSnapshotRecord(data)) {
      updatePayload.live_snapshot = data;
    }
    await ref.update(updatePayload);

    return ok({
      unique_id: pid,
      deleted_variant_id: deleted?.variant_id ?? null,
      remaining: list.length,
      message: preserveLiveVersionDuringReview
        ? "Variant deleted from the pending update. The current live version stays visible while the change is reviewed."
        : keepAdminEditedReviewInQueue
        ? "Variant deleted. The product stays in the review queue while you continue reviewing it."
        :
          "Variant deleted. The product has been moved back to draft for review.",
      resubmissionRequired: true
    });
  } catch (e) {
    console.error("variants/delete (simple) failed:", e);
    return err(500, "Unexpected Error", "Something went wrong while deleting the variant.");
  }
}
