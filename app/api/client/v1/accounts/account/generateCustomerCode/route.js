export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";

const ok = (p = {}, s = 200) =>
  NextResponse.json({ ok: true, ...p }, { status: s });

const err = (s, t, m, e = {}) =>
  NextResponse.json({ ok: false, title: t, message: m, ...e }, { status: s });

// Extract initials from multi-word names
function getInitials(name) {
  if (!name) return "";

  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")  // remove non-letters but keep spaces
    .split(/\s+/)              // split into words
    .map(word => word.charAt(0)) // take first letter of each word
    .join("")                  // combine initials
    .substring(0, 5);          // cap at 5 letters (e.g., LVDL, BD, TJF)
}

// Generate a 4-digit suffix
function generateNumber() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const body = await req.json();
    const { name } = body;

    if (!name) {
      return err(400, "Missing Name", "Parameter 'name' is required.");
    }

    const initials = getInitials(name);

    if (!initials) {
      return err(400, "Invalid Name", "Name must contain at least one valid alphabetic character.");
    }

    // Pull all existing codes into memory (no indexing)
    const snapshot = await db.collection("users").get();

    const existingCodes = new Set();
    snapshot.forEach((doc) => {
      const cc = doc.data().account?.customerCode;
      if (cc) existingCodes.add(cc);
    });

    // Generate a unique code
    let attempts = 0;
    let customerCode = "";

    do {
      customerCode = `${initials}${generateNumber()}`;
      attempts++;

      if (attempts > 25) {
        return err(500, "Generation Failed", "Could not generate a unique customer code.");
      }
    } while (existingCodes.has(customerCode));

    return ok({ customerCode });

  } catch (e) {
    return err(500, "CustomerCodeError", e.message);
  }
}
