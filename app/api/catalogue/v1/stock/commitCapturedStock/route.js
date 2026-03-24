import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { createInboundStockLot } from "@/lib/warehouse/stock-lots";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });
const toStr = (v, f = "") => (v == null ? f : String(v)).trim();
const toNum = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);

async function getLocationByLocationId(db, locationId) {
  const snap = await db.collection("bevgo_locations").where("location_id", "==", toStr(locationId)).limit(1).get();
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { docId: docSnap.id, ...(docSnap.data() || {}) };
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const { location_id, user_id, captured, booking_id = null } = await req.json();

    if (!location_id) return err(400, "Missing Field", "'location_id' is required.");
    if (!user_id) return err(400, "Missing Field", "'user_id' is required.");
    if (!Array.isArray(captured)) return err(400, "Invalid Data", "'captured' must be an array.");

    const location = await getLocationByLocationId(db, location_id);
    if (!location) return err(404, "Not Found", `No location found with ID '${location_id}'.`);

    const authorised = Array.isArray(location.authorised) ? location.authorised.map((a) => toStr(a.user_id)) : [];
    if (!authorised.includes(toStr(user_id))) {
      return err(403, "Unauthorized", `User '${user_id}' is not permitted to capture stock for '${location.title}'.`);
    }

    let updatedCount = 0;
    const createdLotIds = [];

    for (const product of captured) {
      const productId = toStr(product?.product?.unique_id);
      if (!productId) continue;

      const ref = db.collection("products_v2").doc(productId);
      const snap = await ref.get();
      if (!snap.exists) continue;

      const data = snap.data() || {};
      const variants = Array.isArray(data.variants) ? [...data.variants] : [];
      const sellerCode = toStr(data?.product?.sellerCode || data?.seller?.sellerCode || "");
      const sellerSlug = toStr(data?.product?.sellerSlug || data?.seller?.sellerSlug || "");
      const productTitle = toStr(data?.product?.title || product?.product?.title || productId);

      for (const variant of product.variants || []) {
        const variantId = toStr(variant?.variant_id);
        const qty = Math.max(0, Math.trunc(toNum(variant?.received_qty, 0)));
        if (!variantId || qty <= 0) continue;

        const idx = variants.findIndex((v) => toStr(v?.variant_id) === variantId);
        if (idx < 0) continue;

        const vData = { ...variants[idx] };
        const inv = Array.isArray(vData.inventory) ? [...vData.inventory] : [];
        const invIdx = inv.findIndex((i) => toStr(i?.location_id) === toStr(location_id));

        if (invIdx >= 0) {
          inv[invIdx] = {
            ...inv[invIdx],
            in_stock_qty: Number(inv[invIdx].in_stock_qty || 0) + qty,
          };
        } else {
          inv.push({ in_stock_qty: qty, location_id });
        }

        vData.inventory = inv;
        variants[idx] = vData;
        updatedCount += 1;

        const lot = await createInboundStockLot({
          captureId: buildCaptureSeed(location_id, user_id, productId, variantId),
          bookingId: toStr(booking_id) || null,
          productId,
          productTitle,
          variant: vData,
          quantity: qty,
          locationId: toStr(location_id),
          sellerCode,
          sellerSlug,
          receivedBy: toStr(user_id),
        });
        if (lot?.lotId) createdLotIds.push(lot.lotId);
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
    }

    const sessionRef = db.collection("stock_captures").doc();
    const sessionData = {
      docId: sessionRef.id,
      capture_id: sessionRef.id,
      location_id,
      location_title: location.title,
      user_id,
      booking_id: toStr(booking_id) || null,
      captured_count: updatedCount,
      captured,
      captured_data: captured,
      createdLotIds,
      timestamps: {
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    };
    await sessionRef.set(sessionData);

    if (createdLotIds.length) {
      const batch = db.batch();
      for (const lotId of createdLotIds) {
        batch.set(
          db.collection("warehouse_stock_lots_v1").doc(lotId),
          { captureId: sessionRef.id },
          { merge: true },
        );
      }
      await batch.commit();
    }

    return ok({
      message: `Stock successfully committed for location '${location.title}'.`,
      data: {
        location_id,
        captured_count: updatedCount,
        session_id: sessionRef.id,
        created_lot_ids: createdLotIds,
      },
    });
  } catch (e) {
    console.error("commitCapturedStock failed:", e);
    return err(500, "Unexpected Error", "Something went wrong while committing stock.", { error: e.message });
  }
}

function buildCaptureSeed(locationId, userId, productId, variantId) {
  return [toStr(locationId), toStr(userId), toStr(productId), toStr(variantId), Date.now()].filter(Boolean).join("__");
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
