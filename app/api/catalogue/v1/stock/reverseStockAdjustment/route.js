import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { reverseLotsForCapture } from "@/lib/warehouse/stock-lots";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });
const toStr = (v, f = "") => (v == null ? f : String(v)).trim();

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const { capture_id, reversed_by } = await req.json();
    if (!toStr(capture_id)) return err(400, "Missing Field", "'capture_id' is required.");
    if (!toStr(reversed_by)) return err(400, "Missing Field", "'reversed_by' (user_id) is required.");

    const captureRef = db.collection("stock_captures").doc(toStr(capture_id));
    const captureSnap = await captureRef.get();
    if (!captureSnap.exists) return err(404, "Not Found", `No stock capture found with id '${capture_id}'.`);

    const capture = captureSnap.data() || {};
    const locationId = toStr(capture.location_id);
    if (!locationId) return err(400, "Missing Location", "The capture record is missing a valid location_id.");
    if (capture.reversed === true) return err(409, "Already Reversed", "This stock capture has already been reversed.");

    const locSnap = await db.collection("bevgo_locations").doc(locationId).get();
    if (!locSnap.exists) return err(404, "Location Not Found", `No location found with id '${locationId}'.`);
    const locData = locSnap.data() || {};
    const authorisedUsers = Array.isArray(locData.authorised) ? locData.authorised.map((u) => toStr(u.user_id)) : [];
    if (!authorisedUsers.includes(toStr(reversed_by))) {
      return err(403, "Permission Denied", `You are not authorised to reverse stock adjustments for location '${locData.title || locationId}'.`);
    }

    const capturedData = Array.isArray(capture.captured_data) ? capture.captured_data : Array.isArray(capture.captured) ? capture.captured : [];
    const reversedProducts = [];
    const failures = [];

    for (const product of capturedData) {
      try {
        const productId = toStr(product?.product?.unique_id);
        if (!productId) continue;

        const ref = db.collection("products_v2").doc(productId);
        const snap = await ref.get();
        if (!snap.exists) {
          failures.push({ productId, reason: "Product not found in Firestore." });
          continue;
        }

        const currentData = snap.data() || {};
        const variants = Array.isArray(currentData.variants) ? [...currentData.variants] : [];

        for (const v of product.variants || []) {
          const variantId = toStr(v?.variant_id);
          const qty = Number(v?.received_qty) || 0;
          if (!variantId || qty <= 0) continue;

          const idx = variants.findIndex((vr) => toStr(vr?.variant_id) === variantId);
          if (idx < 0) {
            failures.push({ productId, variantId, reason: "Variant not found in Firestore." });
            continue;
          }

          const targetVariant = { ...variants[idx] };
          const inv = Array.isArray(targetVariant.inventory) ? [...targetVariant.inventory] : [];
          const invIndex = inv.findIndex((i) => toStr(i?.location_id) === locationId);
          if (invIndex >= 0) {
            const currentQty = Number(inv[invIndex].in_stock_qty || 0);
            inv[invIndex] = { ...inv[invIndex], in_stock_qty: Math.max(0, currentQty - qty) };
          } else {
            failures.push({ productId, variantId, reason: `No inventory record found for location '${locationId}'.` });
            continue;
          }

          targetVariant.inventory = inv;
          variants[idx] = targetVariant;
        }

        await ref.set(
          {
            variants,
            timestamps: {
              updatedAt: FieldValue.serverTimestamp(),
            },
          },
          { merge: true },
        );
        reversedProducts.push(productId);
      } catch (e) {
        console.error("Error reversing stock for product", e);
        failures.push({ productId: product?.product?.unique_id || "unknown", reason: e.message });
      }
    }

    const reversedLotIds = await reverseLotsForCapture(toStr(capture_id), "reversed");

    await captureRef.set(
      {
        reversed: true,
        reversed_by,
        reversed_at: FieldValue.serverTimestamp(),
        reversedLotIds,
      },
      { merge: true },
    );

    const reversalRef = db.collection("stock_reversals").doc();
    await reversalRef.set({
      capture_id,
      location_id: locationId,
      location_title: toStr(locData.title, null),
      reversed_by,
      reversed_products: reversedProducts,
      reversed_lot_ids: reversedLotIds,
      failed: failures,
      timestamps: {
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    });

    return ok({
      message: `Stock reversal completed for ${reversedProducts.length} product(s) at location '${locData.title || locationId}'.`,
      data: {
        reversal_id: reversalRef.id,
        reversed_products: reversedProducts,
        reversed_lot_ids: reversedLotIds,
        failures,
      },
    });
  } catch (e) {
    console.error("reverseStockAdjustment failed:", e);
    return err(500, "Unexpected Error", "Something went wrong while reversing stock.");
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
