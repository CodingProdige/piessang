import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedApp: App | null = null;
let cachedDatabaseId: string | null = null;

function normalizePrivateKey(value: string | undefined): string {
  return String(value ?? "").replace(/\\n/g, "\n").trim();
}

function getRequiredAdminDatabaseId() {
  if (cachedDatabaseId) return cachedDatabaseId;
  const databaseId = String(process.env.PIESSANG_FIREBASE_DATABASE_ID || "").trim();
  if (!databaseId) {
    throw new Error("PIESSANG_FIREBASE_DATABASE_ID is required.");
  }
  cachedDatabaseId = databaseId;
  return cachedDatabaseId;
}

export function getAdminApp(): App | null {
  if (cachedApp) return cachedApp;

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

  if (!projectId || !clientEmail || !privateKey) {
    console.error("Firebase admin env missing:", {
      hasProjectId: Boolean(projectId),
      hasClientEmail: Boolean(clientEmail),
      hasPrivateKey: Boolean(privateKey),
    });
    return null;
  }

  try {
    const existingApp = getApps().find((app) => app.name === "piessang-admin") ?? null;
    cachedApp =
      existingApp ??
      initializeApp(
        {
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        },
        "piessang-admin",
      );
    return cachedApp;
  } catch (error) {
    console.error("Firebase admin init failed:", error);
    return null;
  }
}

export function getAdminDb(): Firestore | null {
  const app = getAdminApp();
  if (!app) return null;
  try {
    return getFirestore(app, getRequiredAdminDatabaseId());
  } catch (error) {
    console.error("Firebase admin database config missing:", error);
    return null;
  }
}

export async function upsertAuthUserDocument(user: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}) {
  const db = getAdminDb();
  if (!db) {
    console.warn("Firebase admin not initialized; skipping user sync.");
    return false;
  }

  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();
  const current = snap.exists ? (snap.data() || {}) : {};
  const now = new Date();

  await ref.set(
    {
      uid: user.uid,
      email: user.email ?? current.email ?? "",
      created_time: snap.exists ? current.created_time ?? now : now,
      account: {
        ...(current.account || {}),
        accountName:
          current?.account?.accountName ||
          user.displayName ||
          user.email?.split("@")[0] ||
          "Piessang user",
        accountActive: current?.account?.accountActive ?? false,
        onboardingComplete: current?.account?.onboardingComplete ?? false,
        accountType: current?.account?.accountType ?? null,
      },
      preferences: {
        favoriteProducts: current?.preferences?.favoriteProducts || [],
        emailNotifications:
          typeof current?.preferences?.emailNotifications === "boolean"
            ? current.preferences.emailNotifications
            : true,
        smsNotifications:
          typeof current?.preferences?.smsNotifications === "boolean"
            ? current.preferences.smsNotifications
            : true,
      },
      media: {
        ...(current.media || {}),
        photoUrl: user.photoURL ?? current?.media?.photoUrl ?? "",
        blurHash: current?.media?.blurHash ?? "",
      },
      timestamps: {
        ...(current.timestamps || {}),
        updatedAt: now,
      },
    },
    { merge: true },
  );

  return true;
}
