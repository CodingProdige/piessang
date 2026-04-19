import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeCartForClient, readCartDoc } from "@/lib/cart/public-api";

function toStr(value) {
  return String(value || "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

export async function ensureCartShareToken({ cartOwnerId, cartId }) {
  const db = getAdminDb();
  const safeCartOwnerId = toStr(cartOwnerId);
  const safeCartId = toStr(cartId);
  if (!db || !safeCartOwnerId || !safeCartId) return null;

  const mappings = await db
    .collection("cart_share_tokens")
    .where("cartOwnerId", "==", safeCartOwnerId)
    .where("cartId", "==", safeCartId)
    .where("status", "==", "active")
    .limit(1)
    .get();

  const timestamp = nowIso();
  if (!mappings.empty) {
    const existing = mappings.docs[0];
    const data = existing.data() || {};
    await existing.ref.set({ updatedAt: timestamp, lastSeenAt: timestamp }, { merge: true });
    return {
      shareToken: existing.id,
      cartOwnerId: safeCartOwnerId,
      cartId: safeCartId,
      status: toStr(data?.status || "active") || "active",
      updatedAt: timestamp,
    };
  }

  const shareToken = `cartshare_${crypto.randomUUID().replace(/-/g, "")}`;
  await db.collection("cart_share_tokens").doc(shareToken).set(
    {
      shareToken,
      cartOwnerId: safeCartOwnerId,
      cartId: safeCartId,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
      lastSeenAt: timestamp,
    },
    { merge: true },
  );

  return {
    shareToken,
    cartOwnerId: safeCartOwnerId,
    cartId: safeCartId,
    status: "active",
    updatedAt: timestamp,
  };
}

export async function resolveSharedCart({ shareToken }) {
  const db = getAdminDb();
  const safeShareToken = toStr(shareToken);
  if (!db || !safeShareToken) return null;

  const ref = db.collection("cart_share_tokens").doc(safeShareToken);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const data = snap.data() || {};
  if (toStr(data?.status || "active") !== "active") return null;

  const cartOwnerId = toStr(data?.cartOwnerId);
  const cartId = toStr(data?.cartId);
  if (!cartOwnerId || !cartId) return null;

  const cart = await readCartDoc(cartOwnerId);
  const normalizedCart = normalizeCartForClient(cart, cartOwnerId);
  if (!normalizedCart) return null;
  if (toStr(normalizedCart?.cart?.cart_id) !== cartId) return null;

  const timestamp = nowIso();
  await ref.set({ updatedAt: timestamp, lastSeenAt: timestamp }, { merge: true });

  return {
    shareToken: safeShareToken,
    cartOwnerId,
    cartId,
    cart: normalizedCart,
    updatedAt: timestamp,
  };
}
