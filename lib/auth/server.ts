import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebase/admin";
import { getAdminAuth } from "@/lib/firebase/admin";
import { SELLER_CATALOGUE_CATEGORIES, getSellerCatalogueSubCategories } from "@/lib/seller/catalogue-categories";
import { EMPTY_AUTH_BOOTSTRAP, type AuthBootstrap, type AuthBootstrapProfile } from "@/lib/auth/bootstrap";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getSellerReviewRequest } from "@/lib/seller/account-status";

function normalizeFavoriteIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") return item.trim();
      if (typeof item === "object") {
        const record = item as { unique_id?: string; uniqueId?: string; product_unique_id?: string };
        return (record.unique_id ?? record.uniqueId ?? record.product_unique_id ?? "").trim() || null;
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));
}

function normalizeSellerArray<T extends Record<string, unknown>>(value: unknown): T[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is T => Boolean(item && typeof item === "object"));
}

function buildMinimalProfile(sessionUser: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}): AuthBootstrapProfile {
  const accountName =
    sessionUser.displayName ??
    sessionUser.email?.split("@")[0] ??
    "Piessang user";

  return {
    uid: sessionUser.uid,
    email: sessionUser.email,
    displayName: sessionUser.displayName ?? accountName,
    photoURL: sessionUser.photoURL,
    systemAccessType: null,
    favoriteCount: 0,
    favoriteIds: [],
    isSeller: false,
    sellerAccessRequested: false,
    sellerStatus: null,
    sellerBlockedReasonCode: null,
    sellerBlockedReasonMessage: null,
    sellerBlockedAt: null,
    sellerBlockedBy: null,
    sellerReviewRequestStatus: null,
    sellerReviewRequestedAt: null,
    sellerReviewRequestedBy: null,
    sellerReviewRequestMessage: null,
    sellerReviewResponseStatus: null,
    sellerReviewResponseAt: null,
    sellerReviewResponseBy: null,
    sellerReviewResponseMessage: null,
    sellerTeamOwnerUid: null,
    accountName,
    sellerVendorName: null,
    sellerVendorDescription: null,
    sellerCode: null,
    sellerSlug: null,
    sellerActiveSellerSlug: null,
    sellerTeamRole: null,
    sellerCategory: null,
    sellerCategoryTitle: null,
    sellerSubCategory: null,
    sellerSubCategoryTitle: null,
    sellerManagedAccounts: null,
    sellerTeamMembers: null,
    sellerTeamInvites: null,
  };
}

function normalizeCartState(items: unknown) {
  if (!Array.isArray(items)) {
    return { itemCount: 0, productCounts: {}, variantCounts: {} };
  }

  const productCounts: Record<string, number> = {};
  const variantCounts: Record<string, number> = {};
  let itemCount = 0;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as {
      qty?: number;
      quantity?: number;
      product_unique_id?: string;
      product_snapshot?: { product?: { unique_id?: string | number } };
      selected_variant_id?: string;
      selected_variant_snapshot?: { variant_id?: string | number };
    };

    const qty = Number(record.qty ?? record.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const productId = String(
      record.product_unique_id ?? record.product_snapshot?.product?.unique_id ?? "",
    ).trim();
    const variantId = String(
      record.selected_variant_id ?? record.selected_variant_snapshot?.variant_id ?? "",
    ).trim();

    itemCount += qty;
    if (productId) {
      productCounts[productId] = (productCounts[productId] ?? 0) + qty;
    }
    if (productId && variantId) {
      const key = `${productId}::${variantId}`;
      variantCounts[key] = (variantCounts[key] ?? 0) + qty;
    }
  }

  return { itemCount, productCounts, variantCounts };
}

export async function verifyFirebaseIdToken(idToken: string) {
  const adminAuth = getAdminAuth();
  if (adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      return {
        uid: String(decoded.uid),
        email: typeof decoded.email === "string" ? decoded.email : null,
        displayName: typeof decoded.name === "string" ? decoded.name : null,
        photoURL: typeof decoded.picture === "string" ? decoded.picture : null,
      };
    } catch {
      // Fall back to the identity toolkit lookup below if admin verification fails.
    }
  }

  const apiKey = process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  const user = Array.isArray(payload?.users) ? payload.users[0] : null;
  if (!user?.localId) return null;

  return {
    uid: String(user.localId),
    email: typeof user.email === "string" ? user.email : null,
    displayName: typeof user.displayName === "string" ? user.displayName : null,
    photoURL: typeof user.photoUrl === "string" ? user.photoUrl : null,
  };
}

async function buildServerAuthBootstrap(sessionUser: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}): Promise<AuthBootstrap> {
  const db = getAdminDb();
  if (!db) {
    return {
      user: sessionUser,
      profile: buildMinimalProfile(sessionUser),
      itemCount: 0,
      productCounts: {},
      variantCounts: {},
    };
  }
  const [userSnap, cartSnap] = await Promise.all([
    db.collection("users").doc(sessionUser.uid).get(),
    db.collection("carts").doc(sessionUser.uid).get(),
  ]);

  const data = userSnap.exists ? (userSnap.data() || {}) : {};
  const cartData = cartSnap.exists ? cartSnap.data() || {} : {};
  const cartState = normalizeCartState(cartData?.items);

  return {
    user: sessionUser,
    profile: normalizeBootstrapProfile(sessionUser.uid, data, sessionUser),
    itemCount: cartState.itemCount,
    productCounts: cartState.productCounts,
    variantCounts: cartState.variantCounts,
  };
}

function normalizeBootstrapProfile(uid: string, data: Record<string, any>, user: AuthBootstrap["user"]): AuthBootstrapProfile {
  const favorites = normalizeFavoriteIds(data?.preferences?.favoriteProducts);
  const account = data?.account && typeof data.account === "object" ? data.account : {};
  const seller = data?.seller && typeof data.seller === "object" ? data.seller : {};
  const system = data?.system && typeof data.system === "object" ? data.system : {};
  const sellerTeam = seller?.team && typeof seller.team === "object" ? seller.team : {};
  const sellerStatus = typeof seller.status === "string" ? seller.status.trim().toLowerCase() : "";
  const blocked = seller?.blocked && typeof seller.blocked === "object" ? seller.blocked : {};
  const reviewRequest = getSellerReviewRequest(data) || {};
  const sellerAccess = seller.sellerAccess === true;
  const sellerTeamRoleRaw = typeof seller.teamRole === "string" ? seller.teamRole.trim().toLowerCase() : "";
  const sellerTeamRole = sellerTeamRoleRaw || (sellerAccess ? "owner" : "");
  const systemAccessType = typeof system.accessType === "string" ? system.accessType.trim().toLowerCase() : "";
  const sellerCategory = typeof seller.category === "string" ? seller.category.trim() : "";
  const sellerSubCategory = typeof seller.subCategory === "string" ? seller.subCategory.trim() : "";
  const sellerVendorDescription = typeof seller.vendorDescription === "string"
    ? seller.vendorDescription.trim()
    : typeof seller.description === "string"
      ? seller.description.trim()
      : "";
  const sellerCode = typeof seller.sellerCode === "string" ? seller.sellerCode.trim() : "";
  const sellerCategoryTitle = SELLER_CATALOGUE_CATEGORIES.find((item) => item.slug === sellerCategory)?.title ?? null;
  const sellerSubCategoryTitle =
    getSellerCatalogueSubCategories(sellerCategory).find((item) => item.slug === sellerSubCategory)?.title ?? null;

  return {
    uid,
    email: user?.email ?? data.email ?? null,
    displayName: user?.displayName ?? seller.vendorName ?? account.accountName ?? null,
    photoURL: user?.photoURL ?? data.media?.photoUrl ?? null,
    systemAccessType: systemAccessType || null,
    favoriteCount: favorites.length,
    favoriteIds: favorites,
    isSeller:
      sellerAccess ||
      ["active", "approved", "live"].includes(sellerStatus),
    sellerAccessRequested:
      ["requested", "pending", "under_review"].includes(sellerStatus) ||
      account.requestedSellerAccess === true,
    sellerStatus: sellerStatus || null,
    sellerBlockedReasonCode: typeof blocked.reasonCode === "string" ? blocked.reasonCode.trim() : null,
    sellerBlockedReasonMessage: typeof blocked.reasonMessage === "string" ? blocked.reasonMessage.trim() : null,
    sellerBlockedAt: typeof blocked.blockedAt === "string" ? blocked.blockedAt.trim() : null,
    sellerBlockedBy: typeof blocked.blockedBy === "string" ? blocked.blockedBy.trim() : null,
    sellerReviewRequestStatus: typeof reviewRequest.status === "string" ? reviewRequest.status.trim().toLowerCase() : null,
    sellerReviewRequestedAt: typeof reviewRequest.requestedAt === "string" ? reviewRequest.requestedAt.trim() : null,
    sellerReviewRequestedBy: typeof reviewRequest.requestedBy === "string" ? reviewRequest.requestedBy.trim() : null,
    sellerReviewRequestMessage: typeof reviewRequest.message === "string" ? reviewRequest.message.trim() : null,
    sellerReviewResponseStatus: typeof reviewRequest.responseStatus === "string" ? reviewRequest.responseStatus.trim().toLowerCase() : null,
    sellerReviewResponseAt: typeof reviewRequest.respondedAt === "string" ? reviewRequest.respondedAt.trim() : null,
    sellerReviewResponseBy: typeof reviewRequest.respondedBy === "string" ? reviewRequest.respondedBy.trim() : null,
    sellerReviewResponseMessage: typeof reviewRequest.responseMessage === "string" ? reviewRequest.responseMessage.trim() : null,
    sellerTeamOwnerUid: typeof seller.teamOwnerUid === "string" ? seller.teamOwnerUid.trim() : null,
    accountName: account.accountName ?? null,
    sellerVendorName: seller.vendorName ?? null,
    sellerVendorDescription: sellerVendorDescription || null,
    sellerCode: sellerCode || null,
    sellerSlug: seller.sellerSlug ?? null,
    sellerActiveSellerSlug: seller.activeSellerSlug ?? seller.sellerSlug ?? null,
    sellerTeamRole: sellerTeamRole || null,
    sellerCategory: sellerCategory || null,
    sellerCategoryTitle,
    sellerSubCategory: sellerSubCategory || null,
    sellerSubCategoryTitle,
    sellerManagedAccounts: normalizeSellerArray(seller.managedSellerAccounts),
    sellerTeamMembers: normalizeSellerArray(sellerTeam.members),
    sellerTeamInvites: normalizeSellerArray(sellerTeam.invites),
  };
}

export async function getServerAuthBootstrap(): Promise<AuthBootstrap> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value?.trim() || "";
  if (!sessionCookie) return EMPTY_AUTH_BOOTSTRAP;

  const sessionUser = await verifyFirebaseIdToken(sessionCookie);
  if (!sessionUser?.uid) return EMPTY_AUTH_BOOTSTRAP;

  return buildServerAuthBootstrap(sessionUser);
}

export async function getServerAuthBootstrapForUser(sessionUser: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}): Promise<AuthBootstrap> {
  if (!sessionUser?.uid) return EMPTY_AUTH_BOOTSTRAP;
  return buildServerAuthBootstrap(sessionUser);
}
