export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";
import { rebuildCatalogueMenuCounts } from "@/lib/catalogue/menu-counts";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

export async function GET(req) {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return err(401, "Unauthorized", "Cron authorization failed.");
    }

    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const startedAt = Date.now();
    const result = await rebuildCatalogueMenuCounts(db);
    const durationMs = Date.now() - startedAt;

    return ok({
      message: "Catalogue menu counts reconciled.",
      updatedCategories: result.updatedCategories,
      updatedSubCategories: result.updatedSubCategories,
      categoryCountKeys: Object.keys(result.categoryCounts).length,
      subCategoryCountKeys: Object.keys(result.subCategoryCounts).length,
      durationMs,
    });
  } catch (error) {
    console.error("catalogue-menu-counts cron failed:", error);
    return err(500, "Unexpected Error", "Failed to reconcile catalogue menu counts.");
  }
}
