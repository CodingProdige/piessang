export const runtime = "nodejs";
export const preferredRegion = "fra1";

// app/api/products_v2/inventory/update/route.js
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { collectSellerNotificationEmails, getProductInventoryTotal, sendSellerNotificationEmails } from "@/lib/seller/notifications";
import { toSellerSlug } from "@/lib/seller/vendor-name";
import { isProductPublished, listUsersWhoFavoritedProduct } from "@/lib/notifications/customer-inbox";
import { dispatchCustomerNotification } from "@/lib/notifications/customer-delivery";

const ok  =(p={},s=200)=>NextResponse.json({ ok:true, ...p },{ status:s });
const err =(s,t,m,e={})=>NextResponse.json({ ok:false, title:t, message:m, ...e },{ status:s });
const is8 =(s)=>/^\d{8}$/.test(String(s||"").trim());
const toInt=(v,f=0)=>Number.isFinite(+v)?Math.trunc(+v):f;
const toBool=(v,f=false)=>typeof v==="boolean"?v:typeof v==="number"?v!==0:typeof v==="string"?["true","1","yes"].includes(v.toLowerCase()):f;

export async function POST(req){
  try{
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { unique_id, warehouse_id, data } = await req.json();
    const pid = String(unique_id||"").trim();
    const wh  = String(warehouse_id||"").trim();
    if (!is8(pid)) return err(400,"Invalid Product Id","'unique_id' must be an 8-digit string.");
    if (!wh) return err(400,"Missing Warehouse","'warehouse_id' is required.");
    if (!data || typeof data!=="object") return err(400,"Invalid Data","Provide a 'data' object.");
    let nextInventory = null;
    let productSnapshot = null;
    let previousStockTotal = 0;

    await db.runTransaction(async (tx)=>{
      const ref = db.collection("products_v2").doc(pid);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("NOT_FOUND");

      const curr = snap.data()||{};
      productSnapshot = curr;
      previousStockTotal = getProductInventoryTotal({ inventory: Array.isArray(curr.inventory) ? curr.inventory : [] });
      const inv = Array.isArray(curr.inventory)?[...curr.inventory]:[];
      const idx = inv.findIndex(r => String(r.warehouse_id||"").trim() === wh);
      if (idx<0) throw new Error("ROW_NOT_FOUND");

      const row = { ...inv[idx] };
      if ("warehouse_postal_code" in data) row.warehouse_postal_code = data.warehouse_postal_code ?? null;
      if ("supplier_out_of_stock" in data) row.supplier_out_of_stock = toBool(data.supplier_out_of_stock, row.supplier_out_of_stock);
      if ("in_stock" in data)             row.in_stock             = toBool(data.in_stock,             row.in_stock);
      if ("unit_stock_qty" in data)       row.unit_stock_qty       = toInt(data.unit_stock_qty, row.unit_stock_qty);

      // optional fields
      if ("reserved_qty" in data)   row.reserved_qty   = toInt(data.reserved_qty, row.reserved_qty ?? 0);

      row.updated_at = new Date().toISOString();
      inv[idx] = row;
      nextInventory = inv;

      tx.update(ref, { inventory: inv, "timestamps.updatedAt": FieldValue.serverTimestamp() });
    });

    const sellerSlug = toSellerSlug(productSnapshot?.seller?.sellerSlug || productSnapshot?.seller?.groupSellerSlug || productSnapshot?.product?.vendorName || productSnapshot?.product?.brandTitle || productSnapshot?.product?.brand);
    const stockTotal = getProductInventoryTotal({ inventory: nextInventory || [] });
    if (sellerSlug && stockTotal > 0 && stockTotal <= 10 && process.env.SENDGRID_API_KEY?.startsWith("SG.")) {
      const recipients = await collectSellerNotificationEmails({
        sellerSlug,
        fallbackEmails: [productSnapshot?.seller?.contactEmail, productSnapshot?.email, productSnapshot?.product?.vendorEmail].filter(Boolean),
      });
      if (recipients.length) {
        await sendSellerNotificationEmails({
          origin: new URL(req.url).origin,
          type: "seller-low-stock",
          to: recipients,
          data: {
            vendorName: productSnapshot?.product?.vendorName || productSnapshot?.seller?.vendorName || "Piessang seller",
            productTitle: productSnapshot?.product?.title || "your product",
            variantLabel: wh || "inventory",
            currentStock: String(stockTotal),
          },
        });
      }
    }

    if (isProductPublished(productSnapshot) && stockTotal !== previousStockTotal) {
      const previousState = previousStockTotal > 0 ? "in_stock" : "out_of_stock";
      const nextState = stockTotal > 0 ? "in_stock" : "out_of_stock";
      if (previousState !== nextState) {
        const favoritedUsers = await listUsersWhoFavoritedProduct(pid);
        await Promise.all(
          favoritedUsers.map((user) =>
            dispatchCustomerNotification({
              origin: new URL(req.url).origin,
              userId: user.userId,
              type: nextState === "out_of_stock" ? "favorite_out_of_stock" : "favorite_back_in_stock",
              title: nextState === "out_of_stock" ? "A favourite is out of stock" : "A favourite is back in stock",
              message:
                nextState === "out_of_stock"
                  ? `${productSnapshot?.product?.title || "A saved product"} is currently out of stock.`
                  : `${productSnapshot?.product?.title || "A saved product"} is back in stock.`,
              href: `/products/${encodeURIComponent(productSnapshot?.product?.slug || productSnapshot?.docId || pid)}`,
              metadata: {
                productId: pid,
                stockState: nextState,
              },
              dedupeKey: `favorite-stock:${user.userId}:${pid}:product:${nextState}`,
              email: user.email || "",
              phone: user.phone || "",
              emailType: nextState === "out_of_stock" ? "favorite-out-of-stock" : "favorite-back-in-stock",
              emailData: {
                productTitle: productSnapshot?.product?.title || "A saved product",
                variantLabel: "",
              },
              smsType: nextState === "out_of_stock" ? "favorite-out-of-stock" : "favorite-back-in-stock",
              smsData: {
                productTitle: productSnapshot?.product?.title || "A saved product",
              },
              pushType: nextState === "out_of_stock" ? "favorite-out-of-stock" : "favorite-back-in-stock",
              pushVariables: {
                productTitle: productSnapshot?.product?.title || "A saved product",
                link: `/products/${encodeURIComponent(productSnapshot?.product?.slug || productSnapshot?.docId || pid)}`,
              },
            }),
          ),
        );
      }
    }

    return ok({ message: "Inventory row updated.", warehouse_id: wh });
  }catch(e){
    if (String(e.message)==="NOT_FOUND")     return err(404,"Not Found","Product not found.");
    if (String(e.message)==="ROW_NOT_FOUND") return err(404,"Not Found","No inventory row for that warehouse_id.");
    console.error("inventory/update failed:", e);
    return err(500,"Unexpected Error","Failed to update inventory row.");
  }
}
