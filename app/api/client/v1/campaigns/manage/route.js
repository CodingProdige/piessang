export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import {
  buildCampaignWritePayload,
  campaignsCollection,
  normalizeCampaignInput,
  normalizeCampaignRecord,
  getSellerIdentifiers,
  isSystemAdminUser,
  isLiveEditableCampaignStatus,
} from "@/lib/campaigns";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to manage campaigns.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    const identifiers = getSellerIdentifiers(requester);
    const isAdmin = isSystemAdminUser(requester);

    const body = await req.json().catch(() => ({}));
    const campaignId = toStr(body?.campaignId);
    const action = toStr(body?.action).toLowerCase() || "save";
    const sellerSlug = toStr(body?.sellerSlug);
    const sellerCode = toStr(body?.sellerCode);
    const vendorName = toStr(body?.vendorName || requester?.seller?.vendorName || requester?.sellerVendorName || requester?.accountName);

    if (!sellerSlug && !sellerCode) {
      return err(400, "Missing Seller", "Select a seller account before saving a campaign.");
    }
    if (!isAdmin && !identifiers.has(sellerSlug.toLowerCase()) && !identifiers.has(sellerCode.toLowerCase())) {
      return err(403, "Access Denied", "You can only manage campaigns for your seller account.");
    }

    const input = normalizeCampaignInput(body?.campaign || {});
    if (!input.name) return err(400, "Missing Fields", "Campaign name is required.");
    if (!input.promotedProducts.length && input.type === "sponsored_products") {
      return err(400, "Missing Products", "Choose at least one product to promote.");
    }
    if (!input.targeting.placements.length) {
      return err(400, "Missing Placement", "Choose at least one ad placement.");
    }
    if (input.budget.dailyBudget <= 0 || input.budget.totalBudget <= 0 || input.budget.maxCpc <= 0) {
      return err(400, "Budget Incomplete", "Add a daily budget, total budget, and max CPC before saving.");
    }

    const ref = campaignId ? campaignsCollection(db).doc(campaignId) : campaignsCollection(db).doc();
    const currentSnap = await ref.get();
    const current = currentSnap.exists ? normalizeCampaignRecord(currentSnap.id, currentSnap.data()) : null;

    const nowIso = new Date().toISOString();
    const isLiveUpdate = Boolean(current?.docId && isLiveEditableCampaignStatus(current?.status));

    let nextStatus = current?.status || "draft";
    let moderationPatch = null;
    if (action === "pause") {
      nextStatus = "paused";
    } else if (action === "resume") {
      nextStatus = "approved";
    } else if (!isLiveUpdate) {
      if (action === "submit") {
        nextStatus = "submitted";
        moderationPatch = {
          submittedAt: nowIso,
          submittedBy: sessionUser.uid,
          reviewedAt: null,
          reviewedBy: null,
          notes: null,
          decision: null,
        };
      } else {
        nextStatus = current?.status && current.status !== "rejected" ? current.status : "draft";
      }
    } else {
      nextStatus = current?.status && current.status !== "rejected" ? current.status : "draft";
    }

    if (isLiveUpdate && ["save", "submit"].includes(action)) {
      const normalized = normalizeCampaignInput(input);
      await ref.set(
        {
          pendingUpdate: {
            name: normalized.name,
            type: normalized.type,
            budget: normalized.budget,
            schedule: normalized.schedule,
            targeting: normalized.targeting,
            promotedProducts: normalized.promotedProducts,
            creative: normalized.creative,
            moderation: {
              submittedAt: action === "submit" ? nowIso : current?.pendingUpdate?.moderation?.submittedAt || null,
              submittedBy: action === "submit" ? sessionUser.uid : current?.pendingUpdate?.moderation?.submittedBy || sessionUser.uid,
              reviewedAt: null,
              reviewedBy: null,
              notes: null,
              decision: action === "submit" ? "submitted" : "draft",
            },
            timestamps: {
              updatedAt: nowIso,
              updatedBy: sessionUser.uid,
            },
          },
          timestamps: {
            updatedAt: current?.timestamps?.updatedAt || nowIso,
            updatedBy: sessionUser.uid,
          },
        },
        { merge: true },
      );
    } else {
      await ref.set(
        buildCampaignWritePayload({
          current,
          input,
          sellerCode,
          sellerSlug,
          vendorName,
          actorUid: sessionUser.uid,
          nextStatus,
          moderationPatch,
        }),
        { merge: true },
      );
    }

    const saved = await ref.get();
    return ok({ item: normalizeCampaignRecord(saved.id, saved.data()) });
  } catch (error) {
    return err(500, "Save Failed", error?.message || "Unable to save campaign.");
  }
}
