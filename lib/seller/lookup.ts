import { getAdminDb } from "@/lib/firebase/admin";

export const SELLER_LOOKUP_COLLECTION = "seller_lookup_v1";

type DbLike = ReturnType<typeof getAdminDb>;

type SellerLookupDoc = {
  id: string;
  data: Record<string, any>;
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeSlug(value: unknown) {
  return toStr(value).toLowerCase();
}

function normalizeCode(value: unknown) {
  return toStr(value).toUpperCase();
}

function safeDocId(prefix: "code" | "slug", value: string) {
  return `${prefix}:${value.replace(/\//g, "_")}`;
}

function sellerIdentifiers(seller: Record<string, any> | null | undefined) {
  const record = seller && typeof seller === "object" ? seller : {};
  const codes = [
    record?.sellerCode,
    record?.groupSellerCode,
    record?.activeSellerCode,
  ].map(normalizeCode).filter(Boolean);
  const slugs = [
    record?.sellerSlug,
    record?.groupSellerSlug,
    record?.activeSellerSlug,
  ].map(normalizeSlug).filter(Boolean);

  return {
    codes: Array.from(new Set(codes)),
    slugs: Array.from(new Set(slugs)),
  };
}

function buildLookupData(uid: string, userData: Record<string, any>, identifierType: "code" | "slug", identifier: string) {
  const seller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
  return {
    uid,
    identifierType,
    identifier,
    sellerCode: normalizeCode(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode) || null,
    sellerSlug: normalizeSlug(seller?.sellerSlug || seller?.activeSellerSlug || seller?.groupSellerSlug) || null,
    vendorName: toStr(seller?.vendorName || seller?.groupVendorName) || null,
    status: toStr(seller?.status || (seller?.sellerAccess === false ? "closed" : "active")).toLowerCase() || "active",
    sellerAccess: seller?.sellerAccess === true,
    updatedAt: new Date().toISOString(),
  };
}

export async function upsertSellerLookupForUser(
  uid: string,
  userData: Record<string, any>,
  db: DbLike = getAdminDb(),
) {
  if (!db || !uid || !userData || typeof userData !== "object") return { written: 0 };
  const seller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
  const identifiers = sellerIdentifiers(seller);
  const writes: Promise<unknown>[] = [];

  for (const code of identifiers.codes) {
    writes.push(
      db.collection(SELLER_LOOKUP_COLLECTION).doc(safeDocId("code", code)).set(
        buildLookupData(uid, userData, "code", code),
        { merge: true },
      ),
    );
  }

  for (const slug of identifiers.slugs) {
    writes.push(
      db.collection(SELLER_LOOKUP_COLLECTION).doc(safeDocId("slug", slug)).set(
        buildLookupData(uid, userData, "slug", slug),
        { merge: true },
      ),
    );
  }

  await Promise.all(writes);
  return { written: writes.length };
}

async function readOwnerFromLookupDoc(db: NonNullable<DbLike>, ref: FirebaseFirestore.DocumentReference) {
  const lookupSnap = await ref.get().catch(() => null);
  if (!lookupSnap?.exists) return null;
  const lookup = lookupSnap.data() || {};
  const uid = toStr(lookup?.uid);
  if (!uid) return null;
  const userSnap = await db.collection("users").doc(uid).get().catch(() => null);
  if (!userSnap?.exists) return null;
  return {
    id: userSnap.id,
    data: userSnap.data() || {},
  };
}

export async function findSellerOwnerFromLookup(identifier: string): Promise<SellerLookupDoc | null> {
  const db = getAdminDb();
  const needle = toStr(identifier);
  if (!db || !needle) return null;

  const code = normalizeCode(needle);
  if (code) {
    const match = await readOwnerFromLookupDoc(db, db.collection(SELLER_LOOKUP_COLLECTION).doc(safeDocId("code", code)));
    if (match) return match;
  }

  const slug = normalizeSlug(needle);
  if (slug) {
    const match = await readOwnerFromLookupDoc(db, db.collection(SELLER_LOOKUP_COLLECTION).doc(safeDocId("slug", slug)));
    if (match) return match;
  }

  return null;
}
