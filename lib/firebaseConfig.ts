import { clientApp, clientAuth, clientDb, clientStorage } from "@/lib/firebase";

export const db = clientDb;
export const app = clientApp;
export const auth = clientAuth;
export const storage = clientStorage;

export { clientDb, clientApp, clientAuth, clientStorage };
