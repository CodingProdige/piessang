import { getAdminDb } from "@/lib/firebase/admin";

const toStr = (v, f = "") => (v == null ? f : String(v)).trim();

function up(value) {
  return String(value ?? "").trim().toUpperCase();
}

export async function ensureSkuUnique(sku, { excludeProductId = "", excludeVariantId = "" } = {}) {
  const wanted = up(sku);
  if (!wanted) {
    const error = new Error("Provide a non-empty SKU.");
    error.status = 400;
    throw error;
  }

  const db = getAdminDb();
  if (!db) {
    const error = new Error("Server Firestore access is not configured.");
    error.status = 500;
    throw error;
  }

  const snap = await db.collection("products_v2").get();
  for (const docSnap of snap.docs) {
    const pid = docSnap.id;
    const data = docSnap.data() || {};
    const isSelfProduct = pid === excludeProductId;

    const productSku = up(data?.product?.sku);
    const shouldSkipProductSku = isSelfProduct && !excludeVariantId;
    if (productSku && productSku === wanted && !shouldSkipProductSku) {
      const error = new Error("SKU already exists on another product.");
      error.status = 409;
      error.conflict = { productId: pid, type: "product" };
      throw error;
    }

    const variants = Array.isArray(data?.variants) ? data.variants : [];
    for (const variant of variants) {
      const variantSku = up(variant?.sku);
      const variantId = toStr(variant?.variant_id);
      const isSelfVariant = isSelfProduct && variantId === toStr(excludeVariantId);
      if (variantSku && variantSku === wanted && !isSelfVariant) {
        const error = new Error("SKU already exists on another variant.");
        error.status = 409;
        error.conflict = { productId: pid, variantId, type: "variant" };
        throw error;
      }
    }
  }

  return { unique: true };
}

export async function isSkuUnique(sku, options = {}) {
  try {
    await ensureSkuUnique(sku, options);
    return true;
  } catch (error) {
    if (error?.status === 409) return false;
    throw error;
  }
}

export async function ensureUniqueProductCode(code, { excludeProductId = "", excludeVariantId = "" } = {}) {
  const wanted = String(code ?? "").trim();
  if (!/^\d{8}$/.test(wanted)) {
    const error = new Error("Provide an 8-digit product code.");
    error.status = 400;
    throw error;
  }

  const db = getAdminDb();
  if (!db) {
    const error = new Error("Server Firestore access is not configured.");
    error.status = 500;
    throw error;
  }

  const snap = await db.collection("products_v2").get();
  for (const docSnap of snap.docs) {
    const pid = docSnap.id;
    const data = docSnap.data() || {};
    const isSelfProduct = pid === excludeProductId;
    const shouldSkipProductCode = isSelfProduct && !excludeVariantId;

    if (String(data?.product?.unique_id ?? "").trim() === wanted && !shouldSkipProductCode) {
      const error = new Error("Product code already exists.");
      error.status = 409;
      error.conflict = { productId: pid, type: "product" };
      throw error;
    }

    const variants = Array.isArray(data?.variants) ? data.variants : [];
    for (const variant of variants) {
      const variantId = String(variant?.variant_id ?? "").trim();
      const isSelfVariant = isSelfProduct && variantId === String(excludeVariantId ?? "").trim();
      if (isSelfVariant) continue;
      if (variantId === wanted) {
        const error = new Error("Product code already exists on a variant.");
        error.status = 409;
        error.conflict = { productId: pid, variantId, type: "variant" };
        throw error;
      }
    }
  }

  return { unique: true };
}
