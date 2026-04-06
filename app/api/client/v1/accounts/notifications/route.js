export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/security";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  listCustomerNotifications,
  markAllCustomerNotificationsRead,
  markCustomerNotificationRead,
} from "@/lib/notifications/customer-inbox";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function GET() {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to view notifications.");

    const items = await listCustomerNotifications(sessionUser.uid);
    return ok({ items, unreadCount: items.filter((item) => !item.read).length });
  } catch (error) {
    return err(500, "Notifications Fetch Failed", error?.message || "Unexpected error loading notifications.");
  }
}

export async function POST(request) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to manage notifications.");

    const body = await request.json().catch(() => ({}));
    const action = toStr(body?.action).toLowerCase();
    if (action === "mark-read") {
      await markCustomerNotificationRead(body?.notificationId, sessionUser.uid);
      return ok({});
    }
    if (action === "mark-all-read") {
      await markAllCustomerNotificationsRead(sessionUser.uid);
      return ok({});
    }
    return err(400, "Invalid Action", "Unknown notification action.");
  } catch (error) {
    return err(500, "Notification Update Failed", error?.message || "Unexpected error updating notifications.");
  }
}
