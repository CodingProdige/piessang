export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

/* ---------------- Helpers ---------------- */
const ok = (p = {}, s = 200) =>
  NextResponse.json({ ok: true, data: p }, { status: s });

const err = (s, title, message, extra = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status: s });

const now = () => new Date().toISOString();

/* ---------------- POST /add-delivery-location ---------------- */
export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const body = await req.json().catch(() => null);

    if (!body)
      return err(400, "Invalid Request", "Missing JSON body.");

    const { userId, location } = body;

    if (!userId)
      return err(400, "Missing userId", "A valid userId is required.");

    if (!location || typeof location !== "object")
      return err(400, "Missing Location", "A delivery location object is required.");

    if (!location.locationName || !location.streetAddress)
      return err(
        400,
        "Invalid Location",
        "locationName and streetAddress are required."
      );

    const userRef = db.collection("users").doc(userId);
    const snap = await userRef.get();

    if (!snap.exists)
      return err(404, "User Not Found", `User ${userId} does not exist.`);

    const userData = snap.data();
    const existing = Array.isArray(userData.deliveryLocations)
      ? userData.deliveryLocations
      : [];

    // Normalize default flag
    const newIsDefault = location.is_default === true;

    // If this is default, wipe other defaults
    const updatedExisting = newIsDefault
      ? existing.map(loc => ({ ...loc, is_default: false }))
      : existing;

    const newLocation = {
      id: crypto.randomUUID(),
      locationName: location.locationName || "",
      recipientName: location.recipientName || "",
      streetAddress: location.streetAddress || "",
      addressLine2: location.addressLine2 || "",
      city: location.city || "",
      suburb: location.suburb || "",
      stateProvinceRegion: location.stateProvinceRegion || "",
      postalCode: location.postalCode || "",
      country: location.country || "",
      phoneNumber: location.phoneNumber || "",
      latitude: typeof location.latitude === "number" ? location.latitude : null,
      longitude: typeof location.longitude === "number" ? location.longitude : null,
      instructions: location.instructions || location.deliveryInstructions || "",
      deliveryInstructions: location.deliveryInstructions || location.instructions || "",
      is_default: newIsDefault,
      createdAt: now(),
      updatedAt: now(),
    };

    const updatedLocations = [...updatedExisting, newLocation];

    await userRef.update({
      deliveryLocations: updatedLocations,
      updatedAt: now(),
    });

    return ok({
      userId,
      added: newLocation,
      deliveryLocations: updatedLocations
    });

  } catch (error) {
    console.error("ADD_DELIVERY_LOCATION_ERROR", error);
    return err(
      500,
      "Server Error",
      "Failed to add delivery location.",
      { details: error.message }
    );
  }
}
