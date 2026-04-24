import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { buildShippingSettingsFromLegacySeller, validateShippingSettings } from "@/lib/shipping/settings";
import { validateShippingSettingsGoogleRegions } from "@/lib/server/google-admin-regions";

const ok = (payload: Record<string, unknown> = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status: number, title: string, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value).trim();
}

async function resolveSeller(sellerId: string) {
  const owner = await findSellerOwnerByIdentifier(sellerId);
  if (owner) return owner;
  return null;
}

export async function GET(_: NextRequest, context: { params: Promise<{ sellerId: string }> }) {
  const { sellerId } = await context.params;
  const owner = await resolveSeller(sellerId);
  if (!owner) return err(404, "Seller Not Found", "Could not find that seller.");
  const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
  const shippingSettings = buildShippingSettingsFromLegacySeller(seller);
  return ok({
    sellerId: toStr(seller?.sellerSlug || seller?.sellerCode || sellerId),
    shippingSettings,
  });
}

export async function PUT(req: NextRequest, context: { params: Promise<{ sellerId: string }> }) {
  const { sellerId } = await context.params;
  const owner = await resolveSeller(sellerId);
  if (!owner) return err(404, "Seller Not Found", "Could not find that seller.");
  const body = await req.json().catch(() => ({}));
  const validation = validateShippingSettings(body?.shippingSettings || body);
  if (!validation.valid) {
    return err(400, "Invalid Shipping Settings", "Seller shipping settings are invalid.", {
      issues: validation.issues,
    });
  }
  const googleRegionIssues = await validateShippingSettingsGoogleRegions(validation.settings);
  if (googleRegionIssues.length) {
    return err(400, "Invalid Shipping Settings", "Seller shipping settings are invalid.", {
      issues: googleRegionIssues,
    });
  }
  const db = getAdminDb();
  if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
  await db.collection("users").doc(owner.id).set(
    {
      seller: {
        ...(owner.data?.seller || {}),
        shippingSettings: validation.settings,
      },
      timestamps: {
        ...(owner.data?.timestamps || {}),
        updatedAt: new Date().toISOString(),
      },
    },
    { merge: true },
  );
  return ok({
    sellerId: toStr(sellerId),
    shippingSettings: validation.settings,
  });
}
