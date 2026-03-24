function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeKey(value: unknown) {
  return toStr(value).toLowerCase();
}

function getSellerRecord(source: Record<string, unknown> | null | undefined) {
  if (!source || typeof source !== "object") return {};
  if (source.seller && typeof source.seller === "object") return source.seller as Record<string, unknown>;
  return source;
}

function getManagedAccounts(source: Record<string, unknown> | null | undefined) {
  const seller = getSellerRecord(source) as Record<string, any>;
  const topLevel = source as Record<string, any> | null | undefined;
  return Array.isArray(seller.managedSellerAccounts)
    ? seller.managedSellerAccounts
    : Array.isArray(topLevel?.sellerManagedAccounts)
      ? topLevel.sellerManagedAccounts
      : [];
}

export function isSystemAdminUser(source: Record<string, unknown> | null | undefined) {
  const seller = getSellerRecord(source) as Record<string, any>;
  const system = source && typeof source === "object" ? (source as Record<string, any>).system : null;
  const systemAccessType = normalizeKey(system?.accessType || source?.systemAccessType);
  return systemAccessType === "admin" || normalizeKey(seller?.systemAccessType) === "admin";
}

export function getSellerSettlementIdentifiers(source: Record<string, unknown> | null | undefined) {
  const seller = getSellerRecord(source) as Record<string, any>;
  const identifiers = new Set<string>();

  [
    seller?.sellerCode,
    seller?.activeSellerCode,
    seller?.groupSellerCode,
    seller?.sellerSlug,
    seller?.activeSellerSlug,
    seller?.groupSellerSlug,
  ]
    .map(normalizeKey)
    .filter(Boolean)
    .forEach((value) => identifiers.add(value));

  for (const item of getManagedAccounts(source)) {
    [
      item?.sellerCode,
      item?.sellerSlug,
      item?.groupSellerCode,
      item?.groupSellerSlug,
      item?.activeSellerCode,
      item?.activeSellerSlug,
    ]
      .map(normalizeKey)
      .filter(Boolean)
      .forEach((value) => identifiers.add(value));
  }

  return identifiers;
}

export function canAccessSellerSettlement(
  source: Record<string, unknown> | null | undefined,
  sellerSlug?: string | null,
  sellerCode?: string | null,
) {
  if (isSystemAdminUser(source)) return true;

  const identifiers = getSellerSettlementIdentifiers(source);
  const slugNeedle = normalizeKey(sellerSlug);
  const codeNeedle = normalizeKey(sellerCode);

  return Boolean(
    (slugNeedle && identifiers.has(slugNeedle)) ||
      (codeNeedle && identifiers.has(codeNeedle)),
  );
}

export function getPrimarySellerSettlementIdentifier(source: Record<string, unknown> | null | undefined) {
  const seller = getSellerRecord(source) as Record<string, any>;
  return (
    toStr(
      seller?.activeSellerCode ||
        seller?.groupSellerCode ||
        seller?.sellerCode ||
        seller?.activeSellerSlug ||
        seller?.groupSellerSlug ||
        seller?.sellerSlug,
    ) || null
  );
}
