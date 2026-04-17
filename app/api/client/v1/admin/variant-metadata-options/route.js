export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import {
  DEFAULT_VARIANT_METADATA_SELECT_OPTIONS,
  sanitizeVariantMetadataSelectOptionsConfig,
} from "@/lib/catalogue/variant-metadata-select-options";
import {
  loadVariantMetadataSelectOptionsConfig,
  VARIANT_METADATA_OPTIONS_COLLECTION,
  VARIANT_METADATA_OPTIONS_DOC,
} from "@/lib/catalogue/variant-metadata-options-store";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

async function requireAdminContext() {
  const sessionUser = await requireSessionUser();
  if (!sessionUser?.uid) return { error: err(401, "Unauthorized", "Sign in again to manage variant metadata options.") };

  const db = getAdminDb();
  if (!db) return { error: err(500, "Firebase Not Configured", "Server Firestore access is not configured.") };

  const userSnap = await db.collection("users").doc(sessionUser.uid).get();
  const requester = userSnap.exists ? userSnap.data() || {} : {};
  if (!isSystemAdminUser(requester)) {
    return { error: err(403, "Access Denied", "Only system admins can manage variant metadata options.") };
  }
  return { db, sessionUser };
}

export async function GET() {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;
  try {
    const config = await loadVariantMetadataSelectOptionsConfig();
    return ok({ config, defaults: DEFAULT_VARIANT_METADATA_SELECT_OPTIONS });
  } catch (e) {
    console.error("admin/variant-metadata-options get failed:", e);
    return err(500, "Unexpected Error", "Unable to load variant metadata options.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}

export async function POST(req) {
  const auth = await requireAdminContext();
  if (auth.error) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const config = sanitizeVariantMetadataSelectOptionsConfig(body?.config ?? body ?? {});
    await auth.db.collection(VARIANT_METADATA_OPTIONS_COLLECTION).doc(VARIANT_METADATA_OPTIONS_DOC).set(
      {
        config,
        updatedBy: auth.sessionUser.uid,
        timestamps: {
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
    const nextConfig = await loadVariantMetadataSelectOptionsConfig();
    return ok({ config: nextConfig, message: "Variant metadata options saved." });
  } catch (e) {
    console.error("admin/variant-metadata-options update failed:", e);
    return err(500, "Unexpected Error", "Unable to save variant metadata options.", {
      details: String(e?.message || "").slice(0, 400),
    });
  }
}
