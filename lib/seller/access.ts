function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function getSellerRecord(source: Record<string, unknown> | null | undefined) {
  if (!source || typeof source !== "object") return {};
  if (source.seller && typeof source.seller === "object") return source.seller;
  return source;
}

function getManagedAccounts(source: Record<string, unknown> | null | undefined) {
  const seller = getSellerRecord(source);
  const record = seller as Record<string, any>;
  const topLevel = source as Record<string, any> | null | undefined;
  return Array.isArray(record.managedSellerAccounts)
    ? record.managedSellerAccounts
    : Array.isArray(topLevel?.sellerManagedAccounts)
      ? topLevel.sellerManagedAccounts
      : [];
}

export function hasSellerTeamMemberships(source: Record<string, unknown> | null | undefined) {
  return getManagedAccounts(source).some((item: any) => Boolean(toStr(item?.sellerSlug)));
}

export function getActiveSellerManagedAccount(source: Record<string, unknown> | null | undefined) {
  const seller = getSellerRecord(source);
  const managedAccounts = getManagedAccounts(source);
  const record = seller as Record<string, any>;
  const topLevel = source as Record<string, any> | null | undefined;
  const activeSlug = toStr(
    record.activeSellerSlug ||
      record.groupSellerSlug ||
      record.sellerSlug ||
      topLevel?.sellerActiveSellerSlug ||
      topLevel?.sellerSlug,
  );

  return (
    managedAccounts.find((item: any) => toStr(item?.sellerSlug) === activeSlug) ??
    managedAccounts.find((item: any) => toStr(item?.sellerSlug)) ??
    null
  );
}

export function ownsSellerAccount(source: Record<string, unknown> | null | undefined) {
  const seller = getSellerRecord(source);
  const record = seller as Record<string, any>;
  const topLevel = source as Record<string, any> | null | undefined;
  const sellerAccess = record.sellerAccess === true || topLevel?.isSeller === true;
  const sellerSlug = toStr(
    record.sellerSlug ||
      record.groupSellerSlug ||
      record.activeSellerSlug ||
      topLevel?.sellerSlug ||
      topLevel?.sellerActiveSellerSlug,
  );
  const teamOwnerUid = toStr(record.teamOwnerUid || topLevel?.sellerTeamOwnerUid);
  const status = toStr(record.status || topLevel?.sellerStatus).toLowerCase();

  return Boolean(
    sellerAccess &&
      sellerSlug &&
      !teamOwnerUid &&
      ["active", "approved", "live"].includes(status),
  );
}

export function canCreateSellerAccount(source: Record<string, any> | null | undefined) {
  if (hasSellerTeamMemberships(source)) {
    return {
      allowed: false,
      reason: "Leave your current seller team before registering your own seller account.",
      code: "team_membership_exists",
    };
  }

  if (ownsSellerAccount(source)) {
    return {
      allowed: false,
      reason: "You already have a seller account. Delete it before registering another one.",
      code: "seller_account_exists",
    };
  }

  return { allowed: true as const };
}
