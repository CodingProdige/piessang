export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import {
  campaignsCollection,
  canManageCampaign,
  getSellerIdentifiers,
  isSystemAdminUser,
  normalizeCampaignRecord,
} from "@/lib/campaigns";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function GET(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to load campaigns.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    const adminMode = String(new URL(req.url).searchParams.get("adminMode") || "").toLowerCase() === "true";
    const isAdmin = isSystemAdminUser(requester);

    if (adminMode && !isAdmin) {
      return err(403, "Access Denied", "Only Piessang admins can review campaigns.");
    }

    const sellerSlugParam = toStr(new URL(req.url).searchParams.get("sellerSlug"));
    const sellerCodeParam = toStr(new URL(req.url).searchParams.get("sellerCode"));
    const statusFilter = toStr(new URL(req.url).searchParams.get("status")).toLowerCase();
    const includeAnalytics = toStr(new URL(req.url).searchParams.get("includeAnalytics")).toLowerCase() !== "false";
    const campaignIdParam = toStr(new URL(req.url).searchParams.get("campaignId"));

    const snap = await campaignsCollection(db).get();
    let items = snap.docs.map((doc) => normalizeCampaignRecord(doc.id, doc.data()));

    if (adminMode) {
      if (sellerSlugParam) items = items.filter((item) => toStr(item.sellerSlug).toLowerCase() === sellerSlugParam.toLowerCase());
      if (sellerCodeParam) items = items.filter((item) => toStr(item.sellerCode).toLowerCase() === sellerCodeParam.toLowerCase());
    } else {
      items = items.filter((item) => canManageCampaign(requester, item));
      const identifiers = getSellerIdentifiers(requester);
      if (sellerSlugParam || sellerCodeParam) {
        items = items.filter((item) => {
          const sellerSlug = toStr(item.sellerSlug).toLowerCase();
          const sellerCode = toStr(item.sellerCode).toLowerCase();
          return (
            (sellerSlugParam && sellerSlug === sellerSlugParam.toLowerCase()) ||
            (sellerCodeParam && sellerCode === sellerCodeParam.toLowerCase()) ||
            identifiers.has(sellerSlug) ||
            identifiers.has(sellerCode)
          );
        });
      }
    }

    if (statusFilter && statusFilter !== "all") {
      items = items.filter((item) => toStr(item.status).toLowerCase() === statusFilter);
    }

    const selectedCampaign = campaignIdParam ? items.find((item) => toStr(item.docId) === campaignIdParam) || null : null;

    items.sort((a, b) => {
      const aTime = new Date(a?.timestamps?.updatedAt || a?.timestamps?.createdAt || 0).getTime();
      const bTime = new Date(b?.timestamps?.updatedAt || b?.timestamps?.createdAt || 0).getTime();
      return bTime - aTime;
    });

    const counts = items.reduce(
      (acc, item) => {
        acc.total += 1;
        const status = toStr(item?.status).toLowerCase();
        const pendingUpdateDecision = toStr(item?.pendingUpdate?.moderation?.decision).toLowerCase();
        if (status === "draft") acc.draft += 1;
        if (status === "submitted" || status === "in_review" || pendingUpdateDecision === "submitted") acc.pendingReview += 1;
        if (status === "approved" || status === "scheduled" || status === "active") acc.approvedOrLive += 1;
        if (status === "rejected") acc.rejected += 1;
        if (status === "paused") acc.paused += 1;
        if (item?.hasPendingUpdate) acc.pendingUpdates += 1;
        return acc;
      },
      { total: 0, draft: 0, pendingReview: 0, approvedOrLive: 0, rejected: 0, paused: 0, pendingUpdates: 0 },
    );

    let analytics = {
      daily: [],
      placements: [],
    };
    let detailAnalytics = {
      daily: [],
      placements: [],
    };

    if (includeAnalytics && items.length) {
      const campaignIds = new Set(items.map((item) => toStr(item.docId)).filter(Boolean));
      const dailySnap = await db.collection("campaign_daily_stats_v1").get().catch(() => null);
      const clickSnap = await db.collection("campaign_clicks_v1").get().catch(() => null);

      const lastSevenKeys = Array.from({ length: 7 }).map((_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - index));
        return date.toISOString().slice(0, 10);
      });

      const dailyMap = new Map(
        lastSevenKeys.map((dayKey) => [
          dayKey,
          { dayKey, impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 },
        ]),
      );

      for (const doc of dailySnap?.docs || []) {
        const data = doc.data() || {};
        const campaignId = toStr(data?.campaignId);
        const dayKey = toStr(data?.dayKey);
        if (!campaignIds.has(campaignId) || !dailyMap.has(dayKey)) continue;
        const current = dailyMap.get(dayKey);
        current.impressions += Number(data?.impressions || 0);
        current.clicks += Number(data?.clicks || 0);
        current.spend += Number(data?.spend || 0);
        current.conversions += Number(data?.conversions || 0);
        current.revenue += Number(data?.revenue || 0);
      }

      const placementMap = new Map();
      const detailPlacementMap = new Map();
      for (const doc of clickSnap?.docs || []) {
        const data = doc.data() || {};
        const campaignId = toStr(data?.campaignId);
        if (!campaignIds.has(campaignId)) continue;
        const placement = toStr(data?.placement || "unknown");
        const current = placementMap.get(placement) || { placement, clicks: 0, spend: 0 };
        current.clicks += 1;
        current.spend += Number(data?.cpcAmount || 0);
        placementMap.set(placement, current);

        if (selectedCampaign && campaignId === selectedCampaign.docId) {
          const detailCurrent = detailPlacementMap.get(placement) || { placement, clicks: 0, spend: 0 };
          detailCurrent.clicks += 1;
          detailCurrent.spend += Number(data?.cpcAmount || 0);
          detailPlacementMap.set(placement, detailCurrent);
        }
      }

      analytics = {
        daily: Array.from(dailyMap.values()),
        placements: Array.from(placementMap.values()).sort((a, b) => b.clicks - a.clicks),
      };

      if (selectedCampaign) {
        const selectedDailyMap = new Map(
          lastSevenKeys.map((dayKey) => [
            dayKey,
            { dayKey, impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 },
          ]),
        );
        for (const doc of dailySnap?.docs || []) {
          const data = doc.data() || {};
          if (toStr(data?.campaignId) !== selectedCampaign.docId) continue;
          const dayKey = toStr(data?.dayKey);
          const current = selectedDailyMap.get(dayKey);
          if (!current) continue;
          current.impressions += Number(data?.impressions || 0);
          current.clicks += Number(data?.clicks || 0);
          current.spend += Number(data?.spend || 0);
          current.conversions += Number(data?.conversions || 0);
          current.revenue += Number(data?.revenue || 0);
        }
        detailAnalytics = {
          daily: Array.from(selectedDailyMap.values()),
          placements: Array.from(detailPlacementMap.values()).sort((a, b) => b.clicks - a.clicks),
        };
      }
    }

    return ok({ items, counts, analytics, selectedCampaign, detailAnalytics });
  } catch (error) {
    return err(500, "Load Failed", error?.message || "Unable to load campaigns.");
  }
}
