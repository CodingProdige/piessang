import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSessionUser } from "@/lib/api/security";
import { loadPlatformShippingSettings } from "@/lib/platform/shipping-settings";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { getCourierEstimate } from "@/lib/shipping/courier-estimates";
import { findCourierCatalogueEntry } from "@/lib/shipping/courier-estimates/courier-catalogue";
import { resolveShippingForSellerGroup } from "@/lib/shipping/resolve";

const ok = (payload: Record<string, unknown> = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status: number, title: string, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value).trim();
}

function toNum(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toLower(value: unknown) {
  return toStr(value).toLowerCase();
}

function getRequesterSellerIdentifiers(userData: any) {
  const seller = userData?.seller && typeof userData.seller === "object" ? userData.seller : {};
  return new Set(
    [
      seller?.sellerCode,
      seller?.activeSellerCode,
      seller?.groupSellerCode,
      seller?.sellerSlug,
      seller?.activeSellerSlug,
      seller?.groupSellerSlug,
    ]
      .map((item) => toLower(item))
      .filter(Boolean),
  );
}

export async function POST(req: NextRequest, context: { params: Promise<{ sellerId: string }> }) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to estimate seller shipping.");

    const db = getAdminDb();
    if (!db) return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    const isAdmin = isSystemAdminUser(requester);
    const requesterIdentifiers = getRequesterSellerIdentifiers(requester);

    const { sellerId } = await context.params;
    const owner = await findSellerOwnerByIdentifier(sellerId);
    if (!owner) return err(404, "Seller Not Found", "Could not find that seller.");

    const ownerSeller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
    const ownerIdentifiers = [ownerSeller?.sellerCode, ownerSeller?.sellerSlug].map((item) => toLower(item));
    if (!isAdmin && !ownerIdentifiers.some((item) => item && requesterIdentifiers.has(item))) {
      return err(403, "Forbidden", "You do not have access to estimate shipping for this seller.");
    }

    const body = await req.json().catch(() => ({}));
    const buyerDestination = body?.buyerDestination && typeof body.buyerDestination === "object" ? body.buyerDestination : {};
    const orderValue = Math.max(0, toNum(body?.orderValue, 0));
    const totalWeight = Math.max(0, toNum(body?.totalWeight, 0));
    const itemCount = Math.max(1, Math.trunc(toNum(body?.itemCount, 1)));
    const unitWeight = itemCount > 0 ? totalWeight / itemCount : totalWeight;
    const courierCode = toStr(body?.courierCode || "").toLowerCase();
    const parcel = {
      weightKg: totalWeight,
      lengthCm: body?.parcel && typeof body.parcel === "object" ? toNum(body.parcel.lengthCm, 0) || null : null,
      widthCm: body?.parcel && typeof body.parcel === "object" ? toNum(body.parcel.widthCm, 0) || null : null,
      heightCm: body?.parcel && typeof body.parcel === "object" ? toNum(body.parcel.heightCm, 0) || null : null,
    };

    const items = [
      {
        productId: "estimate_product",
        variantId: "estimate_variant",
        quantity: itemCount,
        lineSubtotalIncl: orderValue,
        weightKg: unitWeight,
      },
    ];

    const platformShipping = await loadPlatformShippingSettings();
    const resolved = await resolveShippingForSellerGroup({
      seller: ownerSeller,
      items,
      buyerDestination,
      piessangFulfillmentShipping: platformShipping?.piessangFulfillmentShipping || null,
      platformShippingMarkup: platformShipping?.platformShippingMarkup || null,
    });

    if (!resolved.ok) {
      return err(400, "Shipping Estimate Failed", resolved.message || "Shipping could not be estimated.", {
        code: resolved.code,
        debug: resolved.debug,
      });
    }

    const responsePayload: Record<string, unknown> = {
      estimate: {
        matchedSource: resolved.matchedSource,
        matchedRuleId: resolved.matchedRuleId,
        matchedRuleName: resolved.matchedRuleName,
        matchType: resolved.matchType,
        pricingMode: resolved.pricingMode,
        batchingMode: resolved.batchingMode,
        baseShippingFee: resolved.baseShippingFee,
        customerShippingCharge: resolved.finalShippingFee,
        estimatedDeliveryDays: resolved.estimatedDeliveryDays,
        debug: resolved.debug,
      },
    };

    if (courierCode) {
      const catalogueEntry = findCourierCatalogueEntry(courierCode);
      const courierEstimate = await getCourierEstimate({
        courierCode,
        sellerOrigin: ownerSeller?.shippingSettings?.shipsFrom || {
          countryCode: ownerSeller?.shippingSettings?.shipsFrom?.countryCode || "ZA",
          province: ownerSeller?.shippingSettings?.shipsFrom?.province || "",
          city: ownerSeller?.shippingSettings?.shipsFrom?.city || "",
          postalCode: ownerSeller?.shippingSettings?.shipsFrom?.postalCode || "",
        },
        destination: {
          countryCode: toStr(buyerDestination?.countryCode || "ZA").toUpperCase() || "ZA",
          province: toStr(buyerDestination?.province || ""),
          postalCode: toStr(buyerDestination?.postalCode || ""),
        },
        parcel,
        orderValue,
      });

      responsePayload.courierEstimate = courierEstimate.ok
        ? {
            ok: true,
            courierCode: courierEstimate.courierCode,
            courierName: courierEstimate.courierName,
            estimatedFee: courierEstimate.estimatedFee,
            currency: courierEstimate.currency,
            minDays: courierEstimate.minDays,
            maxDays: courierEstimate.maxDays,
            serviceName: courierEstimate.serviceName,
            warnings: courierEstimate.warnings,
          }
        : {
            ok: false,
            courierCode: courierEstimate.courierCode,
            courierName: courierEstimate.courierName || catalogueEntry?.courierName || "",
            errorCode: courierEstimate.errorCode,
            message: courierEstimate.message,
          };
    }

    return ok(responsePayload);
  } catch (error) {
    return err(500, "Shipping Estimate Failed", error instanceof Error ? error.message : "Unexpected error.");
  }
}
