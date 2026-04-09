import { getAdminDb } from "@/lib/firebase/admin";
import {
  getDefaultLandingFixedHero,
  getDefaultLandingPageState,
  LANDING_PAGE_SLUG,
  type LandingFixedHero,
  type LandingPageSeo,
  type LandingPageState,
  type LandingSection,
} from "@/lib/cms/landing-page-schema";

const CMS_PAGES_COLLECTION = "cms_pages_v1";
const CMS_PAGE_VERSIONS_COLLECTION = "cms_page_versions_v1";

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

function sanitizeSection(section: any): LandingSection | null {
  const id = toStr(section?.id);
  const type = toStr(section?.type);
  const props =
    section?.props && typeof section.props === "object"
      ? toPlainJsonValue(section.props)
      : {};
  if (!id || !type) return null;
  return { id, type: type as any, props };
}

function sanitizeSections(value: unknown): LandingSection[] {
  return (Array.isArray(value) ? value : []).map(sanitizeSection).filter(Boolean) as LandingSection[];
}

function sanitizeSeo(value: any): LandingPageSeo {
  return {
    title: toStr(value?.title, getDefaultLandingPageState().seo.title).slice(0, 120),
    description: toStr(value?.description, getDefaultLandingPageState().seo.description).slice(0, 320),
  };
}

function sanitizeFixedHero(value: any): LandingFixedHero {
  const fallback = getDefaultLandingFixedHero();
  return {
    locked: value?.locked === undefined ? fallback.locked : Boolean(value?.locked),
    rotationSeconds: Math.max(2, Math.min(30, Number(value?.rotationSeconds || fallback.rotationSeconds || 4))),
    images: (Array.isArray(value?.images) ? value.images : fallback.images)
      .map((entry: unknown) => {
        if (typeof entry === "string") {
          const imageUrl = toStr(entry);
          return imageUrl ? { imageUrl, href: "", blurHashUrl: "" } : null;
        }
        if (entry && typeof entry === "object") {
          const imageUrl = toStr((entry as any)?.imageUrl);
          const href = toStr((entry as any)?.href);
          const blurHashUrl = toStr((entry as any)?.blurHashUrl);
          return imageUrl ? { imageUrl, href, blurHashUrl } : null;
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, 12),
  };
}

function normalizeState(data: any): LandingPageState {
  const fallback = getDefaultLandingPageState();
  const publishedSections = sanitizeSections(data?.publishedSections);
  const draftSections = sanitizeSections(data?.draftSections);
  return {
    slug: LANDING_PAGE_SLUG,
    title: toStr(data?.title, fallback.title),
    seo: sanitizeSeo(data?.seo),
    fixedHero: sanitizeFixedHero(data?.fixedHero),
    publishedSections: publishedSections.length ? publishedSections : fallback.publishedSections,
    draftSections: draftSections.length ? draftSections : publishedSections.length ? publishedSections : fallback.draftSections,
    publishedVersionId: toStr(data?.publishedVersionId) || null,
    draftVersionId: toStr(data?.draftVersionId) || null,
    draftUpdatedAt: toStr(data?.draftUpdatedAt) || null,
    publishedAt: toStr(data?.publishedAt) || null,
  };
}

export async function getLandingPageState(): Promise<LandingPageState> {
  const db = getAdminDb();
  if (!db) return getDefaultLandingPageState();
  const snap = await db.collection(CMS_PAGES_COLLECTION).doc(LANDING_PAGE_SLUG).get();
  if (!snap.exists) return getDefaultLandingPageState();
  return normalizeState(snap.data() || {});
}

export async function getPublishedLandingPage(): Promise<LandingPageState> {
  return getLandingPageState();
}

export async function listLandingPageVersions(limit = 12) {
  const db = getAdminDb();
  if (!db) return [];
  const snap = await db
    .collection(CMS_PAGE_VERSIONS_COLLECTION)
    .where("pageSlug", "==", LANDING_PAGE_SLUG)
    .orderBy("savedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
}

export async function saveLandingPageDraft({
  sections,
  seo,
  fixedHero,
  note,
}: {
  sections: LandingSection[];
  seo: LandingPageSeo;
  fixedHero: LandingFixedHero;
  note?: string;
}) {
  const db = getAdminDb();
  if (!db) throw new Error("Firebase Admin is not configured.");
  const pageRef = db.collection(CMS_PAGES_COLLECTION).doc(LANDING_PAGE_SLUG);
  const versionRef = db.collection(CMS_PAGE_VERSIONS_COLLECTION).doc();
  const savedAt = new Date().toISOString();
  const normalizedSections = sanitizeSections(sections);
  const normalizedSeo = sanitizeSeo(seo);
  const normalizedFixedHero = sanitizeFixedHero(fixedHero);
  const normalizedNote = toStr(note).slice(0, 160);
  await pageRef.set(
    {
      slug: LANDING_PAGE_SLUG,
      title: "Piessang homepage",
      seo: normalizedSeo,
      fixedHero: normalizedFixedHero,
      draftSections: normalizedSections,
      draftVersionId: versionRef.id,
      draftUpdatedAt: savedAt,
      draftNote: normalizedNote || null,
    },
    { merge: true },
  );
  await versionRef.set({
    pageSlug: LANDING_PAGE_SLUG,
    status: "draft",
    note: normalizedNote || null,
    seo: normalizedSeo,
    fixedHero: normalizedFixedHero,
    sections: normalizedSections,
    savedAt,
  });
  return { id: versionRef.id, savedAt };
}

export async function publishLandingPageDraft(note?: string) {
  const db = getAdminDb();
  if (!db) throw new Error("Firebase Admin is not configured.");
  const current = await getLandingPageState();
  const publishedAt = new Date().toISOString();
  const versionRef = db.collection(CMS_PAGE_VERSIONS_COLLECTION).doc();
  const normalizedNote = toStr(note).slice(0, 160);
  await db.collection(CMS_PAGES_COLLECTION).doc(LANDING_PAGE_SLUG).set(
    {
      slug: LANDING_PAGE_SLUG,
      title: current.title,
      seo: current.seo,
      fixedHero: current.fixedHero,
      publishedSections: current.draftSections,
      publishedVersionId: versionRef.id,
      publishedAt,
      publishedNote: normalizedNote || null,
    },
    { merge: true },
  );
  await versionRef.set({
    pageSlug: LANDING_PAGE_SLUG,
    status: "published",
    note: normalizedNote || null,
    seo: current.seo,
    fixedHero: current.fixedHero,
    sections: current.draftSections,
    savedAt: publishedAt,
    publishedAt,
  });
  return { id: versionRef.id, publishedAt };
}

export async function restoreLandingPageVersion(versionId: string) {
  const db = getAdminDb();
  if (!db) throw new Error("Firebase Admin is not configured.");
  const normalizedId = toStr(versionId);
  if (!normalizedId) throw new Error("Version id is required.");

  const versionSnap = await db.collection(CMS_PAGE_VERSIONS_COLLECTION).doc(normalizedId).get();
  if (!versionSnap.exists) throw new Error("Version not found.");

  const version = versionSnap.data() || {};
  const savedAt = new Date().toISOString();
  const sections = sanitizeSections(version?.sections);
  const seo = sanitizeSeo(version?.seo);
  const fixedHero = sanitizeFixedHero(version?.fixedHero);

  await db.collection(CMS_PAGES_COLLECTION).doc(LANDING_PAGE_SLUG).set(
    {
      slug: LANDING_PAGE_SLUG,
      title: "Piessang homepage",
      seo,
      fixedHero,
      draftSections: sections,
      draftVersionId: normalizedId,
      draftUpdatedAt: savedAt,
    },
    { merge: true },
  );

  return { id: normalizedId, restoredAt: savedAt };
}
