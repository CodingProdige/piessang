export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

const toBool = (v, f = false) =>
  typeof v === "boolean" ? v :
  typeof v === "number" ? v !== 0 :
  typeof v === "string" ? ["true", "1", "yes", "y"].includes(v.toLowerCase()) :
  f;

function deepMerge(target, patch) {
  if (patch == null || typeof patch !== "object") return target;
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object" && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const chunk = (arr, n) => {
  const r = [];
  for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n));
  return r;
};

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const { id, slug, data } = await req.json();
    if (!data || typeof data !== "object") {
      return err(400, "Invalid Data", "Provide a 'data' object.");
    }
    if (!id && !slug) {
      return err(400, "Missing Locator", "Provide 'id' (preferred) or 'slug'.");
    }

    let docRef = null;
    let docSnap = null;
    let docId = String(id ?? "").trim();

    if (docId) {
      docRef = db.collection("sub_categories").doc(docId);
      docSnap = await docRef.get();

      if (!docSnap.exists) {
        const fallbackSlug = String(slug ?? "").trim();
        const fallbackCategory = String(data?.grouping?.category ?? "").trim();
        if (!fallbackSlug) return err(404, "Not Found", `No sub-category id '${docId}'.`);

        const all = await db.collection("sub_categories").get();
        const hits = all.docs.filter((d) => {
          const item = d.data() || {};
          const itemSlug = String(item?.subCategory?.slug ?? "").trim();
          const itemCategory = String(item?.grouping?.category ?? "").trim();
          if (itemSlug !== fallbackSlug) return false;
          if (fallbackCategory && itemCategory !== fallbackCategory) return false;
          return true;
        });

        if (hits.length === 0) return err(404, "Not Found", `No sub-category id '${docId}' or slug '${fallbackSlug}'.`);
        if (hits.length > 1) return err(409, "Slug Not Unique", `Multiple sub-categories share slug '${fallbackSlug}'.`);

        docSnap = hits[0];
        docRef = hits[0].ref;
        docId = hits[0].id;
      }
    } else {
      const targetSlug = String(slug ?? "").trim();
      if (!targetSlug) return err(400, "Invalid Slug", "Provide a non-empty 'slug' when 'id' is omitted.");

      const all = await db.collection("sub_categories").get();
      const hits = all.docs.filter((d) => String(d.data()?.subCategory?.slug ?? "").trim() === targetSlug);
      if (hits.length === 0) return err(404, "Not Found", `No sub-category with slug '${targetSlug}'.`);
      if (hits.length > 1) return err(409, "Slug Not Unique", `Multiple sub-categories share slug '${targetSlug}'.`);

      docSnap = hits[0];
      docRef = hits[0].ref;
      docId = hits[0].id;
    }

    const current = docSnap.data() || {};
    const oldSlug = String(current?.subCategory?.slug ?? "").trim();
    const currentCategory = String(current?.grouping?.category ?? "").trim();

    const next = deepMerge(current, data);
    const { timestamps: _ignoredTimestamps, ...nextWithoutTimestamps } = next;

    const wantsNew = data?.subCategory && Object.prototype.hasOwnProperty.call(data.subCategory, "slug");
    const newSlug = wantsNew ? String(next?.subCategory?.slug ?? "").trim() : oldSlug;
    const isActiveTouched =
      data?.placement &&
      Object.prototype.hasOwnProperty.call(data.placement, "isActive");
    const nextIsActive = toBool(next?.placement?.isActive, true);

    if (wantsNew && newSlug && newSlug !== oldSlug) {
      const all = await db.collection("sub_categories").get();
      const conflict = all.docs.some((d) =>
        d.id !== docId && String(d.data()?.subCategory?.slug ?? "").trim() === newSlug
      );
      if (conflict) return err(409, "Slug In Use", `Sub-category slug '${newSlug}' already exists.`);
    }

    await docRef.update({
      ...nextWithoutTimestamps,
      "timestamps.updatedAt": FieldValue.serverTimestamp(),
    });

    let migratedProducts = 0;
    let touchedBrands = 0;
    let from = null;
    let to = null;

    if (wantsNew && newSlug && newSlug !== oldSlug) {
      from = oldSlug;
      to = newSlug;

      {
        const rs = await db.collection("products_v2").get();
        const matches = rs.docs.filter((d) =>
          String(d.data()?.grouping?.category ?? "").trim() === currentCategory &&
          String(d.data()?.grouping?.subCategory ?? "").trim() === from
        );

        for (const part of chunk(matches, 450)) {
          const batch = db.batch();
          for (const d of part) {
            batch.update(d.ref, {
              "grouping.subCategory": to,
              "timestamps.updatedAt": FieldValue.serverTimestamp(),
            });
            migratedProducts++;
          }
          await batch.commit();
        }
      }

      {
        const rs = await db.collection("brands").get();
        const toChange = [];
        for (const d of rs.docs) {
          const brandCategory = String(d.data()?.grouping?.category ?? "").trim();
          const arr = Array.isArray(d.data()?.grouping?.subCategories)
            ? d.data().grouping.subCategories.map((x) => String(x))
            : [];
          if (brandCategory === currentCategory && arr.includes(from)) {
            const mapped = arr.map((x) => (x === from ? to : x));
            const seen = new Set();
            const deduped = mapped.filter((x) => (x && !seen.has(x) ? (seen.add(x), true) : false));
            toChange.push({ ref: d.ref, subCategories: deduped });
          }
        }

        for (const part of chunk(toChange, 450)) {
          const batch = db.batch();
          for (const row of part) {
            batch.update(row.ref, {
              "grouping.subCategories": row.subCategories,
            });
            touchedBrands++;
          }
          await batch.commit();
        }
      }
    }

    let activePropagation = null;
    if (isActiveTouched) {
      const targetSubCategorySlug = newSlug || oldSlug;
      activePropagation = { isActive: nextIsActive, brands: 0 };

      if (targetSubCategorySlug) {
        const rs = await db.collection("brands").get();
        const matches = rs.docs.filter((d) => {
          const arr = Array.isArray(d.data()?.grouping?.subCategories)
            ? d.data().grouping.subCategories.map((x) => String(x))
            : [];
          return arr.includes(targetSubCategorySlug);
        });

        for (const part of chunk(matches, 450)) {
          const batch = db.batch();
          for (const d of part) {
            batch.update(d.ref, {
              "placement.isActive": nextIsActive,
              "timestamps.updatedAt": FieldValue.serverTimestamp(),
            });
            activePropagation.brands++;
          }
          await batch.commit();
        }
      }
    }

    return ok({
      id: docId,
      slug: newSlug,
      propagated_from: from,
      propagated_to: to,
      migrated_products: migratedProducts,
      touched_brands: touchedBrands,
      ...(activePropagation ? { active_propagation: activePropagation } : {}),
      message: wantsNew && newSlug !== oldSlug
        ? "Sub-category updated (slug propagated)."
        : "Sub-category updated.",
    });
  } catch (e) {
    console.error("sub_categories/update (propagate) failed:", e);
    return err(500, "Unexpected Error", "Something went wrong while updating the sub-category.", {
      details: String(e?.message || "").slice(0, 300),
    });
  }
}
