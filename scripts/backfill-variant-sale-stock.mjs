import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function normalizePrivateKey(value = "") {
  return String(value).replace(/\\n/g, "\n").trim();
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
    throw new Error("Missing Firebase admin env for sale stock backfill.");
  }

  const app =
    getApps().find((entry) => entry.name === "piessang-sale-stock-backfill") ||
    initializeApp(
      {
        credential: cert({ projectId, clientEmail, privateKey }),
      },
      "piessang-sale-stock-backfill",
    );

  return getFirestore(app, databaseId);
}

function inventoryQty(variant) {
  return Array.isArray(variant?.inventory)
    ? variant.inventory.reduce((sum, row) => sum + Math.max(0, Number(row?.in_stock_qty || 0)), 0)
    : 0;
}

async function main() {
  const db = getAdminDb();
  const snap = await db.collection("products_v2").get();
  let updatedProducts = 0;
  let updatedVariants = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const variants = Array.isArray(data?.variants) ? data.variants : [];
    let changed = false;
    const nextVariants = variants.map((variant) => {
      if (!variant || typeof variant !== "object") return variant;
      const nextVariant = { ...variant };
      if (!nextVariant.sale || typeof nextVariant.sale !== "object") return nextVariant;

      const inventory = inventoryQty(nextVariant);
      const nextSale = { ...nextVariant.sale };
      let variantChanged = false;
      if ("qty_available" in nextSale) {
        delete nextSale.qty_available;
        changed = true;
        variantChanged = true;
      }

      if (!nextSale.disabled_by_admin && nextSale.is_on_sale === true && inventory <= 0) {
        nextSale.is_on_sale = false;
        changed = true;
        variantChanged = true;
      }

      if (variantChanged) {
        updatedVariants += 1;
      }

      nextVariant.sale = nextSale;
      return nextVariant;
    });

    if (!changed) continue;

    await docSnap.ref.set(
      {
        variants: nextVariants,
        timestamps: {
          ...(data?.timestamps || {}),
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true },
    );
    updatedProducts += 1;
  }

  console.log(JSON.stringify({ totalProducts: snap.size, updatedProducts, updatedVariants }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
