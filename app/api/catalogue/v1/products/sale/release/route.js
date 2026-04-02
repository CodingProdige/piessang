export const runtime = "nodejs";

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

function restoreInventoryRows(rows = [], quantity = 0) {
  const nextRows = Array.isArray(rows) ? rows.map((row) => ({ ...(row || {}) })) : [];
  const restoreQty = Math.max(0, Number(quantity) || 0);
  if (restoreQty <= 0) return nextRows;
  if (!nextRows.length) return [{ warehouse_id: "main", in_stock_qty: restoreQty }];
  const firstRow = { ...(nextRows[0] || {}) };
  firstRow.in_stock_qty = Math.max(0, Number(firstRow?.in_stock_qty || 0)) + restoreQty;
  nextRows[0] = firstRow;
  return nextRows;
}

export async function POST(req){
  try{
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const body = await req.json();
    const { unique_id, variant_id, qty } = body || {};

    if (!unique_id || !variant_id || !qty || qty <= 0) {
      return err(400,"Invalid Request","unique_id, variant_id and positive qty required.");
    }

    const productRef = db.collection("products_v2").doc(String(unique_id));
    const snap = await productRef.get();

    if (!snap.exists) {
      return err(404,"Product Not Found","No product with provided unique_id.");
    }

    let data = snap.data();
    const variant = data.variants?.find(v => v.variant_id == variant_id);

    if (!variant) {
      return err(404,"Variant Not Found","Variant does not exist for this product.");
    }

    if (!variant.sale?.is_on_sale) {
      return err(400,"Not On Sale","Variant is not currently on sale.");
    }

    const previousStockState = getVariantStockState(variant);
    variant.inventory = restoreInventoryRows(variant.inventory, qty);
    if (variant.sale && !variant.sale.disabled_by_admin) {
      variant.sale.is_on_sale = true;
    }

    await productRef.update({
      variants: data.variants,
      "timestamps.updatedAt": FieldValue.serverTimestamp()
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
      message: "Sale stock released.",
      unique_id,
      variant_id,
      qty_released: qty,
      qty_available: Array.isArray(variant.inventory)
        ? variant.inventory.reduce((sum, row) => sum + Math.max(0, Number(row?.in_stock_qty || 0)), 0)
        : 0
    });

  }catch(e){
    console.error(e);
    return err(500,"Release Failed","Unexpected server error",{ error:e.toString() });
  }
}
