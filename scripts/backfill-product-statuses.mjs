import path from "node:path";
import { existsSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function loadLocalEnvFiles() {
  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    try {
      process.loadEnvFile(filePath);
    } catch (error) {
      console.warn(`Unable to load env file ${filePath}:`, error instanceof Error ? error.message : String(error));
    }
  }
}

loadLocalEnvFiles();

function normalizePrivateKey(value = "") {
  return String(value).replace(/\\n/g, "\n").trim();
}

function getAdminDb() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_PROJECT_ID ||
    "";
  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL ||
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    "";
  const privateKey = normalizePrivateKey(
    process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  );
  const databaseId = process.env.PIESSANG_FIREBASE_DATABASE_ID || "";

  if (!projectId || !clientEmail || !privateKey || !databaseId) {
    throw new Error("Missing Firebase admin env for product status backfill.");
  }

  const app =
    getApps().find((entry) => entry.name === "piessang-product-status-backfill") ||
    initializeApp(
      {
        credential: cert({ projectId, clientEmail, privateKey }),
      },
      "piessang-product-status-backfill",
    );

  return getFirestore(app, databaseId);
}

function toStatusText(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeStatusText(value) {
  return toStatusText(value).replace(/\s+/g, " ").trim();
}

function statusValuesDiffer(left, right) {
  return normalizeStatusText(left) !== normalizeStatusText(right);
}

function statusImageCount(data) {
  return Array.isArray(data?.media?.images) ? data.media.images.filter((entry) => Boolean(entry?.imageUrl)).length : 0;
}

function statusVariantCount(data) {
  return Array.isArray(data?.variants) ? data.variants.length : 0;
}

function summarizeStatusVariantLabels(data) {
  if (!Array.isArray(data?.variants)) return "";
  return data.variants
    .map((variant) => toStatusText(variant?.label || variant?.variant_id || ""))
    .filter(Boolean)
    .join(", ");
}

function hasMeaningfulProductPendingDiff(product) {
  const live = product?.live_snapshot || null;
  if (!live) return false;

  const pending = product || {};
  const rows = [
    [toStatusText(live?.product?.title, "Not set"), toStatusText(pending?.product?.title, "Not set")],
    [toStatusText(live?.product?.brandTitle || "", "Not set"), toStatusText(pending?.product?.brandTitle || "", "Not set")],
    [toStatusText(live?.product?.vendorName || "", "Not set"), toStatusText(pending?.product?.vendorName || "", "Not set")],
    [toStatusText(live?.grouping?.category || "", "Not set"), toStatusText(pending?.grouping?.category || "", "Not set")],
    [toStatusText(live?.grouping?.subCategory || "", "Not set"), toStatusText(pending?.grouping?.subCategory || "", "Not set")],
    [toStatusText(live?.fulfillment?.mode || "", "Not set"), toStatusText(pending?.fulfillment?.mode || "", "Not set")],
    [String(statusImageCount(live)), String(statusImageCount(pending))],
    [
      `${statusVariantCount(live)}${summarizeStatusVariantLabels(live) ? ` • ${summarizeStatusVariantLabels(live)}` : ""}`,
      `${statusVariantCount(pending)}${summarizeStatusVariantLabels(pending) ? ` • ${summarizeStatusVariantLabels(pending)}` : ""}`,
    ],
    [toStatusText(live?.product?.overview || "", "Not set"), toStatusText(pending?.product?.overview || "", "Not set")],
    [toStatusText(live?.product?.description || "", "Not set"), toStatusText(pending?.product?.description || "", "Not set")],
  ];

  return rows.some(([left, right]) => statusValuesDiffer(left, right));
}

function buildProductStatus(product) {
  const stored = toStatusText(product?.moderation?.status, "draft").toLowerCase() || "draft";
  const hasLiveSnapshot = Boolean(product?.live_snapshot && typeof product.live_snapshot === "object");
  const hasMeaningfulPendingUpdate = hasLiveSnapshot && hasMeaningfulProductPendingDiff(product);
  const isStalePendingState = hasLiveSnapshot && !hasMeaningfulPendingUpdate;
  const isActive = product?.placement?.isActive !== false;

  let current = stored;
  if ((stored === "in_review" || stored === "pending") && isStalePendingState) {
    current = isActive ? "published" : "draft";
  } else if (stored === "published" && !isActive) {
    current = "draft";
  } else if (!stored) {
    current = isActive ? "published" : "draft";
  }

  return {
    stored,
    current,
    isStalePendingState,
  };
}

function wasPreviouslyPublished(product) {
  const live = product?.live_snapshot || null;
  if (!live || typeof live !== "object") return false;
  const liveStatus = toStatusText(live?.moderation?.status, "").toLowerCase();
  if (liveStatus === "published") return true;
  if (live?.placement?.isActive === true) return true;
  if (toStatusText(live?.marketplace?.firstPublishedAt)) return true;
  return false;
}

function buildRepairPatch(data) {
  const status = buildProductStatus(data);
  const patch = {};
  let changed = false;

  const shouldRestorePublished =
    status.isStalePendingState &&
    wasPreviouslyPublished(data) &&
    ["draft", "in_review", "pending", "rejected"].includes(status.stored);

  if (shouldRestorePublished) {
    patch["moderation.status"] = "published";
    patch["placement.isActive"] = true;
    changed = true;
  } else if (status.current !== status.stored) {
    patch["moderation.status"] = status.current;
    changed = true;
  }

  if (status.isStalePendingState && data?.live_snapshot) {
    patch.live_snapshot = FieldValue.delete();
    changed = true;
  }

  if (changed) {
    patch["timestamps.updatedAt"] = FieldValue.serverTimestamp();
  }

  return { changed, patch, status };
}

function chunk(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

async function main() {
  const db = getAdminDb();
  const snap = await db.collection("products_v2").get();
  const repairs = snap.docs
    .map((docSnap) => {
      const data = docSnap.data() || {};
      const repair = buildRepairPatch(data);
      return {
        ref: docSnap.ref,
        id: docSnap.id,
        repair,
      };
    })
    .filter((entry) => entry.repair.changed);

  let updated = 0;
  for (const part of chunk(repairs, 450)) {
    const batch = db.batch();
    for (const entry of part) {
      batch.update(entry.ref, entry.repair.patch);
      updated += 1;
    }
    await batch.commit();
  }

  console.log(JSON.stringify({
    ok: true,
    scanned: snap.size,
    updated,
  }, null, 2));
}

main().catch((error) => {
  console.error("product status backfill failed:", error);
  process.exitCode = 1;
});
