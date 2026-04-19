import { getAdminDb } from "@/lib/firebase/admin";

function toStr(value) {
  return String(value || "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function mappingIdFor(cartOwnerId, cartId) {
  const key = `${toStr(cartOwnerId)}::${toStr(cartId)}`;
  return Buffer.from(key).toString("base64url");
}

function cartLifecycleId(cartOwnerId, cartId) {
  return mappingIdFor(cartOwnerId, cartId);
}

async function upsertCartLifecycle({ cartOwnerId, cartId, status = "active", itemCount = null, extra = {} }) {
  const db = getAdminDb();
  const safeCartOwnerId = toStr(cartOwnerId);
  const safeCartId = toStr(cartId);
  if (!db || !safeCartOwnerId || !safeCartId) return null;
  const timestamp = nowIso();
  const lifecycleRef = db.collection("cart_lifecycle").doc(cartLifecycleId(safeCartOwnerId, safeCartId));
  await lifecycleRef.set(
    {
      cartOwnerId: safeCartOwnerId,
      cartId: safeCartId,
      status: toStr(status) || "active",
      updatedAt: timestamp,
      lastSeenAt: timestamp,
      ...(itemCount == null ? {} : { itemCount: Number(itemCount) || 0 }),
      ...extra,
    },
    { merge: true },
  );
  return { cartOwnerId: safeCartOwnerId, cartId: safeCartId, status: toStr(status) || "active", updatedAt: timestamp };
}

export async function ensureCheckoutSession({ cartOwnerId, cartId }) {
  const db = getAdminDb();
  const safeCartOwnerId = toStr(cartOwnerId);
  const safeCartId = toStr(cartId);
  if (!db || !safeCartOwnerId || !safeCartId) return null;

  const sessionsCollection = db.collection("checkout_sessions");
  const mappingsCollection = db.collection("checkout_session_mappings");
  const mappingId = mappingIdFor(safeCartOwnerId, safeCartId);
  const mappingRef = mappingsCollection.doc(mappingId);
  const mappingSnap = await mappingRef.get();
  const timestamp = nowIso();

  if (mappingSnap.exists) {
    const mapping = mappingSnap.data() || {};
    const existingSessionId = toStr(mapping?.sessionId);
    if (existingSessionId) {
      const sessionRef = sessionsCollection.doc(existingSessionId);
      const sessionSnap = await sessionRef.get();
      if (sessionSnap.exists) {
        const session = sessionSnap.data() || {};
        if (
          toStr(session?.cartOwnerId) === safeCartOwnerId
          && toStr(session?.cartId) === safeCartId
          && toStr(session?.status || "active") === "active"
        ) {
          await Promise.all([
            sessionRef.set({ updatedAt: timestamp, lastSeenAt: timestamp }, { merge: true }),
            mappingRef.set({ updatedAt: timestamp, lastSeenAt: timestamp }, { merge: true }),
            upsertCartLifecycle({ cartOwnerId: safeCartOwnerId, cartId: safeCartId, status: "active" }),
          ]);
          return {
            sessionId: existingSessionId,
            cartId: safeCartId,
            cartOwnerId: safeCartOwnerId,
            status: "active",
            updatedAt: timestamp,
          };
        }
      }
    }
  }

  const sessionId = `chk_${crypto.randomUUID().replace(/-/g, "")}`;
  const sessionPayload = {
    sessionId,
    cartId: safeCartId,
    cartOwnerId: safeCartOwnerId,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastSeenAt: timestamp,
  };

  await Promise.all([
    sessionsCollection.doc(sessionId).set(sessionPayload, { merge: true }),
    mappingRef.set(
      {
        mappingId,
        sessionId,
        cartId: safeCartId,
        cartOwnerId: safeCartOwnerId,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
        lastSeenAt: timestamp,
      },
      { merge: true },
    ),
    upsertCartLifecycle({ cartOwnerId: safeCartOwnerId, cartId: safeCartId, status: "active" }),
  ]);

  return sessionPayload;
}

export async function resolveCheckoutSession({ sessionId, cartOwnerId, cartId = "" }) {
  const db = getAdminDb();
  const safeSessionId = toStr(sessionId);
  const safeCartOwnerId = toStr(cartOwnerId);
  const safeCartId = toStr(cartId);
  if (!db || !safeSessionId || !safeCartOwnerId) return null;

  const sessionRef = db.collection("checkout_sessions").doc(safeSessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) return null;

  const session = sessionSnap.data() || {};
  if (toStr(session?.status || "active") !== "active") return null;
  if (toStr(session?.cartOwnerId) !== safeCartOwnerId) return null;
  if (safeCartId && toStr(session?.cartId) !== safeCartId) return null;

  const timestamp = nowIso();
  await Promise.all([
    sessionRef.set({ updatedAt: timestamp, lastSeenAt: timestamp }, { merge: true }),
    upsertCartLifecycle({ cartOwnerId: safeCartOwnerId, cartId: toStr(session?.cartId), status: "active" }),
  ]);

  return {
    sessionId: safeSessionId,
    cartId: toStr(session?.cartId),
    cartOwnerId: safeCartOwnerId,
    status: "active",
    updatedAt: timestamp,
  };
}

export async function markCheckoutSessionStatus({
  sessionId,
  status,
  orderId = "",
  merchantTransactionId = "",
  reason = "",
}) {
  const db = getAdminDb();
  const safeSessionId = toStr(sessionId);
  const safeStatus = toStr(status).toLowerCase();
  if (!db || !safeSessionId || !safeStatus) return null;

  const sessionRef = db.collection("checkout_sessions").doc(safeSessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) return null;

  const session = sessionSnap.data() || {};
  const cartOwnerId = toStr(session?.cartOwnerId);
  const cartId = toStr(session?.cartId);
  const timestamp = nowIso();
  const nextPayload = {
    status: safeStatus,
    updatedAt: timestamp,
    ...(safeStatus === "completed" ? { completedAt: timestamp } : {}),
    ...(safeStatus === "abandoned" ? { abandonedAt: timestamp } : {}),
    ...(safeStatus === "payment_pending" ? { paymentPendingAt: timestamp } : {}),
    ...(orderId ? { orderId: toStr(orderId) } : {}),
    ...(merchantTransactionId ? { merchantTransactionId: toStr(merchantTransactionId) } : {}),
    ...(reason ? { reason: toStr(reason) } : {}),
  };

  await Promise.all([
    sessionRef.set(nextPayload, { merge: true }),
    cartOwnerId && cartId
      ? upsertCartLifecycle({
          cartOwnerId,
          cartId,
          status: safeStatus === "completed" ? "converted" : safeStatus === "abandoned" ? "abandoned" : "active",
          extra: {
            checkoutSessionId: safeSessionId,
            ...(orderId ? { orderId: toStr(orderId) } : {}),
          },
        })
      : Promise.resolve(null),
  ]);

  return {
    sessionId: safeSessionId,
    cartOwnerId,
    cartId,
    status: safeStatus,
    updatedAt: timestamp,
  };
}

export async function markCheckoutSessionPaymentPending({
  sessionId,
  orderId = "",
  merchantTransactionId = "",
}) {
  return markCheckoutSessionStatus({
    sessionId,
    status: "payment_pending",
    orderId,
    merchantTransactionId,
  });
}

export async function markCheckoutSessionCompleted({
  sessionId,
  orderId = "",
  merchantTransactionId = "",
}) {
  return markCheckoutSessionStatus({
    sessionId,
    status: "completed",
    orderId,
    merchantTransactionId,
  });
}

export async function markStaleCheckoutAndCartLifecycles({
  checkoutAbandonedAfterMinutes = 30,
  cartAbandonedAfterHours = 24,
  limit = 250,
} = {}) {
  const db = getAdminDb();
  if (!db) return { checkoutSessionsAbandoned: 0, cartsAbandoned: 0 };

  const nowMs = Date.now();
  const checkoutCutoffMs = nowMs - Math.max(5, Number(checkoutAbandonedAfterMinutes) || 30) * 60 * 1000;
  const cartCutoffMs = nowMs - Math.max(1, Number(cartAbandonedAfterHours) || 24) * 60 * 60 * 1000;

  const sessionStatuses = ["active", "payment_pending"];
  let checkoutSessionsAbandoned = 0;
  for (const status of sessionStatuses) {
    const snap = await db.collection("checkout_sessions").where("status", "==", status).limit(limit).get();
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const lastSeenMs = new Date(data?.lastSeenAt || data?.updatedAt || data?.createdAt || 0).getTime();
      if (!Number.isFinite(lastSeenMs) || lastSeenMs > checkoutCutoffMs) continue;
      await markCheckoutSessionStatus({
        sessionId: doc.id,
        status: "abandoned",
        orderId: toStr(data?.orderId),
        merchantTransactionId: toStr(data?.merchantTransactionId),
        reason: "stale_session",
      });
      checkoutSessionsAbandoned += 1;
    }
  }

  const cartsSnap = await db.collection("carts").limit(limit).get();
  let cartsAbandoned = 0;
  for (const doc of cartsSnap.docs) {
    const data = doc.data() || {};
    const cartMeta = data?.cart && typeof data.cart === "object" ? data.cart : {};
    const cartId = toStr(cartMeta?.cart_id || cartMeta?.cartId || doc.id);
    const cartOwnerId = toStr(cartMeta?.user_id || cartMeta?.customerId || doc.id);
    const itemCount = Number(data?.item_count) || (Array.isArray(data?.items) ? data.items.length : 0);
    const updatedMs = new Date(data?.timestamps?.updatedAt || data?.timestamps?.createdAt || 0).getTime();
    if (!cartId || !cartOwnerId || itemCount <= 0 || !Number.isFinite(updatedMs) || updatedMs > cartCutoffMs) {
      continue;
    }
    await upsertCartLifecycle({
      cartOwnerId,
      cartId,
      status: "abandoned",
      itemCount,
      extra: { reason: "stale_cart" },
    });
    cartsAbandoned += 1;
  }

  return { checkoutSessionsAbandoned, cartsAbandoned };
}
