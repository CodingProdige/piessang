export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  getVariantStockState,
  isProductPublished,
  listUsersWhoFavoritedProduct,
} from "@/lib/notifications/customer-inbox";
import { dispatchCustomerNotification } from "@/lib/notifications/customer-delivery";

const ok  = (p={},s=200)=>NextResponse.json({ ok:true, ...p },{ status:s });
const err = (s,t,m,e={})=>NextResponse.json({ ok:false, title:t, message:m, ...e },{ status:s });

function consumeInventoryRows(rows = [], quantity = 0) {
  let remaining = Math.max(0, Number(quantity) || 0);
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const nextRow = { ...(row || {}) };
    const current = Math.max(0, Number(nextRow?.in_stock_qty || 0));
    if (remaining <= 0 || current <= 0) return nextRow;
    const take = Math.min(current, remaining);
    nextRow.in_stock_qty = current - take;
    remaining -= take;
    return nextRow;
  });
}

export async function POST(req){
  try{
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const body = await req.json();
    let { unique_id, variant_id, qty } = body || {};

    // force types
    unique_id = String(unique_id);
    variant_id = String(variant_id);
    qty = Number(qty);

    if (!unique_id || !variant_id || isNaN(qty) || qty <= 0) {
      return err(400, "Invalid Request",
        "unique_id, variant_id and qty > 0 are required."
      );
    }

    // Lookup product
    const qRef = db.collection("products_v2").doc(unique_id);
    const snap = await qRef.get();

    if (!snap.exists) {
      return err(404, "Product Not Found", "No product with this unique_id.");
    }

    const data = snap.data();
    const variant = data.variants?.find(v => String(v.variant_id) === variant_id);

    if (!variant) {
      return err(404, "Variant Not Found", "Variant does not exist.");
    }

    if (!variant.sale?.is_on_sale) {
      return err(400, "Not On Sale", "Variant is not currently on sale.");
    }

    const available = Array.isArray(variant.inventory)
      ? variant.inventory.reduce((sum, row) => sum + Math.max(0, Number(row?.in_stock_qty || 0)), 0)
      : 0;

    if (qty > available) {
      return err(400, "Insufficient Stock",
        `Only ${available} units available.`
      );
    }

    const previousStockState = getVariantStockState(variant);
    variant.inventory = consumeInventoryRows(variant.inventory, qty);
    const remaining = Array.isArray(variant.inventory)
      ? variant.inventory.reduce((sum, row) => sum + Math.max(0, Number(row?.in_stock_qty || 0)), 0)
      : 0;
    if (variant.sale && !variant.sale.disabled_by_admin && remaining <= 0) {
      variant.sale.is_on_sale = false;
    }

    await qRef.update({
      variants: data.variants,
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });

    const nextStockState = getVariantStockState(variant);
    if (isProductPublished(data) && previousStockState !== nextStockState) {
      const favoritedUsers = await listUsersWhoFavoritedProduct(unique_id);
      await Promise.all(
        favoritedUsers.map((user) =>
          dispatchCustomerNotification({
            origin: new URL(req.url).origin,
            userId: user.userId,
            type: nextStockState === "out_of_stock" ? "favorite_out_of_stock" : "favorite_back_in_stock",
            title: nextStockState === "out_of_stock" ? "A favourite is out of stock" : "A favourite is back in stock",
            message:
              nextStockState === "out_of_stock"
                ? `${data?.product?.title || "A saved product"}${variant?.label ? ` (${variant.label})` : ""} is currently out of stock.`
                : `${data?.product?.title || "A saved product"}${variant?.label ? ` (${variant.label})` : ""} is back in stock.`,
            href: `/products/${encodeURIComponent(data?.product?.slug || data?.docId || unique_id)}`,
            metadata: {
              productId: unique_id,
              variantId: variant_id,
              stockState: nextStockState,
            },
            dedupeKey: `favorite-stock:${user.userId}:${unique_id}:${variant_id}:${nextStockState}`,
            email: user.email || "",
            phone: user.phone || "",
            emailType: nextStockState === "out_of_stock" ? "favorite-out-of-stock" : "favorite-back-in-stock",
            emailData: {
              productTitle: data?.product?.title || "A saved product",
              variantLabel: variant?.label || "",
            },
            smsType: nextStockState === "out_of_stock" ? "favorite-out-of-stock" : "favorite-back-in-stock",
            smsData: {
              productTitle: data?.product?.title || "A saved product",
            },
            pushType: nextStockState === "out_of_stock" ? "favorite-out-of-stock" : "favorite-back-in-stock",
            pushVariables: {
              productTitle: data?.product?.title || "A saved product",
              link: `/products/${encodeURIComponent(data?.product?.slug || data?.docId || unique_id)}`,
            },
          }),
        ),
      );
    }

    return ok({
      message: "Sale stock reserved.",
      unique_id,
      variant_id,
      qty_reserved: qty,
      qty_remaining: remaining
    });

  } catch (e) {
    console.error("Reserve ERROR:", e);
    return err(500, "Reserve Failed", "Unexpected server error", {
      error: e.toString()
    });
  }
}
