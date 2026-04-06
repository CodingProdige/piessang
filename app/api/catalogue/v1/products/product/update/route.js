export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getServerAuthBootstrap } from "@/lib/auth/server";
import { collectSellerNotificationEmails, sendSellerNotificationEmails } from "@/lib/seller/notifications";
import { findBrandRecord, findOrCreatePendingBrandRequest } from "@/lib/catalogue/brand-upsert";
import { ensureSkuUnique, ensureUniqueProductCode } from "@/lib/catalogue/sku-uniqueness";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { isSellerAccountUnavailable } from "@/lib/seller/account-status";
import { toSellerSlug } from "@/lib/seller/vendor-name";
import { ensureSellerCode } from "@/lib/seller/seller-code";
import { ensureCatalogueTaxonomySeed } from "@/lib/marketplace/fees-store";
import { refreshCartsForSaleChange } from "@/lib/cart/sale-refresh";
import {
  getVariantActivePriceIncl,
  isProductPublished,
  listFollowersForSeller,
  listUsersWhoFavoritedProduct,
} from "@/lib/notifications/customer-inbox";
import { dispatchCustomerNotification } from "@/lib/notifications/customer-delivery";

const ok  = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) =>
  NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

/* ------------------ basic helpers ------------------ */
const is8   = (s) => /^\d{8}$/.test(String(s ?? "").trim());
const toStr = (v, f = "") => {
  if (v == null) return f;
  return String(v).trim();
};
const toBool= (v, f = false) =>
  typeof v === "boolean" ? v :
  typeof v === "number" ? v !== 0 :
  typeof v === "string" ? ["true","1","yes","y"].includes(v.toLowerCase()) :
  f;
const toInt = (v, f = 0) => Number.isFinite(+v) ? Math.trunc(+v) : f;

function normalizeKey(value) {
  return toStr(value).toLowerCase();
}

function buildAllowedSellerKeys(profile) {
  const keys = new Set();
  const add = (value) => {
    const normalized = normalizeKey(value);
    if (normalized) keys.add(normalized);
  };

  add(profile?.sellerSlug);
  add(profile?.sellerCode);
  add(profile?.sellerActiveSellerSlug);

  const managedAccounts = Array.isArray(profile?.sellerManagedAccounts) ? profile.sellerManagedAccounts : [];
  for (const item of managedAccounts) {
    add(item?.sellerSlug);
    add(item?.sellerCode);
  }

  return keys;
}

function canManageProduct(profile, { sellerSlug, sellerCode }) {
  const systemAccessType = normalizeKey(profile?.systemAccessType);
  if (systemAccessType === "admin") return true;

  if (!profile?.uid || profile?.isSeller !== true) return false;

  const allowedKeys = buildAllowedSellerKeys(profile);
  return allowedKeys.has(normalizeKey(sellerSlug)) || allowedKeys.has(normalizeKey(sellerCode));
}

function normalizeSlugCandidate(value) {
  return toStr(value).toLowerCase();
}

function collectSlugCandidates(item, colName) {
  const candidates = new Set();
  const add = (value) => {
    const normalized = normalizeSlugCandidate(value);
    if (normalized) candidates.add(normalized);
  };

  add(item?.docId);

  if (colName === "categories") {
    add(item?.category?.slug);
    add(item?.category?.title);
  }

  if (colName === "sub_categories") {
    add(item?.subCategory?.slug);
    add(item?.subCategory?.title);
  }

  return candidates;
}

async function findSingleBySlug(db, colName, slug) {
  const wanted = normalizeSlugCandidate(slug);
  if (!wanted) return { found: false, item: null, reason: "missing_slug" };

  const rs = await db.collection(colName).get();
  const matches = rs.docs.filter((docSnap) => {
    const data = docSnap.data() || {};
    const candidates = collectSlugCandidates({ ...data, docId: data?.docId || docSnap.id }, colName);
    return candidates.has(wanted);
  });

  if (matches.length === 0) return { found: false, item: null, reason: "not_found" };
  if (matches.length > 1) return { found: false, item: null, reason: "not_unique" };

  return { found: true, item: matches[0].data() || {}, reason: null };
}

async function ensureParentsActive(db, nextProduct) {
  const categorySlug = toStr(nextProduct?.grouping?.category);
  const subCategorySlug = toStr(nextProduct?.grouping?.subCategory);

  const parentChecks = await Promise.all([
    findSingleBySlug(db, "categories", categorySlug),
    findSingleBySlug(db, "sub_categories", subCategorySlug),
  ]);

  const parents = [
    { key: "category", slug: categorySlug, check: parentChecks[0] },
    { key: "subCategory", slug: subCategorySlug, check: parentChecks[1] },
  ];

  const invalid = [];
  for (const p of parents) {
    if (!p.slug) {
      invalid.push({ parent: p.key, slug: null, issue: "missing_slug" });
      continue;
    }

    if (!p.check.found) {
      invalid.push({ parent: p.key, slug: p.slug, issue: p.check.reason });
      continue;
    }

    const isActive = p.check.item?.placement?.isActive === true;
    if (!isActive) {
      invalid.push({ parent: p.key, slug: p.slug, issue: "inactive" });
    }
  }

  return {
    ok: invalid.length === 0,
    invalid,
  };
}

/* ------------------ title slug normalizer ------------------ */
/* Prevents duplicates even if case/spacing/punctuation differs */
function normalizeTitleSlug(title){
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")  // remove all spaces & punctuation
    .trim();
}

/* ------------------ deep merge ------------------ */
function deepMerge(target, patch) {
  if (patch == null || typeof patch !== "object") return target;
  const out = Array.isArray(target) ? [...target] : { ...target };

  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) &&
        typeof out[k] === "object" && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/* ------------------ existing sanitizers preserved ------------------ */
function parseKeywords(value){
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return String(raw)
    .split(",")
    .map(s => s.replace(/\s+/g," ").trim())
    .filter(Boolean)
    .map(s => s.toLowerCase())
    .filter((v,i,a)=>a.indexOf(v)===i)
    .slice(0, 100);
}

function sanitizeUrl(u){
  if (u == null) return null;
  const s = String(u).trim();
  if (!s) return null;
  if (/^(https?:\/\/|data:)/i.test(s)) return s;
  return null;
}

function sanitizeBlurHash(v){
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function parseImage(input, fallbackPos = null){
  if (!input)
    return { imageUrl: null, blurHashUrl: null, altText: null, ...(fallbackPos ? { position: fallbackPos } : {}) };

  if (typeof input === "string"){
    return { imageUrl: sanitizeUrl(input), blurHashUrl: null, altText: null, ...(fallbackPos ? { position: fallbackPos } : {}) };
  }

  if (typeof input === "object"){
    const imageUrl    = sanitizeUrl(input.imageUrl ?? input.url);
    const blurHashUrl = sanitizeBlurHash(input.blurHashUrl ?? input.blurhash ?? input.blurHash);
    const altText     = toStr(input.altText ?? input.alt ?? input.alt_text, null) || null;
    const pos = Number.isFinite(+input?.position) ? toInt(input.position) : undefined;
    const base = { imageUrl, blurHashUrl, altText };

    return pos != null ? { ...base, position: pos } :
           fallbackPos ? { ...base, position: fallbackPos } :
           base;
  }

  return { imageUrl: null, blurHashUrl: null, altText: null, ...(fallbackPos?{position:fallbackPos}:{}) };
}

function parseImages(value){
  let arr = [];

  if (Array.isArray(value)){
    arr = value.map((v,i)=>parseImage(v,i+1)).filter(o => o.imageUrl || o.blurHashUrl);
  } else if (value){
    const one = parseImage(value,1);
    if (one.imageUrl || one.blurHashUrl) arr=[one];
  }

  if (arr.length){
    arr = arr
      .map((it,i)=>({ ...it, position: Number.isFinite(+it.position) ? toInt(it.position,i+1) : (i+1) }))
      .sort((a,b)=>a.position - b.position)
      .map((it,i)=>({ ...it, position: i+1 }));
  }
  return arr;
}

function normalizeTimestamps(obj){
  if (!obj || typeof obj !== "object") return obj;
  const out = { ...obj };

  const ts = out.timestamps;
  if (ts){
    const toIso = (v) =>
      v && typeof v?.toDate === "function" ? v.toDate().toISOString() : v;

    out.timestamps = {
      createdAt: toIso(ts.createdAt),
      updatedAt: toIso(ts.updatedAt),
    };
  }
  return out;
}

function formatModerationStatusLabel(status) {
  const normalized = toStr(status).toLowerCase();
  if (normalized === "awaiting_stock") return "Awaiting stock from supplier";
  if (normalized === "in_review") return "In review";
  if (normalized === "published") return "Published";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "draft") return "Draft";
  return normalized.replace(/_/g, " ");
}

function buildStatusNextStep(status, fulfillmentMode, reason) {
  const normalized = toStr(status).toLowerCase();
  if (normalized === "awaiting_stock") {
    return fulfillmentMode === "bevgo"
      ? "Your listing has been approved. Please send stock to Piessang so we can book it in and publish the product."
      : "Your listing is approved and waiting for fulfilment updates.";
  }
  if (normalized === "published") {
    return "Your product is now live and visible on the Piessang store.";
  }
  if (normalized === "rejected") {
    return reason
      ? `Your listing was rejected. Please review the reason, update the draft, and resubmit.`
      : "Your listing was rejected. Please update the draft and resubmit.";
  }
  if (normalized === "in_review") {
    return "Your listing is now with the Piessang review team.";
  }
  return "Your product status has been updated.";
}

function buildProductStatusNextStep(status, fulfillmentMode, reason, { isLiveUpdate = false } = {}) {
  const normalized = toStr(status).toLowerCase();
  if (normalized === "awaiting_stock") {
    return isLiveUpdate
      ? "Your latest product changes have been approved. Please send any required stock updates to Piessang so the approved update can go live."
      : buildStatusNextStep(status, fulfillmentMode, reason);
  }
  if (normalized === "published") {
    return isLiveUpdate
      ? "Your product changes have been approved and the updated live version is now visible on Piessang."
      : "Your product is now live and visible on the Piessang store.";
  }
  if (normalized === "rejected") {
    return isLiveUpdate
      ? "Your product update was rejected. The current live version stays visible while you review the feedback, make changes, and submit the update again."
      : buildStatusNextStep(status, fulfillmentMode, reason);
  }
  if (normalized === "in_review") {
    return isLiveUpdate
      ? "Your product changes are with the Piessang review team. The current live version stays visible while the update is reviewed."
      : "Your listing is now with the Piessang review team.";
  }
  return buildStatusNextStep(status, fulfillmentMode, reason);
}

function hasLiveSnapshotRecord(product) {
  return Boolean(product?.live_snapshot && typeof product.live_snapshot === "object");
}

/* ------------------ sanitize patch ------------------ */
function sanitizePatch(patch){
  const out = {};

  if ("grouping" in patch){
    const g = patch.grouping || {};
    out.grouping = {};
    if ("category" in g)    out.grouping.category    = toStr(g.category);
    if ("subCategory" in g) out.grouping.subCategory = toStr(g.subCategory);
    if ("brand" in g)       out.grouping.brand       = toStr(g.brand);
  }

  if ("placement" in patch){
    const p = patch.placement || {};
    out.placement = {};
    if ("position" in p)             out.placement.position = toInt(p.position);
    if ("isActive" in p)             out.placement.isActive = toBool(p.isActive);
    if ("isFeatured" in p)           out.placement.isFeatured = toBool(p.isFeatured);
    if ("supplier_out_of_stock" in p)out.placement.supplier_out_of_stock = toBool(p.supplier_out_of_stock);
    if ("in_stock" in p)             out.placement.in_stock = toBool(p.in_stock);
    if ("inventory_tracking" in p)   out.placement.inventory_tracking = toBool(p.inventory_tracking);
  }

  if ("media" in patch){
    const m = patch.media || {};
    out.media = {};
    if ("color" in m)  out.media.color  = toStr(m.color, null) || null;
    if ("images" in m) out.media.images = parseImages(m.images);
    if ("video" in m)  out.media.video  = toStr(m.video, null) || null;
    if ("icon" in m)   out.media.icon   = toStr(m.icon,  null) || null;
  }

    if ("product" in patch){
    const pr = patch.product || {};
    out.product = {};
    if ("unique_id" in pr)   out.product.unique_id = toStr(pr.unique_id);
    if ("sku" in pr)         out.product.sku       = toStr(pr.sku, null) || null;
    if ("title" in pr)       out.product.title     = toStr(pr.title, null) || null;
    if ("brand" in pr)       out.product.brand     = toStr(pr.brand, null) || null;
    if ("brandTitle" in pr)  out.product.brandTitle = toStr(pr.brandTitle, null) || null;
    if ("overview" in pr)    out.product.overview  = toStr(pr.overview, null) || null;
    if ("description" in pr) out.product.description = toStr(pr.description, null) || null;
    if ("keywords" in pr)    out.product.keywords    = parseKeywords(pr.keywords);
    if ("vendorName" in pr)  out.product.vendorName   = toStr(pr.vendorName, null) || null;
    if ("vendorDescription" in pr) out.product.vendorDescription = toStr(pr.vendorDescription, null) || null;
    if ("sellerSlug" in pr)  out.product.sellerSlug   = toStr(pr.sellerSlug, null) || null;
    if ("sellerCode" in pr)  out.product.sellerCode   = toStr(pr.sellerCode, null) || null;
  }

  if ("inventory" in patch){
    out.inventory = Array.isArray(patch.inventory) ? patch.inventory : [];
  }

  if ("fulfillment" in patch){
    const f = patch.fulfillment || {};
    out.fulfillment = {};
    if ("mode" in f) out.fulfillment.mode = toStr(f.mode, null) || null;
    if ("commission_rate" in f) out.fulfillment.commission_rate = Number.isFinite(+f.commission_rate) ? Number(f.commission_rate) : null;
    if ("change_request" in f) {
      const request = f.change_request || {};
      out.fulfillment.change_request = {
        requested: toBool(request.requested, true),
        status: toStr(request.status, "requested") || "requested",
        desired_mode: toStr(request.desired_mode, null) || null,
        reason: toStr(request.reason, null) || null,
        requestedAt: toStr(request.requestedAt, null) || null,
        requestedBy: toStr(request.requestedBy, null) || null,
      };
    }
  }

  if ("moderation" in patch){
    const m = patch.moderation || {};
    out.moderation = {};
    if ("status" in m) out.moderation.status = toStr(m.status, null) || null;
    if ("reason" in m) out.moderation.reason = toStr(m.reason, null) || null;
    if ("notes" in m) out.moderation.notes = toStr(m.notes, null) || null;
    if ("reviewedAt" in m) out.moderation.reviewedAt = toStr(m.reviewedAt, null) || null;
    if ("reviewedBy" in m) out.moderation.reviewedBy = toStr(m.reviewedBy, null) || null;
  }

  return out;
}

/* ============================================================
   =======================  ENDPOINT   =========================
   ============================================================ */

export async function POST(req){
  try{
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    await ensureCatalogueTaxonomySeed();

    const auth = await getServerAuthBootstrap();
    const profile = auth?.profile || null;
    if (!profile?.uid) {
      return err(401, "Unauthorized", "Sign in again to update this product.");
    }

    const { unique_id, data } = await req.json();

    const pid = toStr(unique_id);
    if (!is8(pid))
      return err(400,"Invalid Product ID","unique_id must be an 8-digit string.");

    if (!data || typeof data !== "object")
      return err(400,"Invalid Data","Provide a 'data' object to update.");

    if ("variants" in data)
      return err(400,"Variants Not Allowed","Use variant endpoints.");

    /* -- Load existing product -- */
    const ref = db.collection("products_v2").doc(pid);
    const snap = await ref.get();

    if (!snap.exists)
      return err(404,"Product Not Found",`No product with ID ${pid}.`);

    const current = snap.data() || {};
    const currentSellerSlug = toStr(
      current?.seller?.sellerSlug ||
      current?.seller?.groupSellerSlug ||
      current?.product?.sellerSlug ||
      "",
    );
    const currentSellerCode = toStr(
      current?.seller?.sellerCode ||
      current?.seller?.activeSellerCode ||
      current?.product?.sellerCode ||
      "",
    );
    if (!canManageProduct(profile, { sellerSlug: currentSellerSlug, sellerCode: currentSellerCode })) {
      return err(403, "Forbidden", "You do not have permission to update this product.");
    }
    let sellerOwner = null;
    const currentSellerIdentifier = currentSellerCode || currentSellerSlug;
    if (currentSellerIdentifier) {
      sellerOwner = await findSellerOwnerByIdentifier(currentSellerIdentifier);
      if (sellerOwner && isSellerAccountUnavailable(sellerOwner.data)) {
        return err(403, "Seller Account Blocked", "This seller account is unavailable and cannot update products.");
      }
    }

    /* -- Build sanitized patch + merged object -- */
    const patch = sanitizePatch(data);
    const currentFulfillmentMode = toStr(current?.fulfillment?.mode, "seller");
    const requestedFulfillmentMode = toStr(patch?.fulfillment?.mode, "");
    const fulfillmentPatchKeys = Object.keys(patch?.fulfillment || {});
    const changeRequestOnly =
      fulfillmentPatchKeys.length === 1 &&
      fulfillmentPatchKeys.includes("change_request");
    if (
      current?.fulfillment?.locked === true &&
      (requestedFulfillmentMode && requestedFulfillmentMode !== currentFulfillmentMode) &&
      !changeRequestOnly
    ) {
      return err(
        409,
        "Fulfillment Locked",
        "Fulfilment is locked after product creation. Request a fulfilment change to update it."
      );
    }
    const next  = deepMerge(current, patch);
    const nextFulfillmentMode = toStr(next?.fulfillment?.mode, "seller");
    next.fulfillment = next.fulfillment || {};
    next.fulfillment.commission_rate = null;
    next.fulfillment.locked = true;
    if (nextFulfillmentMode === "bevgo") {
      next.placement = next.placement || {};
      next.placement.inventory_tracking = true;
      next.fulfillment.lead_time_days = null;
      next.fulfillment.cutoff_time = null;
    } else {
      next.fulfillment.lead_time_days = null;
      next.fulfillment.cutoff_time = null;
    }
    next.fulfillment.locked = true;
    const currentModerationStatus = toStr(current?.moderation?.status, "draft");
    const preserveLiveVersionDuringReview =
      currentModerationStatus === "published" || hasLiveSnapshotRecord(current);
    const nextModerationStatus = toStr(next?.moderation?.status, currentModerationStatus) || currentModerationStatus;
    const meaningfulContentChange = Boolean(
      ("grouping" in patch) ||
      ("media" in patch) ||
      ("product" in patch) ||
      ("inventory" in patch) ||
      ("placement" in patch && !Object.keys(patch.placement || {}).every((key) => key === "isActive")) ||
      ("fulfillment" in patch && !changeRequestOnly)
    );
    next.moderation = next.moderation || {};
    next.moderation.status = meaningfulContentChange
      ? preserveLiveVersionDuringReview
        ? "in_review"
        : "draft"
      : nextModerationStatus;
    if (meaningfulContentChange) {
      next.moderation.reason = "product_changed";
      next.moderation.notes = preserveLiveVersionDuringReview
        ? "Product updates are in review. The current live version stays visible until the changes are approved."
        : "Product updates require the listing to be reviewed again before it goes live.";
      next.moderation.reviewedAt = null;
      next.moderation.reviewedBy = null;
    }
    if (next.moderation.status === "published") {
      next.placement = next.placement || {};
      next.placement.isActive = true;
    } else if (
      ["draft", "in_review", "awaiting_stock", "rejected"].includes(next.moderation.status) &&
      !preserveLiveVersionDuringReview
    ) {
      next.placement = next.placement || {};
      next.placement.isActive = false;
    }
    const activatingProduct =
      ("placement" in patch) &&
      Object.prototype.hasOwnProperty.call(patch.placement || {}, "isActive") &&
      patch?.placement?.isActive === true;

    /* ============================================================
       1. Duplicate title check using titleSlug (case-insensitive,
          space-insensitive, punctuation-insensitive)
       ============================================================ */
    const groupingChanged =
      ("grouping" in patch &&
       (patch.grouping.category ||
        patch.grouping.subCategory ||
        patch.grouping.brand));

    const titleChanged =
      ("product" in patch &&
       "title" in (patch.product || {}));
    let brandRecord = null;
    let pendingBrandResult = null;

    if (groupingChanged || titleChanged){

      const nextCategory    = toStr(next?.grouping?.category);
      const nextSubCategory = toStr(next?.grouping?.subCategory);
      const nextTitleRaw    = toStr(next?.product?.title);
      const nextSlug        = normalizeTitleSlug(nextTitleRaw);
      const nextBrandSlug   = toStr(next?.grouping?.brand || next?.product?.brand);
      const nextBrandTitle  = toStr(next?.product?.brandTitle || nextBrandSlug);

      if (!nextSlug)
        return err(400,"Invalid Title","product.title cannot be empty.");

      // Store slug in patch for update
      next.product.titleSlug = nextSlug;

      const rs = await db
        .collection("products_v2")
        .where("grouping.category","==", nextCategory)
        .where("grouping.subCategory","==", nextSubCategory)
        .where("grouping.brand","==", nextBrandSlug)
        .where("product.titleSlug","==", nextSlug)
        .get();

      // ensure duplicate is NOT this product:
      const conflict = rs.docs.some(d => d.id !== pid);

      if (conflict){
        return err(
          409,
          "Duplicate Title",
          `Another product in this grouping has a similar title ('${nextTitleRaw}').`
        );
      }

      brandRecord = await findBrandRecord({
        title: nextBrandTitle || nextBrandSlug,
        slug: nextBrandSlug,
      });
      pendingBrandResult = brandRecord
        ? null
        : await findOrCreatePendingBrandRequest({
            title: nextBrandTitle || nextBrandSlug,
            slug: nextBrandSlug,
            requestedByUid: sellerOwner?.id || "",
            vendorName: toStr(next?.product?.vendorName || current?.product?.vendorName || ""),
            productId: pid,
            productTitle: nextTitleRaw,
          });
      const resolvedBrand = brandRecord || pendingBrandResult?.brand || {
        slug: nextBrandSlug,
        title: nextBrandTitle || nextBrandSlug,
        code: null,
      };

      next.grouping.brand = resolvedBrand.slug;
      next.product.brand = resolvedBrand.slug;
      next.product.brandTitle = resolvedBrand.title;
      next.product.brandCode = resolvedBrand.code || null;
      next.product.brandStatus = pendingBrandResult?.pending ? "pending" : "approved";
      next.product.brandRequestId = pendingBrandResult?.request?.id || null;
    }

    if (patch?.product?.sku) {
      await ensureSkuUnique(toStr(patch.product.sku), {
        excludeProductId: pid,
      });
    }

    if (patch?.product?.unique_id) {
      await ensureUniqueProductCode(toStr(patch.product.unique_id), {
        excludeProductId: pid,
      });
    }

    const sellerCode = ensureSellerCode(
      sellerOwner?.data?.seller?.sellerCode ||
        sellerOwner?.data?.seller?.activeSellerCode ||
        sellerOwner?.data?.seller?.groupSellerCode ||
        currentSellerCode ||
        next?.product?.sellerCode,
      sellerOwner?.id || pid,
    );
    next.product.sellerCode = sellerCode;
    next.product.vendorName = toStr(
      sellerOwner?.data?.seller?.vendorName ||
        sellerOwner?.data?.seller?.groupVendorName ||
        next?.product?.vendorName ||
        current?.product?.vendorName ||
        "",
    );
    next.product.vendorDescription = toStr(
      sellerOwner?.data?.seller?.vendorDescription ||
        sellerOwner?.data?.seller?.description ||
        next?.product?.vendorDescription ||
        current?.product?.vendorDescription ||
        "",
    ) || null;
    // Product can be activated only when all linked parent groupings are active.
    if (activatingProduct) {
      const parentState = await ensureParentsActive(db, next);
      if (!parentState.ok) {
        return err(
          409,
          "Parent Inactive",
          "Product cannot be set to active because one or more parent groupings are inactive or invalid.",
          { parent_issues: parentState.invalid }
        );
      }
    }

    /* -- Update Firestore -- */
    const updatePayload = {
      ...next,
      timestamps: {
        ...(next?.timestamps || current?.timestamps || {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
    };
    if (meaningfulContentChange && preserveLiveVersionDuringReview && !hasLiveSnapshotRecord(current)) {
      updatePayload.live_snapshot = current;
    }
    await ref.update(updatePayload);

    const updatedSnap = await ref.get();
    const updated = normalizeTimestamps(updatedSnap.data());
    const wasLiveUpdate = hasLiveSnapshotRecord(current);

    const becamePublished =
      toStr(current?.moderation?.status).toLowerCase() !== "published" &&
      toStr(updated?.moderation?.status).toLowerCase() === "published" &&
      updated?.placement?.isActive === true;

    if (becamePublished) {
      const currentFirstPublishedAt = current?.marketplace?.firstPublishedAt ?? updated?.marketplace?.firstPublishedAt ?? null;
      if (!currentFirstPublishedAt) {
        await ref.set(
          {
            marketplace: {
              ...(updated?.marketplace || {}),
              firstPublishedAt: new Date().toISOString(),
            },
          },
          { merge: true },
        );
      }
      const pendingSaleRefreshes = Array.isArray(current?.meta?.pendingSaleRefreshes)
        ? current.meta.pendingSaleRefreshes
        : [];
      for (const entry of pendingSaleRefreshes) {
        const variantId = toStr(entry?.variantId);
        if (!variantId) continue;
        const variantAfter =
          Array.isArray(updated?.variants)
            ? updated.variants.find((variant) => toStr(variant?.variant_id) === variantId) || entry?.variantAfter
            : entry?.variantAfter;
        if (!variantAfter) continue;
        await refreshCartsForSaleChange({
          origin: new URL(req.url).origin,
          productId: pid,
          productSnapshot: updated,
          variantBefore: entry?.variantBefore,
          variantAfter,
        });
      }
      if (pendingSaleRefreshes.length) {
        await ref.set(
          {
            meta: {
              ...(updated?.meta || {}),
              pendingSaleRefreshes: [],
            },
            live_snapshot: FieldValue.delete(),
          },
          { merge: true },
        );
      } else if (updated?.live_snapshot) {
        await ref.update({
          live_snapshot: FieldValue.delete(),
        });
      }

      if (!currentFirstPublishedAt && isProductPublished(updated)) {
        const followers = await listFollowersForSeller({
          sellerCode: updated?.product?.sellerCode || sellerCode,
          sellerSlug: updated?.product?.sellerSlug || currentSellerSlug,
        });
        await Promise.all(
          followers.map((entry) =>
            dispatchCustomerNotification({
              origin: new URL(req.url).origin,
              userId: entry?.userId,
              type: "followed_seller_new_product",
              title: `${updated?.product?.vendorName || "A seller you follow"} released a new product`,
              message: `${updated?.product?.title || "A new product"} is now live on Piessang.`,
              href: `/products/${encodeURIComponent(updated?.product?.slug || updated?.docId || pid)}`,
              metadata: {
                sellerCode: updated?.product?.sellerCode || sellerCode,
                sellerSlug: updated?.product?.sellerSlug || currentSellerSlug,
                productId: pid,
              },
              dedupeKey: `followed-seller-published:${entry?.userId}:${pid}`,
              email: entry?.followerEmail || "",
              phone: entry?.followerPhone || "",
              emailType: "followed-seller-new-product",
              emailData: {
                vendorName: updated?.product?.vendorName || "A seller you follow",
                productTitle: updated?.product?.title || "A new product",
              },
              smsType: "followed-seller-new-product",
              smsData: {
                vendorName: updated?.product?.vendorName || "A seller you follow",
                productTitle: updated?.product?.title || "A new product",
              },
              pushType: "followed-seller-new-product",
              pushVariables: {
                vendorName: updated?.product?.vendorName || "A seller you follow",
                productTitle: updated?.product?.title || "A new product",
                link: `/products/${encodeURIComponent(updated?.product?.slug || updated?.docId || pid)}`,
              },
            }),
          ),
        );
      }

      const pendingSaleNotificationEntries = Array.isArray(current?.meta?.pendingSaleRefreshes)
        ? current.meta.pendingSaleRefreshes
        : [];
      if (pendingSaleNotificationEntries.length) {
        const favoritedUsers = await listUsersWhoFavoritedProduct(pid);
        for (const entry of pendingSaleNotificationEntries) {
          const variantId = toStr(entry?.variantId);
          if (!variantId) continue;
          const variantAfter =
            Array.isArray(updated?.variants)
              ? updated.variants.find((variant) => toStr(variant?.variant_id) === variantId)
              : null;
          if (!variantAfter || variantAfter?.sale?.is_on_sale !== true || variantAfter?.sale?.disabled_by_admin === true) continue;
          const salePrice = Number(getVariantActivePriceIncl(variantAfter) || 0).toFixed(2);
          await Promise.all(
            favoritedUsers.map((user) =>
              dispatchCustomerNotification({
                origin: new URL(req.url).origin,
                userId: user.userId,
                type: "favorite_on_sale",
                title: "A favourite just went on sale",
                message: `${updated?.product?.title || "A saved product"} is now on sale${variantAfter?.label ? ` for ${variantAfter.label}` : ""}.`,
                href: `/products/${encodeURIComponent(updated?.product?.slug || updated?.docId || pid)}`,
                metadata: {
                  productId: pid,
                  variantId,
                  salePrice,
                },
                dedupeKey: `favorite-sale:${user.userId}:${pid}:${variantId}:${salePrice}`,
                email: user.email || "",
                phone: user.phone || "",
                emailType: "favorite-on-sale",
                emailData: {
                  productTitle: updated?.product?.title || "A saved product",
                  variantLabel: variantAfter?.label || "",
                  salePrice,
                },
                smsType: "favorite-on-sale",
                smsData: {
                  productTitle: updated?.product?.title || "A saved product",
                },
                pushType: "favorite-on-sale",
                pushVariables: {
                  productTitle: updated?.product?.title || "A saved product",
                  link: `/products/${encodeURIComponent(updated?.product?.slug || updated?.docId || pid)}`,
                },
              }),
            ),
          );
        }
      }
    }

    if (currentModerationStatus !== next.moderation.status) {
      const sellerSlug = toStr(
        next?.seller?.sellerSlug ||
          next?.product?.sellerSlug ||
          next?.product?.vendorSlug ||
          toSellerSlug(next?.product?.vendorName || next?.product?.brandTitle || next?.grouping?.brand || next?.product?.brand),
      );
      const vendorName = toStr(next?.product?.vendorName || current?.product?.vendorName || next?.product?.brandTitle || next?.grouping?.brand || next?.product?.brand);
      const productTitle = toStr(next?.product?.title || current?.product?.title || "your product");
      const fulfillmentModeForEmail = toStr(next?.fulfillment?.mode || current?.fulfillment?.mode || "seller");
      const reason = toStr(next?.moderation?.reason || current?.moderation?.reason || "");

      if (process.env.SENDGRID_API_KEY?.startsWith("SG.") && sellerSlug) {
        const recipients = await collectSellerNotificationEmails({
          sellerSlug,
          fallbackEmails: [
            next?.seller?.contactEmail,
            next?.product?.vendorEmail,
            current?.seller?.contactEmail,
          ].filter(Boolean),
        });

        if (recipients.length) {
          await sendSellerNotificationEmails({
            origin: new URL(req.url).origin,
            type: "seller-product-status",
            to: recipients,
            data: {
              vendorName,
              productTitle,
              statusLabel: formatModerationStatusLabel(next.moderation.status),
              statusHeading:
                next.moderation.status === "published" && wasLiveUpdate
                  ? "Product update approved"
                  : next.moderation.status === "published"
                    ? "Product approved"
                    : next.moderation.status === "rejected" && wasLiveUpdate
                      ? "Product update rejected"
                      : next.moderation.status === "rejected"
                        ? "Product rejected"
                        : next.moderation.status === "in_review" && wasLiveUpdate
                          ? "Product update submitted"
                          : "Product status update",
              isLiveUpdate: wasLiveUpdate,
              fulfillmentLabel: fulfillmentModeForEmail === "bevgo" ? "Piessang fulfils" : "Seller fulfils",
              reason: next.moderation.status === "rejected" ? reason : "",
              nextStep: buildProductStatusNextStep(next.moderation.status, fulfillmentModeForEmail, reason, {
                isLiveUpdate: wasLiveUpdate,
              }),
            },
          });
        }
      }
    }

    return ok({
      unique_id: pid,
      message: "Product updated.",
      resubmissionRequired: meaningfulContentChange,
      liveVersionKept: meaningfulContentChange && preserveLiveVersionDuringReview,
      brandCreated: Boolean(brandRecord?.created),
      brand: brandRecord
        ? {
            slug: brandRecord.slug,
            title: brandRecord.title,
            code: brandRecord.code || null,
          }
        : null,
      product: updated
    });

  } catch (e){
    console.error("products_v2/update failed:", e);
    return err(
      500,
      "Unexpected Error",
      "Failed to update product.",
      { details: String(e?.message ?? "").slice(0,300) }
    );
  }
}
