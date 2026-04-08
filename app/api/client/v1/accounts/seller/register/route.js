export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { getAdminDb } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";
import { getSellerCatalogueCategory, getSellerCatalogueSubCategories } from "@/lib/seller/catalogue-categories";
import { canCreateSellerAccount } from "@/lib/seller/access";
import {
  SUPPORTED_SELLER_PAYOUT_COUNTRIES,
  SUPPORTED_PAYOUT_CURRENCIES,
} from "@/lib/seller/payout-config";
import { getDefaultPayoutCurrency } from "@/lib/marketplace/country-config";
import { ensureSellerCode, normalizeSellerDescription } from "@/lib/seller/seller-code";
import { cleanVendorName, generateVendorNameSuggestions, normalizeVendorName, toSellerSlug, trimVendorNameToLength, titleCaseVendorName } from "@/lib/seller/vendor-name";
import { jsonError, rateLimit, requireSessionUser } from "@/lib/api/security";

const ok = (p = {}, s = 200) => NextResponse.json({ ok: true, ...p }, { status: s });
const err = (s, t, m, e = {}) => jsonError(s, t, m, e);

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function sanitizeEmail(value) {
  return toStr(value).replace(/\s+/g, "").toLowerCase();
}

function sanitizeDigits(value) {
  return toStr(value).replace(/\D+/g, "");
}

function sanitizePhoneNumber(value, fallbackCountryCode = "27") {
  const raw = toStr(value);
  const digits = sanitizeDigits(raw);
  const countryCode = sanitizeDigits(fallbackCountryCode || "27");
  if (!digits) return "";
  if (raw.startsWith("+")) return `+${digits}`;
  if (countryCode && digits.startsWith(countryCode)) return `+${digits}`;
  return countryCode ? `+${countryCode}${digits}` : `+${digits}`;
}

function normalizeSlug(value) {
  return toStr(value).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function normalizeCountry(value) {
  return toStr(value).slice(0, 2).toUpperCase();
}

async function collectExistingVendorNames(excludeUid = "") {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Server Firestore access is not configured.");
  }

  const snap = await db.collection("users").get();
  const names = [];

  snap.forEach((docSnap) => {
    if (excludeUid && docSnap.id === excludeUid) return;
    const data = docSnap.data() || {};
    const currentName = cleanVendorName(data?.seller?.vendorName || data?.account?.accountName || "");
    if (currentName) names.push(currentName);
  });

  return names;
}

export async function POST(req) {
  try {
    const db = getAdminDb();
    if (!db) {
      return err(
        500,
        "Firebase Not Configured",
        "Server Firestore access is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or PIESSANG_FIREBASE_SERVICE_ACCOUNT_JSON.",
      );
    }

    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) {
      return err(401, "Unauthorized", "Sign in again to register a seller account.");
    }

    const limiter = rateLimit(`seller-register:${sessionUser.uid}`, 10, 60_000);
    if (!limiter.allowed) {
      return err(429, "Too Many Requests", "Please wait a moment before retrying seller registration.");
    }

    const body = await req.json().catch(() => ({}));
    const uid = sessionUser.uid;
    const data = body?.data && typeof body.data === "object" ? body.data : {};

    if (!uid) return err(400, "Missing UID", "uid is required.");

    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();

    if (!snap.exists) {
      return err(404, "User Not Found", "Cannot register seller details for a missing user.");
    }

    const current = snap.data() || {};
    const sellerAccessState = canCreateSellerAccount(current);
    if (!sellerAccessState.allowed) {
      return err(409, "Seller Access Restricted", sellerAccessState.reason, {
        code: sellerAccessState.code,
      });
    }
    const seller = data?.seller && typeof data.seller === "object" ? data.seller : data;
    const vendorName = trimVendorNameToLength(
      seller?.vendorName || seller?.accountName || current?.account?.accountName,
    );
    const vendorNameFormatted = titleCaseVendorName(vendorName);
    const contactEmail = sanitizeEmail(seller?.contactEmail || seller?.email || current?.email);
    const countryCode = sanitizeDigits(seller?.countryCode || seller?.dialCode || "27");
    const phoneNumber = sanitizePhoneNumber(
      seller?.phoneNumber || seller?.contactPhone || current?.account?.phoneNumber,
      countryCode || "27",
    );
    const baseLocation = toStr(seller?.baseLocation || seller?.location || seller?.city);
    const sellerCountry = normalizeCountry(seller?.sellerCountry || current?.seller?.sellerCountry || "ZA");
    const vendorDescription = normalizeSellerDescription(
      seller?.vendorDescription || seller?.description || current?.seller?.vendorDescription || current?.seller?.description,
    );
    const categorySlug = normalizeSlug(seller?.category);
    const subCategorySlug = normalizeSlug(seller?.subCategory || "");
    const category = categorySlug ? getSellerCatalogueCategory(categorySlug) : null;
    const subCategories = category ? getSellerCatalogueSubCategories(categorySlug) : [];
    const supportedCountry = SUPPORTED_SELLER_PAYOUT_COUNTRIES.find((entry) => entry.code === sellerCountry) || null;
    const payoutCurrency = SUPPORTED_PAYOUT_CURRENCIES.find(
      (entry) => entry.code === getDefaultPayoutCurrency(sellerCountry, "USD"),
    )?.code || "USD";
    const hasValidSubCategory =
      !subCategorySlug || !category || subCategories.some((item) => item.slug === subCategorySlug);

    if (!vendorNameFormatted) {
      return err(400, "Missing Vendor Name", "vendorName is required for seller registration.");
    }

    if (vendorNameFormatted.length > 30) {
      return err(400, "Vendor Name Too Long", "vendorName must be 30 characters or fewer.");
    }

    const existingNames = await collectExistingVendorNames(uid);
    const vendorNameExists = existingNames.some((name) => normalizeVendorName(name) === normalizeVendorName(vendorNameFormatted));
    if (vendorNameExists) {
      return err(
        409,
        "Vendor Name Already Taken",
        "Choose a unique vendor name before completing registration.",
        { suggestions: generateVendorNameSuggestions(vendorNameFormatted, existingNames) },
      );
    }

    if (!contactEmail || !contactEmail.includes("@")) {
      return err(400, "Missing Email", "A valid contact email is required for seller registration.");
    }

    if (!phoneNumber) {
      return err(400, "Missing Phone Number", "phoneNumber is required for seller registration.");
    }

    if (!supportedCountry) {
      return err(
        400,
        "Unsupported Seller Country",
        "Select a seller country supported by our automated payout system before continuing.",
      );
    }

    if (!baseLocation) {
      return err(400, "Missing Base Location", "Add your city or primary operating location for seller registration.");
    }

    if (!hasValidSubCategory) {
      return err(
        400,
        "Invalid Sub Category",
        "Select a valid sub category for the selected product category, or leave it blank.",
      );
    }

    const now = new Date().toISOString();
    const payoutProvider = "wise";
    const sellerCode = ensureSellerCode(current?.seller?.sellerCode, uid);
    const activeSellerCode = ensureSellerCode(current?.seller?.activeSellerCode, uid);
    const nextSeller = {
      registeredAt: current?.seller?.registeredAt || now,
      updatedAt: now,
      sellerSlug: current?.seller?.sellerSlug || toSellerSlug(vendorNameFormatted),
      activeSellerSlug: current?.seller?.activeSellerSlug || toSellerSlug(vendorNameFormatted),
      sellerCode,
      activeSellerCode,
      groupSellerCode: current?.seller?.groupSellerCode || sellerCode,
      vendorName: vendorNameFormatted,
      vendorDescription,
      contactEmail,
      countryCode: countryCode || "27",
      contactPhone: phoneNumber,
      sellerCountry,
      baseLocation,
      serviceArea: baseLocation,
      payoutProvider,
      payoutProfile: current?.seller?.payoutProfile || {
        provider: payoutProvider,
        payoutMethod: "other_country_bank",
        country: sellerCountry,
        bankCountry: sellerCountry,
        beneficiaryCountry: sellerCountry,
        currency: payoutCurrency,
        verificationStatus: "not_submitted",
        onboardingStatus: "created",
        payoutMethodEnabled: false,
        recipientEmail: contactEmail,
        wiseProfileId: "",
        wiseRecipientId: "",
        wiseRecipientStatus: "",
      },
      category: category?.slug || null,
      categoryTitle: category?.title || null,
      subCategory: subCategorySlug || null,
      sellerAccess: true,
      teamRole: current?.seller?.teamRole || "owner",
    };

    const nextAccount = {
      ...(current.account || {}),
      accountName: current?.account?.accountName || vendorNameFormatted,
      phoneNumber: current?.account?.phoneNumber || phoneNumber,
    };

    await ref.set({
      account: nextAccount,
      seller: nextSeller,
      system: {
        ...(current.system || {}),
        updatedAt: now,
      },
      timestamps: {
        ...(current?.timestamps && typeof current.timestamps === "object" ? current.timestamps : {}),
        updatedAt: now,
      },
    }, { merge: true });

    const emailOrigin = new URL(req.url).origin;
    const sellerEmailPayload = {
      type: "seller-registration-success",
      to: contactEmail,
      data: {
        vendorName: vendorNameFormatted,
        sellerCountry,
        baseLocation,
        categoryTitle: category?.title || "",
        subCategory: subCategorySlug ? (subCategories.find((item) => item.slug === subCategorySlug)?.title || subCategorySlug) : "",
      },
    };
    const internalEmailPayload = {
      type: "seller-registration-internal",
      to: "support@piessang.com",
      data: {
        uid,
        vendorName: vendorNameFormatted,
        contactEmail,
        countryCode: countryCode || "27",
        contactPhone: phoneNumber,
        sellerCountry,
        baseLocation,
        categoryTitle: category?.title || "",
        subCategory: subCategorySlug ? (subCategories.find((item) => item.slug === subCategorySlug)?.title || subCategorySlug) : "",
      },
    };

    if (process.env.SENDGRID_API_KEY?.startsWith("SG.")) {
      const sellerEmailRequest = fetch(`${emailOrigin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sellerEmailPayload),
      });
      const internalEmailRequest = fetch(`${emailOrigin}/api/client/v1/notifications/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(internalEmailPayload),
      });

      const [sellerEmailResponse, internalEmailResponse] = await Promise.all([
        sellerEmailRequest,
        internalEmailRequest,
      ]);

      if (!sellerEmailResponse.ok) {
        console.error("seller registration email failed:", await sellerEmailResponse.text().catch(() => ""));
      }

      if (!internalEmailResponse.ok) {
        console.error("seller registration internal email failed:", await internalEmailResponse.text().catch(() => ""));
      }
    }

    return ok({
      message: "Seller registration completed.",
      seller: nextSeller,
      account: nextAccount,
    });
  } catch (e) {
    console.error("seller/register failed:", e);
    return err(500, "Unexpected Error", "Unable to register seller account.", {
      details: String(e?.message || "").slice(0, 500),
    });
  }
}
