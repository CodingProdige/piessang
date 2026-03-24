import { piessangClientFirebase } from "@/lib/firebase/client";

export { piessangClientFirebase, piessangClientFirebase as bevgoClientFirebase, piessangClientFirebase as clientFirebase };

export const clientApp = piessangClientFirebase.app;
export const clientDb = piessangClientFirebase.firestore;
export const clientAuth = piessangClientFirebase.auth;
export const clientStorage = piessangClientFirebase.storage;
