export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status = 500, title = "Server Error", message = "Unknown error") =>
  NextResponse.json({ ok: false, title, message }, { status });

const norm = (value) => String(value ?? "").trim();
const normLower = (value) => norm(value).toLowerCase();
const money = (value) => Number(Number(value || 0).toFixed(2));

function getCustomerKey(order) {
  return (
    order?.meta?.orderedFor ||
    order?.order?.customerId ||
    order?.customer_snapshot?.customerId ||
    order?.customer_snapshot?.uid ||
    order?.customer_snapshot?.email ||
    order?.customer_snapshot?.account?.email ||
    null
  );
}

function getCustomerEmail(order) {
  return (
    order?.customer_snapshot?.email ||
    order?.customer_snapshot?.account?.email ||
    order?.customer_snapshot?.account?.contactEmail ||
    order?.customer_snapshot?.account?.phoneNumber ||
    null
  );
}

function getCustomerName(order) {
  return (
    order?.customer_snapshot?.account?.accountName ||
    order?.customer_snapshot?.fullName ||
    order?.customer_snapshot?.displayName ||
    order?.customer_snapshot?.name ||
    getCustomerEmail(order) ||
    "Unknown customer"
  );
}

function orderContainsVendor(order, vendorName) {
  const needle = normLower(vendorName);
  if (!needle) return false;

  const items = Array.isArray(order?.items) ? order.items : [];
  return items.some((item) => {
    const product = item?.product_snapshot?.product || item?.product_snapshot || item?.product || {};
    const recordVendor = normLower(
      product?.vendorName ||
        item?.seller?.vendorName ||
        item?.vendorName ||
        ""
    );
    return recordVendor === needle;
  });
}

export async function GET(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const { searchParams } = new URL(req.url);
    const vendorName = norm(searchParams.get("vendorName"));

    if (!vendorName) {
      return ok({ total_customers: 0, total_orders: 0, customers: [] });
    }

    const snap = await db.collection("orders_v2").get();
    const rows = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));

    const customers = new Map();

    for (const order of rows) {
      if (!orderContainsVendor(order, vendorName)) continue;

      const key = getCustomerKey(order);
      if (!key) continue;

      const orderTotal = money(
        order?.totals?.final_payable_incl ??
          order?.totals?.final_incl ??
          order?.payment?.required_amount_incl ??
          order?.payment?.paid_amount_incl ??
          0
      );
      const orderDate = order?.timestamps?.createdAt || null;

      const current = customers.get(key) || {
        customer_key: key,
        customer_id: order?.customer_snapshot?.customerId || order?.customer_snapshot?.uid || null,
        name: getCustomerName(order),
        email: getCustomerEmail(order),
        orders: 0,
        total_spent_incl: 0,
        last_order_at: null,
        recent_order_number: null,
        recent_status: order?.order?.status?.order || null,
      };

      current.orders += 1;
      current.total_spent_incl = money(current.total_spent_incl + orderTotal);

      if (!current.last_order_at || (orderDate && new Date(orderDate).getTime() > new Date(current.last_order_at).getTime())) {
        current.last_order_at = orderDate;
        current.recent_order_number = order?.order?.orderNumber || null;
        current.recent_status = order?.order?.status?.order || current.recent_status;
      }

      customers.set(key, current);
    }

    const list = Array.from(customers.values()).sort((a, b) => {
      const left = a.last_order_at ? new Date(a.last_order_at).getTime() : 0;
      const right = b.last_order_at ? new Date(b.last_order_at).getTime() : 0;
      return right - left;
    });

    return ok({
      vendor_name: vendorName,
      total_customers: list.length,
      total_orders: list.reduce((sum, item) => sum + (Number(item.orders) || 0), 0),
      customers: list,
    });
  } catch (cause) {
    console.error("seller customers summary failed:", cause);
    return err(500, "Unexpected Error", "Failed to build seller customer summary.");
  }
}
