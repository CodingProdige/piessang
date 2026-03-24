import type { Firestore } from "firebase-admin/firestore";

function toStr(value: unknown) {
  return String(value ?? "").trim();
}

function itemMatchesProduct(item: Record<string, any>, productId: string) {
  const productSnapshot = item?.product_snapshot || item?.product || {};
  const candidateIds = [
    item?.product_unique_id,
    productSnapshot?.product?.unique_id,
    productSnapshot?.unique_id,
    productSnapshot?.docId,
  ].map(toStr);
  return candidateIds.includes(productId);
}

function itemMatchesVariant(item: Record<string, any>, variantId: string) {
  const variantSnapshot = item?.selected_variant_snapshot || item?.selected_variant || item?.variant || {};
  const candidateIds = [
    item?.selected_variant_id,
    variantSnapshot?.variant_id,
    variantSnapshot?.variantId,
  ].map(toStr);
  return candidateIds.includes(variantId);
}

export async function findOrderReferencesForProduct(
  db: Firestore,
  productId: string,
  variantId?: string | null,
) {
  const snap = await db.collection("orders").get();
  const references: Array<{ orderId: string; orderNumber: string | null }> = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const items = Array.isArray(data?.cart?.items)
      ? data.cart.items
      : Array.isArray(data?.items)
        ? data.items
        : [];
    const match = items.some((item: Record<string, any>) => {
      if (!itemMatchesProduct(item, productId)) return false;
      if (!variantId) return true;
      return itemMatchesVariant(item, variantId);
    });
    if (!match) continue;
    references.push({
      orderId: docSnap.id,
      orderNumber: toStr(data?.order?.number || data?.orderNumber || "") || null,
    });
    if (references.length >= 5) break;
  }

  return references;
}
