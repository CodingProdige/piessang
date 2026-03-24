export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  canManageSellerTeam,
  findSellerOwnerByIdentifier,
  getSellerAccessGrants,
  getSellerTeamMembers,
} from "@/lib/seller/team-admin";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sellerSlug = toStr(searchParams.get("sellerSlug") || searchParams.get("seller"));
    const uid = toStr(searchParams.get("uid"));
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    if (!sellerSlug) return err(400, "Missing Seller", "sellerSlug is required.");
    if (!uid) return err(400, "Missing UID", "uid is required.");

    const owner = await findSellerOwnerByIdentifier(sellerSlug);
    if (!owner) return err(404, "Seller Not Found", "Could not find a seller account for that seller slug.");

    const requesterSnap = await db.collection("users").doc(uid).get();
    if (!requesterSnap.exists) {
      return err(404, "User Not Found", "Could not find the requesting account.");
    }

    const requester = requesterSnap.data() || {};
    if (!canManageSellerTeam(requester, sellerSlug)) {
      return err(403, "Access Denied", "You do not have permission to manage this seller team.");
    }

    const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
    const team = seller?.team && typeof seller.team === "object" ? seller.team : {};
    const members = getSellerTeamMembers(team);
    const memberMetaByUid = {};
    await Promise.all(
      members
        .map((member) => String(member?.uid || "").trim())
        .filter(Boolean)
        .map(async (memberUid) => {
          try {
            const memberSnap = await db.collection("users").doc(memberUid).get();
            if (memberSnap.exists) {
              memberMetaByUid[memberUid] = memberSnap.data() || {};
            }
          } catch {
            // Ignore lookups that fail; the row will fall back to seller metadata.
          }
        }),
    );

    return ok({
      seller: {
        uid: owner.id,
        sellerSlug: toStr(seller?.sellerSlug || seller?.groupSellerSlug || sellerSlug),
        sellerCode: toStr(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode || sellerSlug),
        vendorName: toStr(seller?.vendorName || seller?.groupVendorName || ""),
        teamRole: toStr(seller?.teamRole || "admin").toLowerCase(),
      },
      members: getSellerTeamMembers(team, memberMetaByUid),
      accessGrants: getSellerAccessGrants(team),
      canManage: true,
    });
  } catch (e) {
    console.error("seller/team/get failed:", e);
    return err(500, "Unexpected Error", "Unable to load seller team.");
  }
}
