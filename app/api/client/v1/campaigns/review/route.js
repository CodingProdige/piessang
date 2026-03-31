export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { campaignsCollection, isSystemAdminUser, normalizeCampaignRecord } from "@/lib/campaigns";

const ok = (data = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export async function POST(req) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to review campaigns.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    if (!isSystemAdminUser(requester)) {
      return err(403, "Access Denied", "Only Piessang admins can review campaigns.");
    }

    const body = await req.json().catch(() => ({}));
    const campaignId = toStr(body?.campaignId);
    const decision = toStr(body?.decision).toLowerCase();
    const notes = toStr(body?.notes);
    if (!campaignId) return err(400, "Missing Campaign", "Campaign id is required.");
    if (!["approve", "reject", "request_changes"].includes(decision)) {
      return err(400, "Invalid Decision", "Choose approve, reject, or request changes.");
    }

    const ref = campaignsCollection(db).doc(campaignId);
    const snap = await ref.get();
    if (!snap.exists) return err(404, "Not Found", "Campaign could not be found.");

    const current = normalizeCampaignRecord(snap.id, snap.data());
    const reviewedAt = new Date().toISOString();
    if (current?.pendingUpdate) {
      if (decision === "approve") {
        const pending = current.pendingUpdate;
        await ref.set(
          {
            name: pending.name,
            type: pending.type,
            budget: pending.budget,
            schedule: pending.schedule,
            targeting: pending.targeting,
            promotedProducts: pending.promotedProducts,
            creative: pending.creative,
            status: current.status === "paused" ? "paused" : "approved",
            moderation: {
              ...current.moderation,
              reviewedAt,
              reviewedBy: sessionUser.uid,
              notes: notes || null,
              decision,
            },
            pendingUpdate: FieldValue.delete(),
            timestamps: {
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: sessionUser.uid,
            },
          },
          { merge: true },
        );
      } else {
        await ref.set(
          {
            pendingUpdate: {
              ...pendingUpdateToWriteShape(current.pendingUpdate),
              moderation: {
                ...(current.pendingUpdate?.moderation || {}),
                reviewedAt,
                reviewedBy: sessionUser.uid,
                notes: notes || null,
                decision,
              },
            },
            timestamps: {
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: sessionUser.uid,
            },
          },
          { merge: true },
        );
      }
    } else {
      const nextStatus = decision === "approve" ? "approved" : "rejected";
      await ref.set(
        {
          status: nextStatus,
          moderation: {
            reviewedAt,
            reviewedBy: sessionUser.uid,
            notes: notes || null,
            decision,
          },
          timestamps: {
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: sessionUser.uid,
          },
        },
        { merge: true },
      );
    }

    const saved = await ref.get();
    return ok({ item: normalizeCampaignRecord(saved.id, saved.data()) });
  } catch (error) {
    return err(500, "Review Failed", error?.message || "Unable to review campaign.");
  }
}

function pendingUpdateToWriteShape(pending = {}) {
  return {
    name: pending?.name || "",
    type: pending?.type || "sponsored_products",
    budget: pending?.budget || {},
    schedule: pending?.schedule || {},
    targeting: pending?.targeting || {},
    promotedProducts: Array.isArray(pending?.promotedProducts) ? pending.promotedProducts : [],
    creative: pending?.creative || {},
  };
}
