import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireSessionUser } from "@/lib/api/security";
import { getAdminApp, getAdminDb } from "@/lib/firebase/admin";
import { isSystemAdminUser } from "@/lib/seller/settlement-access";
import { getStorage } from "firebase-admin/storage";
import {
  getLandingPageState,
  listLandingPageVersions,
  publishLandingPageDraft,
  restoreLandingPageVersion,
  saveLandingPageDraft,
} from "@/lib/cms/landing-page";
import type { LandingFixedHero, LandingSection, LandingPageSeo } from "@/lib/cms/landing-page-schema";

export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

const ok = (data: any = {}, status = 200) => NextResponse.json({ ok: true, data }, { status });
const err = (status: number, title: string, message: string) =>
  NextResponse.json({ ok: false, title, message }, { status });

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toPlainJsonValue(value: any): any {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((entry) => toPlainJsonValue(entry));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const asDate = value.toDate();
      return asDate instanceof Date ? asDate.toISOString() : toStr(asDate);
    }
    const plain: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
      plain[key] = toPlainJsonValue(entry);
    }
    return plain;
  }
  return value;
}

function collectSectionAssets(sections: LandingSection[] = []) {
  const urls = new Set<string>();
  for (const section of sections) {
    const sectionImage = toStr(section?.props?.imageUrl);
    if (sectionImage) urls.add(sectionImage);
    if (section?.type === "promo_tiles") {
      for (const tile of Array.isArray(section?.props?.tiles) ? section.props.tiles : []) {
        const tileImage = toStr(tile?.imageUrl);
        if (tileImage) urls.add(tileImage);
      }
    }
  }
  return Array.from(urls).map((url, index) => ({
    id: `asset-${index}`,
    title: `Uploaded asset ${index + 1}`,
    slug: "",
    imageUrl: url,
  }));
}

async function uploadLandingAsset(file: File, folder = "general") {
  const app = getAdminApp();
  if (!app) throw new Error("Firebase Admin is not configured.");

  const storage = getStorage(app);
  const bucketName = process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_STORAGE_BUCKET;
  const bucket = bucketName ? storage.bucket(bucketName) : storage.bucket();
  const safeName = toStr(file.name, "asset")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = `cms/landing-page/${folder}/${Date.now()}-${safeName}`;
  const fileRef = bucket.file(filePath);
  const token = randomUUID();
  const buffer = Buffer.from(await file.arrayBuffer());

  await fileRef.save(buffer, {
    contentType: file.type || "image/jpeg",
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  const encodedPath = encodeURIComponent(filePath);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
  return { path: filePath, url };
}

export async function GET() {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to manage the landing page.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    if (!isSystemAdminUser(requester)) return err(403, "Access Denied", "System admin access required.");

    const [page, versions, productsSnap, categoriesSnap] = await Promise.all([
      getLandingPageState(),
      listLandingPageVersions(),
      db.collection("products_v2").where("placement.isActive", "==", true).limit(80).get(),
      db.collection("categories").get(),
    ]);

    const products = productsSnap.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      return {
        id: docSnap.id,
        title: toStr(data?.product?.title, "Product"),
        slug: toStr(data?.product?.titleSlug),
        imageUrl: toStr(data?.media?.images?.[0]?.imageUrl),
      };
    });
    const previewProducts = productsSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      data: toPlainJsonValue(docSnap.data() || {}),
    }));

    const categories = categoriesSnap.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      return {
        id: docSnap.id,
        slug: toStr(data?.category?.slug || docSnap.id),
        title: toStr(data?.category?.title, "Category"),
      };
    });

    const sectionAssets = collectSectionAssets([...(page?.draftSections || []), ...(page?.publishedSections || [])]);
    const mergedProducts = [...products];
    for (const asset of sectionAssets) {
      if (!mergedProducts.some((product) => toStr(product.imageUrl) === toStr(asset.imageUrl))) {
        mergedProducts.push(asset);
      }
    }

    return ok({ page, versions, options: { products: mergedProducts, previewProducts, categories } });
  } catch (error) {
    return err(500, "Landing Page Failed", error instanceof Error ? error.message : "Unable to load the landing page builder.");
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser();
    if (!sessionUser?.uid) return err(401, "Unauthorized", "Sign in again to manage the landing page.");

    const db = getAdminDb();
    if (!db) return err(500, "Config Error", "Firebase Admin is not configured.");

    const requesterSnap = await db.collection("users").doc(sessionUser.uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() || {} : {};
    if (!isSystemAdminUser(requester)) return err(403, "Access Denied", "System admin access required.");

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const action = toStr(formData.get("action"));
      if (action !== "upload-asset") return err(400, "Invalid Action", "Use upload-asset for multipart uploads.");
      const file = formData.get("file");
      const folder = toStr(formData.get("folder"), "general");
      const blurHashUrl = toStr(formData.get("blurHashUrl"));
      if (!(file instanceof File)) return err(400, "File Required", "Choose an image to upload.");
      const uploaded = await uploadLandingAsset(file, folder);
      return ok({ uploaded: { ...uploaded, blurHashUrl } });
    }

    const body = await request.json().catch(() => ({}));
    const action = toStr(body?.action);

    if (action === "save-draft") {
      const sections = Array.isArray(body?.sections) ? (body.sections as LandingSection[]) : [];
      const seo = (body?.seo || {}) as LandingPageSeo;
      const fixedHero = (body?.fixedHero || {}) as LandingFixedHero;
      const note = toStr(body?.note);
      const result = await saveLandingPageDraft({ sections, seo, fixedHero, note });
      return ok({ saved: result });
    }

    if (action === "publish") {
      const note = toStr(body?.note);
      const result = await publishLandingPageDraft(note);
      return ok({ published: result });
    }

    if (action === "restore-version") {
      const versionId = toStr(body?.versionId);
      if (!versionId) return err(400, "Version Required", "Choose a version to restore.");
      const result = await restoreLandingPageVersion(versionId);
      return ok({ restored: result });
    }

    return err(400, "Invalid Action", "Use save-draft, publish, or restore-version.");
  } catch (error) {
    return err(500, "Landing Page Update Failed", error instanceof Error ? error.message : "Unable to update the landing page.");
  }
}
