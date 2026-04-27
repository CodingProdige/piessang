export async function fetchEasyshipShipmentSnapshot() {
  throw new Error("Easyship shipment sync has been deprecated.");
}

export async function syncEasyshipShipmentById() {
  return { ok: false, skipped: true, reason: "deprecated" };
}
