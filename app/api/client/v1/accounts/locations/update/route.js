export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

const ok = (p={}, s=200) => NextResponse.json({ ok:true, data:p }, { status:s });
const err = (s,t,m,x={}) => NextResponse.json({ ok:false, title:t, message:m, ...x }, { status:s });

const now = () => new Date().toISOString();

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const body = await req.json().catch(() => null);
    if (!body) return err(400, "Invalid JSON", "Missing request body.");

    const { userId, locationId, updates } = body;

    if (!userId || !locationId)
      return err(400, "Missing Fields", "userId and locationId are required.");

    if (!updates || typeof updates !== "object")
      return err(400, "Missing Updates", "Specify updates object.");

    const ref = db.collection("users").doc(userId);
    const snap = await ref.get();
    if (!snap.exists) return err(404, "User Not Found", `No user ${userId}`);

    const data = snap.data();
    const locations = Array.isArray(data.deliveryLocations) ? data.deliveryLocations : [];

    const idx = locations.findIndex(l => l.id === locationId);
    if (idx === -1) return err(404, "Location Not Found", `Location ${locationId} does not exist.`);

    // Handle is_default rule
    let updatedLocations = locations.map((loc) => {
      if (loc.id === locationId) {
        return {
          ...loc,
          ...updates,
          recipientName: updates.recipientName ?? loc.recipientName ?? "",
          suburb: updates.suburb ?? loc.suburb ?? "",
          phoneNumber: updates.phoneNumber ?? loc.phoneNumber ?? "",
          instructions: updates.instructions ?? loc.instructions ?? loc.deliveryInstructions ?? "",
          deliveryInstructions: updates.deliveryInstructions ?? updates.instructions ?? loc.deliveryInstructions ?? loc.instructions ?? "",
          latitude: typeof updates.latitude === "number" ? updates.latitude : loc.latitude ?? null,
          longitude: typeof updates.longitude === "number" ? updates.longitude : loc.longitude ?? null,
          updatedAt: now(),
        };
      }
      if (updates.is_default === true) {
        return { ...loc, is_default: false };
      }
      return loc;
    });

    await ref.update({
      deliveryLocations: updatedLocations,
      updatedAt: now(),
    });

    return ok({
      userId,
      locationId,
      updated: updatedLocations[idx],
      deliveryLocations: updatedLocations,
    });

  } catch (e) {
    console.error("UPDATE_LOCATION_ERROR:", e);
    return err(500, "Server Error", "Could not update delivery location.", { details: e.message });
  }
}
