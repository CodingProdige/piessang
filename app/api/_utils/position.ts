import { collection, getDocs, type CollectionReference, type QueryConstraint, query } from "firebase/firestore";

export async function nextPosition(
  col: CollectionReference,
  constraints: QueryConstraint[] = [],
) {
  const snap = await getDocs(query(collection(col.firestore, col.path), ...constraints));
  let max = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    const position = Number(
      (data?.placement as Record<string, unknown> | undefined)?.position ??
        0,
    );
    if (Number.isFinite(position)) {
      max = Math.max(max, position);
    }
  }

  return max + 1;
}
