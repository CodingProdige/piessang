import { getAdminDb } from "@/lib/firebase/admin";

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function sellerSlugMatches(source: Record<string, any> | null | undefined, sellerSlug: string) {
  const needle = toStr(sellerSlug).toLowerCase();
  if (!needle) return false;
  return [
    source?.sellerSlug,
    source?.activeSellerSlug,
    source?.groupSellerSlug,
  ]
    .map((value) => toStr(value).toLowerCase())
    .filter(Boolean)
    .includes(needle);
}

function sellerCodeMatches(source: Record<string, any> | null | undefined, sellerCode: string) {
  const needle = toStr(sellerCode).toLowerCase();
  if (!needle) return false;
  return [
    source?.sellerCode,
    source?.activeSellerCode,
    source?.groupSellerCode,
  ]
    .map((value) => toStr(value).toLowerCase())
    .filter(Boolean)
    .includes(needle);
}

function patchManagedSellerAccount(
  managed: any[],
  sellerSlug: string,
  sellerCode: string,
  patch: Record<string, any>,
) {
  let changed = false;
  const next = managed.map((item) => {
    const matches =
      sellerSlugMatches(item, sellerSlug) ||
      sellerCodeMatches(item, sellerCode);
    if (!matches) return item;
    changed = true;
    return {
      ...item,
      ...patch,
    };
  });
  return { next, changed };
}

export async function applySellerBillingBlock({
  sellerSlug = "",
  sellerCode = "",
  reasonMessage = "",
  blockedBy = "billing-automation",
  blockedAt = new Date().toISOString(),
}: {
  sellerSlug?: string;
  sellerCode?: string;
  reasonMessage?: string;
  blockedBy?: string;
  blockedAt?: string;
}) {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const slug = toStr(sellerSlug);
  const code = toStr(sellerCode);
  if (!slug && !code) throw new Error("sellerSlug or sellerCode is required.");

  const usersSnap = await db.collection("users").get();
  const updates = usersSnap.docs.map(async (userSnap) => {
    const data = userSnap.data() || {};
    const seller = data?.seller && typeof data.seller === "object" ? data.seller : {};
    const managed = Array.isArray(seller?.managedSellerAccounts) ? seller.managedSellerAccounts : [];
    const currentMatches =
      sellerSlugMatches(seller, slug) ||
      sellerCodeMatches(seller, code);
    const { next: nextManaged, changed } = patchManagedSellerAccount(managed, slug, code, {
      status: "blocked",
      blockedReasonCode: "payment_issue",
      blockedReasonMessage: reasonMessage,
      blockedAt,
      blockedBy,
    });

    if (!currentMatches && !changed) return;

    const nextSeller = {
      ...seller,
      managedSellerAccounts: nextManaged,
    };

    if (currentMatches) {
      nextSeller.status = "blocked";
      nextSeller.blockedReasonCode = "payment_issue";
      nextSeller.blockedReasonMessage = reasonMessage;
      nextSeller.blockedAt = blockedAt;
      nextSeller.blockedBy = blockedBy;
      nextSeller.blocked = {
        ...(seller?.blocked && typeof seller.blocked === "object" ? seller.blocked : {}),
        reasonCode: "payment_issue",
        reasonMessage,
        blockedAt,
        blockedBy,
      };
    }

    await userSnap.ref.set(
      {
        seller: nextSeller,
        timestamps: {
          ...(data?.timestamps && typeof data.timestamps === "object" ? data.timestamps : {}),
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true },
    );
  });

  await Promise.all(updates);
}

export async function clearSellerBillingBlock({
  sellerSlug = "",
  sellerCode = "",
  clearedBy = "billing-payment",
}: {
  sellerSlug?: string;
  sellerCode?: string;
  clearedBy?: string;
}) {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const slug = toStr(sellerSlug);
  const code = toStr(sellerCode);
  if (!slug && !code) throw new Error("sellerSlug or sellerCode is required.");

  const usersSnap = await db.collection("users").get();
  const updates = usersSnap.docs.map(async (userSnap) => {
    const data = userSnap.data() || {};
    const seller = data?.seller && typeof data.seller === "object" ? data.seller : {};
    const managed = Array.isArray(seller?.managedSellerAccounts) ? seller.managedSellerAccounts : [];
    const currentMatches =
      sellerSlugMatches(seller, slug) ||
      sellerCodeMatches(seller, code);
    const { next: nextManaged, changed } = patchManagedSellerAccount(managed, slug, code, {
      status: "active",
      blockedReasonCode: null,
      blockedReasonMessage: null,
      blockedAt: null,
      blockedBy: null,
    });

    if (!currentMatches && !changed) return;

    const nextSeller = {
      ...seller,
      managedSellerAccounts: nextManaged,
    };

    if (currentMatches) {
      const blocked = seller?.blocked && typeof seller.blocked === "object" ? seller.blocked : null;
      const blockedCode = toStr(blocked?.reasonCode || seller?.blockedReasonCode).toLowerCase();
      if (blockedCode === "payment_issue" || toStr(seller?.status).toLowerCase() === "blocked") {
        nextSeller.status = "active";
        nextSeller.blockedReasonCode = null;
        nextSeller.blockedReasonMessage = null;
        nextSeller.blockedAt = null;
        nextSeller.blockedBy = clearedBy;
        nextSeller.blocked = null;
      }
    }

    await userSnap.ref.set(
      {
        seller: nextSeller,
        timestamps: {
          ...(data?.timestamps && typeof data.timestamps === "object" ? data.timestamps : {}),
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true },
    );
  });

  await Promise.all(updates);
}
