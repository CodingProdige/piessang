export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { campaignsCollection } from "@/lib/campaigns";
import { recordCampaignClick, recordCampaignImpression } from "@/lib/campaign-serving";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const body = await req.json().catch(() => ({}));
    const action = toStr(body?.action).toLowerCase();
    const campaignId = toStr(body?.campaignId);
    const productId = toStr(body?.productId);
    const placement = toStr(body?.placement).toLowerCase();
    const sessionId = toStr(body?.sessionId);
    const userId = toStr(body?.userId) || null;

    if (!["impression", "click"].includes(action)) {
      return err(400, "Invalid Action", "action must be impression or click.");
    }
    if (!campaignId || !productId || !placement || !sessionId) {
      return err(400, "Missing Fields", "campaignId, productId, placement, and sessionId are required.");
    }

    const campaignSnap = await campaignsCollection(db).doc(campaignId).get();
    if (!campaignSnap.exists) return err(404, "Not Found", "Campaign could not be found.");
    const campaign = campaignSnap.data() || {};

    if (action === "impression") {
      await recordCampaignImpression({ db, campaignId, productId, placement, userId, sessionId });
      return ok({ tracked: true, action });
    }

    const result = await recordCampaignClick({
      db,
      campaignId,
      productId,
      placement,
      userId,
      sessionId,
      cost: Number(campaign?.budget?.maxCpc || 0),
    });
    return ok({ tracked: true, action, ...result });
  } catch (error) {
    return err(500, "Tracking Failed", error?.message || "Unable to track campaign event.");
  }
}
