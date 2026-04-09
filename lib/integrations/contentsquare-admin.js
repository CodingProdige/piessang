import { getAdminDb } from "@/lib/firebase/admin";

const REPLAY_COLLECTION = "contentsquare_replays";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeReplayPayload(input = {}) {
  const replayUrl = toStr(input?.replayUrl || input?.url);
  const productSlug = toStr(input?.productSlug);
  const sellerSlug = toStr(input?.sellerSlug);
  const pagePath = toStr(input?.pagePath);
  const issueType = toStr(input?.issueType);
  const title = toStr(input?.title);
  const notes = toStr(input?.notes);
  const tags = Array.from(
    new Set(
      (Array.isArray(input?.tags) ? input.tags : String(input?.tags || "").split(","))
        .map((value) => toStr(value).toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 20);

  return {
    replayUrl,
    productSlug: productSlug || null,
    sellerSlug: sellerSlug || null,
    pagePath: pagePath || null,
    issueType: issueType || null,
    title: title || null,
    notes: notes || null,
    tags,
  };
}

export async function listContentsquareReplays(limit = 50) {
  const db = getAdminDb();
  if (!db) return [];

  const snap = await db
    .collection(REPLAY_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(Math.max(1, Math.min(Number(limit) || 50, 200)))
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
}

export async function createContentsquareReplay(input = {}, actorUid = "") {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const payload = normalizeReplayPayload(input);
  if (!payload.replayUrl) {
    throw new Error("Replay URL is required.");
  }
  if (!/^https:\/\/.+/i.test(payload.replayUrl)) {
    throw new Error("Replay URL must start with https://");
  }

  const createdAt = new Date().toISOString();
  const ref = db.collection(REPLAY_COLLECTION).doc();
  await ref.set({
    ...payload,
    actorUid: toStr(actorUid) || null,
    createdAt,
    updatedAt: createdAt,
  });

  return { id: ref.id, ...payload, actorUid: toStr(actorUid) || null, createdAt, updatedAt: createdAt };
}

export async function deleteContentsquareReplay(id = "") {
  const db = getAdminDb();
  if (!db) throw new Error("Server Firestore access is not configured.");

  const replayId = toStr(id);
  if (!replayId) {
    throw new Error("Replay entry ID is required.");
  }

  await db.collection(REPLAY_COLLECTION).doc(replayId).delete();
  return { id: replayId, deleted: true };
}
