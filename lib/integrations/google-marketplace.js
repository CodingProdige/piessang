function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export function resolveMarketplaceSeller(input = {}) {
  const sellerCode = toStr(
    input?.product?.sellerCode ||
      input?.seller?.sellerCode ||
      input?.sellerCode ||
      ""
  );
  const sellerSlug = toStr(
    input?.product?.sellerSlug ||
      input?.seller?.sellerSlug ||
      input?.seller?.activeSellerSlug ||
      input?.seller?.groupSellerSlug ||
      input?.sellerSlug ||
      ""
  );
  const vendorName = toStr(
    input?.seller?.vendorName ||
      input?.product?.vendorName ||
      input?.vendor?.title ||
      input?.vendorName ||
      ""
  );

  const rawExternalSellerId = sellerCode || sellerSlug || vendorName || "piessang-seller";
  const externalSellerId = rawExternalSellerId
    .replace(/[^0-9A-Za-z.~_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "piessang-seller";

  return {
    sellerCode: sellerCode || null,
    sellerSlug: sellerSlug || null,
    vendorName: vendorName || null,
    externalSellerId,
  };
}
