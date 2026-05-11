import path from "node:path";
import { existsSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const SELLER_LOOKUP_COLLECTION = "seller_lookup_v1";

function loadLocalEnvFiles() {
  for (const filePath of [path.resolve(process.cwd(), ".env.local"), path.resolve(process.cwd(), ".env")]) {
    if (!existsSync(filePath)) continue;
    try {
      process.loadEnvFile(filePath);
    } catch (error) {
      console.warn(`Unable to load env file ${filePath}:`, error instanceof Error ? error.message : String(error));
    }
  }
}

loadLocalEnvFiles();

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizePrivateKey(value = "") {
  return String(value).replace(/\\n/g, "\n").trim();
}

function normalizeSlug(value) {
  return toStr(value).toLowerCase();
}

function normalizeCode(value) {
  return toStr(value).toUpperCase();
}

function safeDocId(prefix, value) {
  return `${prefix}:${value.replace(/\//g, "_")}`;
}

function getAdminDb() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_PROJECT_ID ||
    "";
  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL ||
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    "";
  const privateKey = normalizePrivateKey(
    process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  );
  const databaseId = process.env.PIESSANG_FIREBASE_DATABASE_ID || "";

  if (!projectId || !clientEmail || !privateKey || !databaseId) {
    throw new Error("Missing Firebase admin env for seller lookup backfill.");
  }

  const app =
    getApps().find((entry) => entry.name === "piessang-seller-lookup-backfill") ||
    initializeApp(
      {
        credential: cert({ projectId, clientEmail, privateKey }),
      },
      "piessang-seller-lookup-backfill",
    );

  return getFirestore(app, databaseId);
}

function sellerIdentifiers(seller) {
  const record = seller && typeof seller === "object" ? seller : {};
  const codes = [
    record.sellerCode,
    record.groupSellerCode,
    record.activeSellerCode,
  ].map(normalizeCode).filter(Boolean);
  const slugs = [
    record.sellerSlug,
    record.groupSellerSlug,
    record.activeSellerSlug,
  ].map(normalizeSlug).filter(Boolean);
  return {
    codes: Array.from(new Set(codes)),
    slugs: Array.from(new Set(slugs)),
  };
}

function buildLookupData(uid, userData, identifierType, identifier) {
  const seller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
  return {
    uid,
    identifierType,
    identifier,
    sellerCode: normalizeCode(seller.sellerCode || seller.activeSellerCode || seller.groupSellerCode) || null,
    sellerSlug: normalizeSlug(seller.sellerSlug || seller.activeSellerSlug || seller.groupSellerSlug) || null,
    vendorName: toStr(seller.vendorName || seller.groupVendorName) || null,
    status: toStr(seller.status || (seller.sellerAccess === false ? "closed" : "active")).toLowerCase() || "active",
    sellerAccess: seller.sellerAccess === true,
    updatedAt: new Date().toISOString(),
  };
}

async function main() {
  const db = getAdminDb();
  const usersSnap = await db.collection("users").get();
  let sellers = 0;
  let writes = 0;

  for (const userSnap of usersSnap.docs) {
    const userData = userSnap.data() || {};
    const seller = userData?.seller && typeof userData.seller === "object" ? userData.seller : null;
    if (!seller) continue;

    const identifiers = sellerIdentifiers(seller);
    if (!identifiers.codes.length && !identifiers.slugs.length) continue;
    sellers += 1;

    const batch = db.batch();
    for (const code of identifiers.codes) {
      batch.set(
        db.collection(SELLER_LOOKUP_COLLECTION).doc(safeDocId("code", code)),
        buildLookupData(userSnap.id, userData, "code", code),
        { merge: true },
      );
      writes += 1;
    }
    for (const slug of identifiers.slugs) {
      batch.set(
        db.collection(SELLER_LOOKUP_COLLECTION).doc(safeDocId("slug", slug)),
        buildLookupData(userSnap.id, userData, "slug", slug),
        { merge: true },
      );
      writes += 1;
    }
    await batch.commit();
  }

  console.log(`Backfilled ${writes} seller lookup docs for ${sellers} seller users.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
