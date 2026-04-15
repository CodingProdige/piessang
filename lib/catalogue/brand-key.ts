function normalizeBrandKey(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/['".]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type BrandKeySource = {
  brand?: { slug?: string | null; title?: string | null } | null;
  product?: Record<string, unknown> | null;
  grouping?: { brand?: string | null } | null;
} | null | undefined;

export function resolveBrandKey(data?: BrandKeySource) {
  return (
    normalizeBrandKey(data?.brand?.slug) ||
    normalizeBrandKey(typeof data?.product?.brand === "string" ? data.product.brand : null) ||
    normalizeBrandKey(data?.grouping?.brand) ||
    normalizeBrandKey(data?.brand?.title) ||
    normalizeBrandKey(typeof data?.product?.brandTitle === "string" ? data.product.brandTitle : null)
  );
}

export function resolveBrandLabel(data?: BrandKeySource) {
  return (
    data?.brand?.title ??
    (typeof data?.product?.brandTitle === "string" ? data.product.brandTitle : null) ??
    (typeof data?.product?.brand === "string" ? data.product.brand : null) ??
    data?.grouping?.brand ??
    "Piessang"
  );
}
