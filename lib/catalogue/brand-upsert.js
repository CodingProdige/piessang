import { randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export const BRAND_REQUESTS_COLLECTION = "brand_requests_v1";

const toStr = (v, f = "") => {
  if (v == null) return f;
  return String(v).trim();
};

function slugifyPart(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/&/g, "AND")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase() || "NA";
}

export function normalizeBrandKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function buildBrandSlug(value) {
  return toStr(value) || slugifyPart(value).toLowerCase();
}

async function collectBrandIndex(db) {
  const snap = await db.collection("brands").get();
  const brands = snap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() || {} }));
  const codes = new Set();
  for (const row of brands) {
    const code = toStr(row.data?.brand?.code).toUpperCase();
    if (code) codes.add(code);
  }
  return { brands, codes };
}

function generateBrandCode(title, usedCodes) {
  const prefix = slugifyPart(title).slice(0, 12) || "BRAND";
  for (let i = 0; i < 20; i += 1) {
    const suffix = randomBytes(3).toString("hex").toUpperCase();
    const code = `BRD-${prefix}-${suffix}`;
    if (!usedCodes.has(code.toUpperCase())) return code;
  }
  return `BRD-${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export async function findBrandRecord({ title, slug }) {
  const db = getAdminDb();
  if (!db) {
    const error = new Error("Server Firestore access is not configured.");
    error.status = 500;
    throw error;
  }

  const brandTitle = toStr(title).slice(0, 60);
  const brandSlug = buildBrandSlug(slug || brandTitle);
  const normalizedSlug = brandSlug.toLowerCase();
  const normalizedTitle = brandTitle.toLowerCase();
  const wantedKey = normalizeBrandKey(normalizedSlug || normalizedTitle);

  const { brands } = await collectBrandIndex(db);
  const existing = brands.find((row) => {
    const existingSlug = toStr(row.data?.brand?.slug).toLowerCase();
    const existingTitle = toStr(row.data?.brand?.title).toLowerCase();
    const aliases = Array.isArray(row.data?.brand?.aliases) ? row.data.brand.aliases : [];
    return (
      (existingSlug && existingSlug === normalizedSlug) ||
      (existingTitle && normalizeBrandKey(existingTitle) === normalizeBrandKey(normalizedTitle)) ||
      aliases.some((item) => normalizeBrandKey(item) === wantedKey)
    );
  });

  if (!existing) return null;

  return {
    created: false,
    id: existing.id,
    slug: toStr(existing.data?.brand?.slug) || brandSlug,
    title: toStr(existing.data?.brand?.title) || brandTitle,
    code: toStr(existing.data?.brand?.code) || null,
    data: existing.data,
  };
}

export async function ensureBrandRecord({ title, slug }) {
  const db = getAdminDb();
  if (!db) {
    const error = new Error("Server Firestore access is not configured.");
    error.status = 500;
    throw error;
  }

  const brandTitle = toStr(title).slice(0, 60);
  if (!brandTitle) {
    const error = new Error("Brand title is required.");
    error.status = 400;
    throw error;
  }

  const existing = await findBrandRecord({ title: brandTitle, slug });
  if (existing) return existing;

  const brandSlug = buildBrandSlug(slug || brandTitle);
  const normalizedSlug = brandSlug.toLowerCase();
  const { codes } = await collectBrandIndex(db);
  const code = generateBrandCode(brandTitle, codes);
  const ref = db.collection("brands").doc();
  const body = {
    docId: ref.id,
    brand: {
      slug: normalizedSlug,
      title: brandTitle,
      code,
      aliases: [brandTitle, normalizedSlug],
    },
    placement: {
      position: 1,
      isActive: true,
      isFeatured: false,
    },
    timestamps: {
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
  };

  await ref.set(body);

  return {
    created: true,
    id: ref.id,
    slug: normalizedSlug,
    title: brandTitle,
    code,
    data: body,
  };
}

export async function findOrCreatePendingBrandRequest({
  title,
  slug,
  requestedByUid = "",
  vendorName = "",
  productId = "",
  productTitle = "",
}) {
  const db = getAdminDb();
  if (!db) {
    const error = new Error("Server Firestore access is not configured.");
    error.status = 500;
    throw error;
  }

  const brandTitle = toStr(title).slice(0, 60);
  if (!brandTitle) {
    const error = new Error("Brand title is required.");
    error.status = 400;
    throw error;
  }

  const brandSlug = buildBrandSlug(slug || brandTitle).toLowerCase();
  const normalizedKey = normalizeBrandKey(brandTitle || brandSlug);
  const existingBrand = await findBrandRecord({ title: brandTitle, slug: brandSlug });
  if (existingBrand) {
    return { created: false, pending: false, brand: existingBrand, request: null };
  }

  const requestId = normalizedKey || brandSlug;
  const ref = db.collection(BRAND_REQUESTS_COLLECTION).doc(requestId);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() || {} : null;

  const payload = {
    id: requestId,
    normalizedKey,
    brand: {
      slug: brandSlug,
      title: brandTitle,
    },
    status: "pending",
    seller: {
      requestedByUid: toStr(requestedByUid),
      vendorName: toStr(vendorName),
    },
    latestProduct: {
      productId: toStr(productId),
      productTitle: toStr(productTitle),
    },
    timestamps: {
      ...(existing?.timestamps?.createdAt ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    },
  };

  await ref.set(payload, { merge: true });

  return {
    created: !snap.exists,
    pending: true,
    brand: {
      created: false,
      id: "",
      slug: brandSlug,
      title: brandTitle,
      code: null,
      data: null,
    },
    request: {
      id: requestId,
      ...(existing || {}),
      ...payload,
    },
  };
}
