import { getAdminDb } from "@/lib/firebase/admin";

const HEARTBEAT_TTL_MS = Math.max(30, Number(process.env.PRODUCT_VIEWER_TTL_SECONDS || 120)) * 1000;
const ANALYTICS_TIMEZONE = "Africa/Johannesburg";

const nowIso = () => new Date().toISOString();

function parseDateMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function recordProductViewerHeartbeat(productId, sessionId) {
  const db = getAdminDb();
  if (!db || !productId || !sessionId) return { count: 0 };

  const ref = db.collection("analytics_live_product_views").doc(String(productId).trim());
  const now = nowIso();
  const nowMs = Date.now();

  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const dailyRef = db.collection("analytics_daily_visitors").doc(todayKey);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() || {} : {};
    const dailySnap = await tx.get(dailyRef);
    const dailyCurrent = dailySnap.exists ? dailySnap.data() || {} : {};
    const rawSessions = current?.sessions && typeof current.sessions === "object" ? current.sessions : {};
    const dailySessions =
      dailyCurrent?.sessions && typeof dailyCurrent.sessions === "object" ? dailyCurrent.sessions : {};
    const nextSessions = {};

    for (const [key, value] of Object.entries(rawSessions)) {
      const seenAtMs = parseDateMillis(value);
      if (seenAtMs && nowMs - seenAtMs <= HEARTBEAT_TTL_MS) {
        nextSessions[key] = value;
      }
    }

    nextSessions[String(sessionId).trim()] = now;
    const count = Object.keys(nextSessions).length;

    tx.set(
      ref,
      {
        productId: String(productId).trim(),
        sessions: nextSessions,
        viewerCount: count,
        updatedAt: now,
      },
      { merge: true },
    );

    tx.set(
      dailyRef,
      {
        date: todayKey,
        sessions: {
          ...dailySessions,
          [String(sessionId).trim()]: now,
        },
        totalVisitors: Object.keys({
          ...dailySessions,
          [String(sessionId).trim()]: now,
        }).length,
        updatedAt: now,
      },
      { merge: true },
    );

    return { count };
  });

  return result;
}
