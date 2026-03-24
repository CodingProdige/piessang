import type { Firestore as AdminFirestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

type QueryConstraint = {
  kind: "where";
  fieldPath: string;
  opStr: string;
  value: unknown;
};

function assertDb(db: AdminFirestore | null | undefined): AdminFirestore {
  const resolved = db ?? getAdminDb();
  if (!resolved) {
    throw new Error("Firebase admin service account missing");
  }
  return resolved;
}

export const db = getAdminDb();

export function collection(target: AdminFirestore | null | undefined, ...segments: string[]) {
  return assertDb(target).collection(segments.join("/"));
}

export function doc(target: AdminFirestore | null | undefined, ...segments: string[]) {
  return assertDb(target).doc(segments.join("/"));
}

export async function getDoc(ref: { get: () => Promise<{ exists: () => boolean; data: () => unknown }> }) {
  return ref.get();
}

export async function getDocs(ref: { get: () => Promise<{ empty: boolean; size: number; docs: Array<any> }> }) {
  return ref.get();
}

export function setDoc(ref: { set: (data: unknown, opts?: unknown) => Promise<void> }, data: unknown, opts?: unknown) {
  return ref.set(data, opts as never);
}

export function updateDoc(ref: { update: (data: unknown) => Promise<void> }, data: unknown) {
  return ref.update(data as never);
}

export function deleteDoc(ref: { delete: () => Promise<void> }) {
  return ref.delete();
}

export function where(fieldPath: string, opStr: string, value: unknown): QueryConstraint {
  return { kind: "where", fieldPath, opStr, value };
}

export function query(ref: any, ...constraints: QueryConstraint[]) {
  let current = ref;
  for (const constraint of constraints) {
    if (constraint.kind === "where") {
      current = current.where(constraint.fieldPath, constraint.opStr as never, constraint.value as never);
    }
  }
  return current;
}

export function serverTimestamp() {
  return new Date();
}

export async function runTransaction<T>(
  target: AdminFirestore | null | undefined,
  updateFunction: (tx: {
    get: (ref: any) => Promise<any>;
    set: (ref: any, data: any, opts?: any) => any;
    update: (ref: any, data: any) => any;
    delete: (ref: any) => any;
  }) => Promise<T>,
): Promise<T> {
  const resolved = assertDb(target);
  return resolved.runTransaction(async (tx) =>
    updateFunction({
      get: (ref) => tx.get(ref),
      set: (ref, data, opts) => tx.set(ref, data, opts),
      update: (ref, data) => tx.update(ref, data),
      delete: (ref) => tx.delete(ref),
    }),
  );
}

export function writeBatch(target: AdminFirestore | null | undefined) {
  return assertDb(target).batch();
}

export async function getCountFromServer(ref: any) {
  const snap = await ref.get();
  return {
    data: () => ({ count: snap.size ?? 0 }),
  };
}
