export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { PRODUCT_ENGAGEMENT_BADGE_CONFIG } from "@/lib/analytics/product-engagement-badges";
import { loadProductEngagementBadgeSettings } from "@/lib/platform/product-engagement-badge-settings";
import { summarizeMarketplaceProductEngagement } from "@/lib/analytics/product-engagement";

function toNum(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const loadedSettings = await loadProductEngagementBadgeSettings().catch(() => PRODUCT_ENGAGEMENT_BADGE_CONFIG);
    const days = Math.max(1, Math.min(90, toNum(searchParams.get("days")) || Number(loadedSettings?.windowDays || PRODUCT_ENGAGEMENT_BADGE_CONFIG.windowDays)));
    const limit = Math.max(1, Math.min(24, toNum(searchParams.get("limit")) || 8));
    const metric = String(searchParams.get("metric") || "blended").trim().toLowerCase();
    const clickBadgeThreshold = Math.max(
      1,
      toNum(searchParams.get("clickBadgeThreshold")) || Number(loadedSettings?.popularClicksThreshold || PRODUCT_ENGAGEMENT_BADGE_CONFIG.popularClicksThreshold),
    );

    const summary = await summarizeMarketplaceProductEngagement({ days });
    const items = Array.isArray(summary?.topProducts)
      ? summary.topProducts
          .map((entry) => ({
            productId: String(entry?.productId || "").trim(),
            title: String(entry?.title || "").trim(),
            clicks: Number(entry?.clicks || 0),
            productViews: Number(entry?.productViews || 0),
            impressions: Number(entry?.impressions || 0),
            hovers: Number(entry?.hovers || 0),
            ctr: Number(entry?.ctr || 0),
            score:
              Number(entry?.productViews || 0) * 4 +
              Number(entry?.clicks || 0) * 2 +
              Number(entry?.hovers || 0),
            hasHighClicks: Number(entry?.clicks || 0) >= clickBadgeThreshold,
          }))
          .filter((entry) => entry.productId)
          .sort((left, right) => {
            if (metric === "clicked") return right.clicks - left.clicks;
            if (metric === "viewed") return right.productViews - left.productViews;
            return right.score - left.score;
          })
          .slice(0, limit)
      : [];

    return NextResponse.json({ ok: true, data: { items } });
  } catch (error) {
    console.error("top product engagement failed:", error);
    return NextResponse.json(
      { ok: false, title: "Server Error", message: "Unable to load top product engagement right now." },
      { status: 500 },
    );
  }
}
