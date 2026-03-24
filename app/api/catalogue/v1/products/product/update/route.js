import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { collectSellerNotificationEmails, sendSellerNotificationEmails } from "@/lib/seller/notifications";
import { findBrandRecord, findOrCreatePendingBrandRequest } from "@/lib/catalogue/brand-upsert";
import { ensureSkuUnique, ensureUniqueProductCode } from "@/lib/catalogue/sku-uniqueness";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { isSellerAccountUnavailable } from "@/lib/seller/account-status";
import { toSellerSlug } from "@/lib/seller/vendor-name";
import { ensureSellerCode } from "@/lib/seller/seller-code";

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

async function findSingleBySlug(db, colName, fieldPath, slug) {
  const s = toStr(slug);
  if (!s) return { found: false, item: null, reason: "missing_slug" };

  const rs = await db.collection(colName).where(fieldPath, "==", s).get();

  if (rs.empty) return { found: false, item: null, reason: "not_found" };
  if (rs.size > 1) return { found: false, item: null, reason: "not_unique" };

  return { found: true, item: rs.docs[0].data() || {}, reason: null };
}

async function ensureParentsActive(db, nextProduct) {
  const categorySlug = toStr(nextProduct?.grouping?.category);
  const subCategorySlug = toStr(nextProduct?.grouping?.subCategory);

  const parentChecks = await Promise.all([
    findSingleBySlug(db, "categories", "category.slug", categorySlug),
    findSingleBySlug(db, "sub_categories", "subCategory.slug", subCategorySlug),
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
      ? "Your listing has been approved. Please send stock to Bevgo so we can book it in and publish the product."
      : "Your listing is approved and waiting for fulfilment updates.";
  }
  if (normalized === "published") {
    return "Your product is now live and visible on the Bevgo store.";
  }
  if (normalized === "rejected") {
    return reason
      ? `Your listing was rejected. Please review the reason, update the draft, and resubmit.`
      : "Your listing was rejected. Please update the draft and resubmit.";
  }
  if (normalized === "in_review") {
    return "Your listing is now with the Bevgo review team.";
  }
  return "Your product status has been updated.";
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
    if ("lead_time_days" in f) out.fulfillment.lead_time_days = Number.isFinite(+f.lead_time_days) ? Math.trunc(+f.lead_time_days) : null;
    if ("cutoff_time" in f) out.fulfillment.cutoff_time = toStr(f.cutoff_time, null) || null;
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
      ((requestedFulfillmentMode && requestedFulfillmentMode !== currentFulfillmentMode) ||
        Object.prototype.hasOwnProperty.call(patch?.fulfillment || {}, "lead_time_days") ||
        Object.prototype.hasOwnProperty.call(patch?.fulfillment || {}, "cutoff_time")) &&
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
      const currentLeadTime = Number.isFinite(+current?.fulfillment?.lead_time_days)
        ? Math.trunc(+current.fulfillment.lead_time_days)
        : null;
      const nextLeadTime = Number.isFinite(+next?.fulfillment?.lead_time_days)
        ? Math.trunc(+next.fulfillment.lead_time_days)
        : currentLeadTime ?? 3;
      next.fulfillment.lead_time_days = nextLeadTime;
      const currentCutoffTime = toStr(current?.fulfillment?.cutoff_time, "10:00") || "10:00";
      const nextCutoffTime = toStr(next?.fulfillment?.cutoff_time, "");
      next.fulfillment.cutoff_time = nextCutoffTime || currentCutoffTime;
    }
    next.fulfillment.locked = true;
    const currentModerationStatus = toStr(current?.moderation?.status, "draft");
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
    next.moderation.status = meaningfulContentChange ? "draft" : nextModerationStatus;
    if (meaningfulContentChange) {
      next.moderation.reason = "product_changed";
      next.moderation.notes = "Product updates require the listing to be reviewed again before it goes live.";
      next.moderation.reviewedAt = null;
      next.moderation.reviewedBy = null;
    }
    if (next.moderation.status === "published") {
      next.placement = next.placement || {};
      next.placement.isActive = true;
    } else if (["draft", "in_review", "awaiting_stock", "rejected"].includes(next.moderation.status)) {
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

      const brandRecord = await findBrandRecord({
        title: nextBrandTitle || nextBrandSlug,
        slug: nextBrandSlug,
      });
      const pendingBrandResult = brandRecord
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
    await ref.update(updatePayload);

    const updatedSnap = await ref.get();
    const updated = normalizeTimestamps(updatedSnap.data());

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
              fulfillmentLabel: fulfillmentModeForEmail === "bevgo" ? "Bevgo fulfils" : "Seller fulfils",
              reason: next.moderation.status === "rejected" ? reason : "",
              nextStep: buildStatusNextStep(next.moderation.status, fulfillmentModeForEmail, reason),
            },
          });
        }
      }
    }

    return ok({
      unique_id: pid,
      message: "Product updated.",
      resubmissionRequired: meaningfulContentChange,
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
