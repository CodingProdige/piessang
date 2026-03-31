import { getAdminDb } from "@/lib/firebase/admin";

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toBool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function slugify(value) {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function newslettersCollection(db = getAdminDb()) {
  return db.collection("newsletter_catalog_v1");
}

export function normalizeNewsletterRecord(docId, raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const newsletter = data.newsletter && typeof data.newsletter === "object" ? data.newsletter : {};
  const metrics = data.metrics && typeof data.metrics === "object" ? data.metrics : {};

  return {
    docId,
    newsletter: {
      title: toStr(newsletter.title),
      slug: toStr(newsletter.slug || slugify(newsletter.title || docId)),
      description: toStr(newsletter.description),
      audienceLabel: toStr(newsletter.audienceLabel || "All Piessang customers"),
      status: ["active", "draft", "archived"].includes(toStr(newsletter.status).toLowerCase())
        ? toStr(newsletter.status).toLowerCase()
        : "draft",
      createdAt: toStr(newsletter.createdAt),
      updatedAt: toStr(newsletter.updatedAt),
      createdBy: toStr(newsletter.createdBy),
      updatedBy: toStr(newsletter.updatedBy),
    },
    metrics: {
      subscriberCount: Number(metrics.subscriberCount || 0) || 0,
    },
  };
}

export function normalizeNewsletterInput(input) {
  const payload = input && typeof input === "object" ? input : {};
  const title = toStr(payload.title);
  return {
    title,
    slug: toStr(payload.slug || slugify(title)),
    description: toStr(payload.description),
    audienceLabel: toStr(payload.audienceLabel || "All Piessang customers"),
    status: ["active", "draft", "archived"].includes(toStr(payload.status).toLowerCase())
      ? toStr(payload.status).toLowerCase()
      : "draft",
  };
}

export function normalizeNewsletterSubscriptions(raw) {
  const subscriptions = raw && typeof raw === "object" ? raw : {};
  const result = {};
  for (const [key, value] of Object.entries(subscriptions)) {
    const id = toStr(key);
    if (!id) continue;
    result[id] = toBool(value, false);
  }
  return result;
}
