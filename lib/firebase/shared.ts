import { FirebaseApp, FirebaseOptions, getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

type FirebaseConfigInput = {
  name: string;
  options: FirebaseOptions;
};

function getRequiredClientDatabaseId() {
  const databaseId = String(process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_DATABASE_ID || "").trim();
  if (!databaseId) {
    throw new Error("NEXT_PUBLIC_PIESSANG_FIREBASE_DATABASE_ID is required.");
  }
  return databaseId;
}

export function createFirebaseServices({ name, options }: FirebaseConfigInput) {
  const app =
    getApps().find((existingApp) => existingApp.name === name) ??
    initializeApp(options, name);
  const databaseId = getRequiredClientDatabaseId();
  let firestore;

  try {
    firestore = initializeFirestore(app, {}, databaseId);
  } catch {
    firestore = getFirestore(app, databaseId);
  }

  return {
    app,
    auth: getAuth(app),
    firestore,
    storage: getStorage(app),
  };
}

export type FirebaseServices = ReturnType<typeof createFirebaseServices>;
export type { FirebaseApp };
