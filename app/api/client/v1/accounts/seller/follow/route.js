export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import {
  followSeller,
  getSellerFollowState,
  getSellerFollowerCount,
  listFollowedSellers,
  unfollowSeller,
} from "@/lib/social/seller-follows";
import { createSellerNotification } from "@/lib/notifications/seller-inbox";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

async function resolveSeller(searchParams, body = {}) {
  const sellerIdentifier =
    toStr(searchParams?.get("seller")) ||
    toStr(searchParams?.get("sellerSlug")) ||
    toStr(searchParams?.get("sellerCode")) ||
    toStr(body?.seller) ||
    toStr(body?.sellerSlug) ||
    toStr(body?.sellerCode);
  if (!sellerIdentifier) return null;

  const owner = await findSellerOwnerByIdentifier(sellerIdentifier);
  if (!owner) return null;

  const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
  return {
    ownerUid: toStr(owner.id),
    sellerCode: toStr(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode || sellerIdentifier),
    sellerSlug: toStr(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug || sellerIdentifier),
    vendorName: toStr(seller?.vendorName || seller?.groupVendorName || sellerIdentifier),
  };
}

export async function GET(request) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const sessionUser = await requireSessionUser();
    const searchParams = request.nextUrl.searchParams;

    if (searchParams.get("mode") === "following") {
      if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to load followed sellers.");
      const items = await listFollowedSellers(sessionUser.uid);
      return ok({ items, count: items.length });
    }

    const seller = await resolveSeller(searchParams);
    if (!seller) return err(404, "Seller Not Found", "We could not find that seller profile.");

    const followerCount = await getSellerFollowerCount(seller);
    if (!sessionUser?.uid) {
      return ok({ following: false, followerCount, seller });
    }

    const state = await getSellerFollowState(sessionUser.uid, seller);
    return ok({ ...state, seller });
  } catch (error) {
    return err(500, "Follow State Failed", error?.message || "Unexpected error loading follow state.");
  }
}

export async function POST(request) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to follow sellers.");

    const body = await request.json().catch(() => ({}));
    const action = toStr(body?.action || "follow").toLowerCase();
    const seller = await resolveSeller(request.nextUrl.searchParams, body);
    if (!seller) return err(404, "Seller Not Found", "We could not find that seller profile.");

    if (action === "unfollow") {
      await unfollowSeller({ userId: sessionUser.uid, sellerCode: seller.sellerCode, sellerSlug: seller.sellerSlug });
      const followerCount = await getSellerFollowerCount(seller);
      return ok({ following: false, followerCount, seller });
    }

    const already = await getSellerFollowState(sessionUser.uid, seller);
    await followSeller({
      userId: sessionUser.uid,
      sellerCode: seller.sellerCode,
      sellerSlug: seller.sellerSlug,
      vendorName: seller.vendorName,
      followerName: sessionUser.displayName || sessionUser.email?.split("@")[0] || "Piessang customer",
      followerEmail: sessionUser.email || "",
    });

    if (!already.following) {
      await createSellerNotification({
        sellerCode: seller.sellerCode,
        sellerSlug: seller.sellerSlug,
        type: "new_follower",
        title: "You gained a new follower",
        message: `${sessionUser.displayName || sessionUser.email?.split("@")[0] || "A shopper"} just followed your seller profile.`,
        href: `/seller/dashboard?section=notifications`,
        metadata: {
          followerUid: sessionUser.uid,
          followerEmail: sessionUser.email || null,
          followerName: sessionUser.displayName || null,
        },
      });
    }

    const state = await getSellerFollowState(sessionUser.uid, seller);
    return ok({ ...state, seller });
  } catch (error) {
    return err(500, "Follow Update Failed", error?.message || "Unexpected error updating follow state.");
  }
}
