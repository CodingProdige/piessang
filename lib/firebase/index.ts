import { piessangClientFirebase } from "@/lib/firebase/client";
import { bevgoPricingFirebase } from "@/lib/firebase/pricing";

export { piessangClientFirebase, piessangClientFirebase as bevgoClientFirebase };
export { bevgoPricingFirebase };
export { createFirebaseServices } from "@/lib/firebase/shared";

export const clientApp = piessangClientFirebase.app;
export const clientDb = piessangClientFirebase.firestore;
export const clientAuth = piessangClientFirebase.auth;
export const clientStorage = piessangClientFirebase.storage;

export const app = piessangClientFirebase.app;
export const db = piessangClientFirebase.firestore;
export const auth = piessangClientFirebase.auth;
export const storage = piessangClientFirebase.storage;
