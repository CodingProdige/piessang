import { createFirebaseServices } from "@/lib/firebase/shared";

const clientOptions = {
  apiKey: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_MEASUREMENT_ID,
};

export const piessangClientFirebase = createFirebaseServices({
  name: "piessang-client",
  options: clientOptions,
});

export const bevgoClientFirebase = piessangClientFirebase;
