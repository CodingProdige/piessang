import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { buildOfferGroupMetadata } from "@/lib/catalogue/offer-group";

const CONFIG_COLLECTION = "seller_shopify_connections_v1";
const JOB_COLLECTION = "seller_shopify_import_jobs_v1";
const OAUTH_STATE_COLLECTION = "seller_shopify_oauth_states_v1";
const WEBHOOK_EVENT_COLLECTION = "seller_shopify_webhook_events_v1";
const SHOPIFY_API_VERSION = "2025-01";
const DEFAULT_SHOPIFY_WEBHOOK_TOPICS = [
  "PRODUCTS_CREATE",
  "PRODUCTS_UPDATE",
  "PRODUCTS_DELETE",
  "INVENTORY_LEVELS_UPDATE",
];
const DEFAULT_SHOPIFY_SCOPES = [
  "read_products",
  "read_inventory",
  "read_locations",
  "read_product_listings",
];

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return fallback;
}

function toNum(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function toInt(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
}

export function normalizeShopDomain(input) {
  const raw = toStr(input).replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
  if (!raw) return "";
  return raw.toLowerCase();
}

function maskToken(token) {
  const safe = toStr(token);
  if (!safe) return "";
  if (safe.length <= 8) return `${safe.slice(0, 2)}***${safe.slice(-2)}`;
  return `${safe.slice(0, 4)}***${safe.slice(-4)}`;
}

function safeConfigId({ sellerCode = "", sellerSlug = "" }) {
  const id = toStr(sellerCode || sellerSlug);
  if (!id) throw new Error("Missing seller identifier.");
  return id;
}

function safeOAuthStateId(value) {
  const id = toStr(value);
  if (!id) throw new Error("Missing Shopify OAuth state.");
  return id;
}

function toIsoFromNow(seconds) {
  const ttl = Math.max(0, Number(seconds) || 0);
  if (!ttl) return "";
  return new Date(Date.now() + ttl * 1000).toISOString();
}

async function shopifyGraphQL({ shopDomain, adminAccessToken, query, variables = {} }) {
  const domain = normalizeShopDomain(shopDomain);
  const token = toStr(adminAccessToken);
  if (!domain || !token) throw new Error("Shopify domain and admin access token are required.");

  const response = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const rawBody = await response.text().catch(() => "");
  let payload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const requestId = toStr(response.headers.get("x-request-id"));
    const baseMessage = payload?.errors?.[0]?.message || payload?.error || `Shopify request failed (${response.status}).`;
    const detail =
      toStr(payload?.errors) ||
      toStr(payload?.error_description) ||
      toStr(rawBody).slice(0, 400);
    const parts = [baseMessage];
    if (requestId) parts.push(`request_id=${requestId}`);
    if (detail && detail !== baseMessage) parts.push(`details=${detail}`);
    throw new Error(parts.join(" | "));
  }
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    throw new Error(payload.errors.map((entry) => entry?.message || "Shopify error").join(" "));
  }
  return payload?.data || {};
}

function topicToHeaderTopic(topic = "") {
  return toStr(topic).trim().toLowerCase().replace(/_/g, "/");
}

function money2(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0;
}

function moneyInclToExcl(value) {
  return money2(Number(value) / 1.15);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toIsoTimestamp(value) {
  if (value == null) return "";
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeTitleSlug(title = "") {
  return toStr(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function toSellerSlug(value = "") {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeShopifyImages(payload = {}) {
  const images = asArray(payload?.images);
  return images
    .map((image, index) => ({
      imageUrl: toStr(image?.src),
      blurHashUrl: null,
      altText: toStr(image?.alt),
      position: Number.isFinite(Number(image?.position)) ? Math.trunc(Number(image.position)) : index + 1,
    }))
    .filter((image) => image.imageUrl);
}

function normalizeOptionName(value = "") {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getShopifyVariantOptionMap(shopifyProduct = {}, shopifyVariant = {}) {
  const productOptions = asArray(shopifyProduct?.options);
  const pairs = [];

  for (let index = 0; index < 3; index += 1) {
    const optionMeta = productOptions[index] || {};
    const rawName = toStr(optionMeta?.name || `option${index + 1}`);
    const rawValue = toStr(shopifyVariant?.[`option${index + 1}`]);
    if (!rawName || !rawValue) continue;
    pairs.push([normalizeOptionName(rawName), rawValue]);
  }

  return Object.fromEntries(pairs);
}

function getFirstOptionValue(optionMap = {}, names = []) {
  for (const name of names) {
    const value = toStr(optionMap?.[normalizeOptionName(name)]);
    if (value) return value;
  }
  return "";
}

function normalizeShopifyWeightKg(shopifyVariant = {}) {
  if (Number.isFinite(Number(shopifyVariant?.grams)) && Number(shopifyVariant.grams) > 0) {
    return money2(Number(shopifyVariant.grams) / 1000);
  }

  const weight = Number(shopifyVariant?.weight);
  const unit = toStr(shopifyVariant?.weight_unit).toLowerCase();
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (unit === "kg" || unit === "kgs" || unit === "kilograms" || unit === "kilogram") return money2(weight);
  if (unit === "g" || unit === "gram" || unit === "grams") return money2(weight / 1000);
  if (unit === "lb" || unit === "lbs" || unit === "pound" || unit === "pounds") return money2(weight * 0.45359237);
  if (unit === "oz" || unit === "ounce" || unit === "ounces") return money2(weight * 0.0283495);
  return 0;
}

function buildImportedVariantAttributes(shopifyProduct = {}, shopifyVariant = {}) {
  const optionMap = getShopifyVariantOptionMap(shopifyProduct, shopifyVariant);
  const color = getFirstOptionValue(optionMap, ["color", "colour"]);
  const size = getFirstOptionValue(optionMap, ["size"]);
  const material = getFirstOptionValue(optionMap, ["material"]);
  const shade = getFirstOptionValue(optionMap, ["shade", "tone", "finish"]);
  const scent = getFirstOptionValue(optionMap, ["scent", "fragrance"]);
  const flavor = getFirstOptionValue(optionMap, ["flavor", "flavour"]);
  const storageCapacity = getFirstOptionValue(optionMap, ["storage", "capacity", "memory"]);
  const connectivity = getFirstOptionValue(optionMap, ["connectivity", "connection"]);
  const compatibility = getFirstOptionValue(optionMap, ["compatibility", "compatible with", "fitment"]);
  const skinType = getFirstOptionValue(optionMap, ["skin type"]);
  const hairType = getFirstOptionValue(optionMap, ["hair type"]);
  const containerType = getFirstOptionValue(optionMap, ["container", "container type"]);
  const sizeSystem = getFirstOptionValue(optionMap, ["size system"]);
  const weightKg = normalizeShopifyWeightKg(shopifyVariant);

  return {
    color: color || null,
    size: size || null,
    sizeSystem: sizeSystem || null,
    material: material || null,
    shade: shade || null,
    scent: scent || null,
    flavor: flavor || null,
    storageCapacity: storageCapacity || null,
    connectivity: connectivity || null,
    compatibility: compatibility || null,
    skinType: skinType || null,
    hairType: hairType || null,
    containerType: containerType || null,
    weightKg,
  };
}

function gen8() {
  return Math.floor(10_000_000 + Math.random() * 90_000_000).toString();
}

function generateEAN13Base() {
  let base = "";
  for (let i = 0; i < 12; i += 1) base += Math.floor(Math.random() * 10);
  return base;
}

function computeEAN13Checksum(base12) {
  const digits = base12.split("").map(Number);
  const sum = digits.reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3), 0);
  return ((10 - (sum % 10)) % 10).toString();
}

function generateEAN13() {
  const base = generateEAN13Base();
  return `${base}${computeEAN13Checksum(base)}`;
}

export function getShopifyOauthConfig() {
  return {
    clientId: toStr(process.env.SHOPIFY_APP_CLIENT_ID || process.env.SHOPIFY_API_KEY),
    clientSecret: toStr(process.env.SHOPIFY_APP_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET),
    scopes: DEFAULT_SHOPIFY_SCOPES.join(","),
  };
}

export function isShopifyOauthConfigured() {
  const config = getShopifyOauthConfig();
  return Boolean(config.clientId && config.clientSecret);
}

export function getShopifyWebhookSecret() {
  const oauth = getShopifyOauthConfig();
  return toStr(
    process.env.SHOPIFY_WEBHOOK_SECRET ||
      process.env.SHOPIFY_APP_WEBHOOK_SECRET ||
      oauth.clientSecret,
  );
}

export function isShopifyWebhookConfigured() {
  return Boolean(getShopifyWebhookSecret());
}

export function getDefaultShopifyWebhookTopics() {
  return [...DEFAULT_SHOPIFY_WEBHOOK_TOPICS];
}

export async function createSellerShopifyOauthState({
  uid = "",
  sellerSlug = "",
  sellerCode = "",
  vendorName = "",
  shopDomain = "",
  syncMode = "import_once",
  importStatus = "draft",
  autoSyncPriceStock = true,
  autoImportNewProducts = false,
  redirectTo = "",
}) {
  const db = getAdminDb();
  const state = crypto.randomUUID().replace(/-/g, "");
  await db.collection(OAUTH_STATE_COLLECTION).doc(state).set({
    uid: toStr(uid),
    seller: {
      sellerSlug: toStr(sellerSlug),
      sellerCode: toStr(sellerCode),
      vendorName: toStr(vendorName),
    },
    shopDomain: normalizeShopDomain(shopDomain),
    settings: {
      syncMode: toStr(syncMode || "import_once"),
      importStatus: toStr(importStatus || "draft"),
      autoSyncPriceStock: toBool(autoSyncPriceStock, true),
      autoImportNewProducts: toBool(autoImportNewProducts),
    },
    redirectTo: toStr(redirectTo),
    createdAt: FieldValue.serverTimestamp(),
  });
  return state;
}

export async function consumeSellerShopifyOauthState(state) {
  const db = getAdminDb();
  const ref = db.collection(OAUTH_STATE_COLLECTION).doc(safeOAuthStateId(state));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  await ref.delete().catch(() => null);
  return data;
}

export async function exchangeShopifyOauthCode({
  shopDomain = "",
  code = "",
  redirectUri = "",
}) {
  const config = getShopifyOauthConfig();
  const domain = normalizeShopDomain(shopDomain);
  if (!config.clientId || !config.clientSecret) {
    throw new Error("Shopify OAuth environment variables are not configured.");
  }
  if (!domain || !toStr(code) || !toStr(redirectUri)) {
    throw new Error("Shopify OAuth code exchange requires shop, code, and redirect URI.");
  }

  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: toStr(code),
      redirect_uri: toStr(redirectUri),
      expiring: 1,
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || `Shopify OAuth exchange failed (${response.status}).`);
  }

  return {
    accessToken: toStr(payload?.access_token),
    refreshToken: toStr(payload?.refresh_token),
    expiresIn: Number(payload?.expires_in || 0),
    refreshTokenExpiresIn: Number(payload?.refresh_token_expires_in || 0),
    scope: toStr(payload?.scope),
  };
}

export async function refreshShopifyOfflineAccessToken({
  shopDomain = "",
  refreshToken = "",
}) {
  const config = getShopifyOauthConfig();
  const domain = normalizeShopDomain(shopDomain);
  const token = toStr(refreshToken);
  if (!config.clientId || !config.clientSecret) {
    throw new Error("Shopify OAuth environment variables are not configured.");
  }
  if (!domain || !token) {
    throw new Error("Shopify refresh requires shop domain and refresh token.");
  }

  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: token,
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.error || `Shopify token refresh failed (${response.status}).`);
  }

  return {
    accessToken: toStr(payload?.access_token),
    refreshToken: toStr(payload?.refresh_token),
    expiresIn: Number(payload?.expires_in || 0),
    refreshTokenExpiresIn: Number(payload?.refresh_token_expires_in || 0),
    scope: toStr(payload?.scope),
  };
}

export async function registerSellerShopifyWebhooks({
  shopDomain = "",
  adminAccessToken = "",
  deliveryUrl = "",
  topics = DEFAULT_SHOPIFY_WEBHOOK_TOPICS,
}) {
  const normalizedTopics = Array.isArray(topics)
    ? topics.map((topic) => toStr(topic).toUpperCase()).filter(Boolean)
    : DEFAULT_SHOPIFY_WEBHOOK_TOPICS;
  const uri = toStr(deliveryUrl);
  if (!uri) throw new Error("Shopify webhook delivery URL is required.");

  const results = [];
  for (const topic of normalizedTopics) {
    let data;
    try {
      data = await shopifyGraphQL({
        shopDomain,
        adminAccessToken,
        variables: {
          topic,
          uri,
        },
        query: `
          mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $uri: URL!) {
            webhookSubscriptionCreate(
              topic: $topic
              webhookSubscription: {
                uri: $uri
                format: JSON
              }
            ) {
              webhookSubscription {
                id
                topic
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
      });
    } catch (error) {
      const message = toStr(error?.message || "");
      const shouldRetryWithCallbackUrl =
        message.includes("WebhookSubscriptionInput") &&
        message.includes("uri");

      if (!shouldRetryWithCallbackUrl) throw error;

      data = await shopifyGraphQL({
        shopDomain,
        adminAccessToken,
        variables: {
          topic,
          callbackUrl: uri,
        },
        query: `
          mutation CreateWebhookLegacy($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
            webhookSubscriptionCreate(
              topic: $topic
              webhookSubscription: {
                callbackUrl: $callbackUrl
                format: JSON
              }
            ) {
              webhookSubscription {
                id
                topic
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
      });
    }

    const row = data?.webhookSubscriptionCreate || {};
    const errors = Array.isArray(row?.userErrors) ? row.userErrors : [];
    const duplicateError = errors.find((item) => /already exists/i.test(toStr(item?.message)));
    results.push({
      topic,
      ok: Boolean(row?.webhookSubscription?.id) || Boolean(duplicateError),
      duplicate: Boolean(duplicateError),
      subscriptionId: toStr(row?.webhookSubscription?.id),
      errors: errors.map((item) => ({
        field: item?.field || [],
        message: toStr(item?.message),
      })),
    });
  }

  return results;
}

export async function verifyShopifyConnection({ shopDomain, adminAccessToken }) {
  const data = await shopifyGraphQL({
    shopDomain,
    adminAccessToken,
    query: `
      query ShopifyConnectionProbe {
        shop {
          id
          name
          myshopifyDomain
          contactEmail
          currencyCode
          plan {
            displayName
            partnerDevelopment
            shopifyPlus
          }
        }
        products(first: 1) {
          pageInfo { hasNextPage }
        }
      }
    `,
  });

  const shop = data?.shop || {};
  return {
    shopId: toStr(shop?.id),
    shopName: toStr(shop?.name || shop?.myshopifyDomain),
    shopDomain: normalizeShopDomain(shop?.myshopifyDomain || shopDomain),
    contactEmail: toStr(shop?.contactEmail),
    currencyCode: toStr(shop?.currencyCode),
    planName: toStr(shop?.plan?.displayName),
    shopifyPlus: toBool(shop?.plan?.shopifyPlus),
    partnerDevelopment: toBool(shop?.plan?.partnerDevelopment),
    verifiedAt: new Date().toISOString(),
  };
}

export async function listShopifyPreviewProducts({ shopDomain, adminAccessToken, limit = 12 }) {
  const data = await shopifyGraphQL({
    shopDomain,
    adminAccessToken,
    variables: { first: Math.max(1, Math.min(Number(limit) || 12, 20)) },
    query: `
      query ShopifyPreviewProducts($first: Int!) {
        products(first: $first, sortKey: UPDATED_AT, reverse: true) {
          edges {
            node {
              id
              title
              handle
              vendor
              status
              totalInventory
              featuredImage {
                url
                altText
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    sku
                    barcode
                    inventoryItem {
                      id
                    }
                    inventoryQuantity
                    price
                    compareAtPrice
                  }
                }
              }
            }
          }
        }
      }
    `,
  });

  const edges = Array.isArray(data?.products?.edges) ? data.products.edges : [];
  return edges.map((edge) => {
    const node = edge?.node || {};
    const variants = Array.isArray(node?.variants?.edges)
      ? node.variants.edges.map((variantEdge) => {
          const variant = variantEdge?.node || {};
          return {
            id: toStr(variant?.id),
            title: toStr(variant?.title || "Default"),
            sku: toStr(variant?.sku),
            barcode: toStr(variant?.barcode),
            inventoryItemId: toStr(variant?.inventoryItem?.id),
            inventoryQuantity: Number(variant?.inventoryQuantity || 0),
            price: Number(variant?.price || 0),
            compareAtPrice: Number(variant?.compareAtPrice || 0),
          };
        })
      : [];

    return {
      id: toStr(node?.id),
      title: toStr(node?.title),
      handle: toStr(node?.handle),
      vendor: toStr(node?.vendor),
      status: toStr(node?.status).toLowerCase(),
      totalInventory: Number(node?.totalInventory || 0),
      imageUrl: toStr(node?.featuredImage?.url),
      imageAlt: toStr(node?.featuredImage?.altText),
      variantCount: variants.length,
      variants,
    };
  });
}

export async function getSellerShopifyConnection({ sellerCode = "", sellerSlug = "" }) {
  const db = getAdminDb();
  const snap = await db.collection(CONFIG_COLLECTION).doc(safeConfigId({ sellerCode, sellerSlug })).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const jobsSnap = await db
    .collection(JOB_COLLECTION)
    .where("seller.connectionId", "==", safeConfigId({ sellerCode, sellerSlug }))
    .orderBy("timestamps.createdAt", "desc")
    .limit(10)
    .get()
    .catch(() => null);

  const jobs = jobsSnap?.docs?.map((doc) => {
    const row = doc.data() || {};
    return {
      id: doc.id,
      status: toStr(row?.status || "draft"),
      totals: row?.totals || {},
      syncMode: toStr(row?.syncMode || data?.syncMode || "import_once"),
      createdAt: row?.timestamps?.createdAt?.toDate?.()?.toISOString?.() || toStr(row?.timestamps?.createdAt),
      updatedAt: row?.timestamps?.updatedAt?.toDate?.()?.toISOString?.() || toStr(row?.timestamps?.updatedAt),
    };
  }) || [];
  const importSummary = await buildSellerShopifyImportSummary({
    sellerCode,
    shopDomain: toStr(data?.shopDomain),
  });

  return {
    connectionId: snap.id,
    connected: toBool(data?.connected),
    shopDomain: toStr(data?.shopDomain),
    shopName: toStr(data?.shopName),
    contactEmail: toStr(data?.contactEmail),
    currencyCode: toStr(data?.currencyCode),
    planName: toStr(data?.planName),
    tokenMasked: toStr(data?.tokenMasked),
    lastError: toStr(data?.lastError),
    verifiedAt: data?.verifiedAt?.toDate?.()?.toISOString?.() || toStr(data?.verifiedAt),
    accessTokenExpiresAt: toStr(data?.accessTokenExpiresAt?.toDate?.()?.toISOString?.() || data?.accessTokenExpiresAt),
    refreshTokenExpiresAt: toStr(data?.refreshTokenExpiresAt?.toDate?.()?.toISOString?.() || data?.refreshTokenExpiresAt),
    syncMode: toStr(data?.syncMode || "import_once"),
    importStatus: toStr(data?.importStatus || "draft"),
    autoSyncPriceStock: toBool(data?.autoSyncPriceStock),
    autoImportNewProducts: toBool(data?.autoImportNewProducts),
    lastWebhookAt: data?.lastWebhookAt?.toDate?.()?.toISOString?.() || toStr(data?.lastWebhookAt),
    lastWebhookTopic: toStr(data?.lastWebhookTopic),
    lastSyncSummary: data?.lastSyncSummary && typeof data.lastSyncSummary === "object"
      ? {
          topic: toStr(data?.lastSyncSummary?.topic),
          syncedProducts: toNum(data?.lastSyncSummary?.syncedProducts, 0),
          unmatchedVariants: toNum(data?.lastSyncSummary?.unmatchedVariants, 0),
          preparedImport: toBool(data?.lastSyncSummary?.preparedImport),
          createdDraftProductId: toStr(data?.lastSyncSummary?.createdDraftProductId),
          happenedAt: toStr(data?.lastSyncSummary?.happenedAt),
        }
      : null,
    webhooks: data?.webhooks && typeof data.webhooks === "object"
      ? {
          registeredAt: toStr(data?.webhooks?.registeredAt),
          lastAttemptAt: toStr(data?.webhooks?.lastAttemptAt),
          lastError: toStr(data?.webhooks?.lastError),
          deliveryUrl: toStr(data?.webhooks?.deliveryUrl),
          topics: Array.isArray(data?.webhooks?.topics) ? data.webhooks.topics : [],
        }
      : null,
    lastPreview: {
      fetchedAt: data?.lastPreview?.fetchedAt?.toDate?.()?.toISOString?.() || toStr(data?.lastPreview?.fetchedAt),
      products: Array.isArray(data?.lastPreview?.products) ? data.lastPreview.products : [],
      totals: data?.lastPreview?.totals || {},
    },
    importSummary,
    jobs,
  };
}

export async function saveSellerShopifyConnectionPending({
  sellerCode = "",
  sellerSlug = "",
  vendorName = "",
  shopDomain = "",
  adminAccessToken = "",
  syncMode = "import_once",
  importStatus = "draft",
  autoSyncPriceStock = false,
  autoImportNewProducts = false,
  lastError = "",
  refreshToken = "",
  accessTokenExpiresIn = 0,
  refreshTokenExpiresIn = 0,
}) {
  const db = getAdminDb();
  const connectionId = safeConfigId({ sellerCode, sellerSlug });
  const ref = db.collection(CONFIG_COLLECTION).doc(connectionId);
  const existing = await ref.get();
  const payload = {
    connected: false,
    shopDomain: normalizeShopDomain(shopDomain),
    shopName: existing.data()?.shopName || "",
    tokenMasked: maskToken(adminAccessToken),
    lastError: toStr(lastError).slice(0, 240),
    accessTokenExpiresAt: toIsoFromNow(accessTokenExpiresIn),
    refreshTokenExpiresAt: toIsoFromNow(refreshTokenExpiresIn),
    secret: {
      adminAccessToken: toStr(adminAccessToken),
      refreshToken: toStr(refreshToken),
    },
    seller: {
      sellerCode: toStr(sellerCode),
      sellerSlug: toStr(sellerSlug),
      vendorName: toStr(vendorName),
    },
    syncMode: toStr(syncMode || "import_once"),
    importStatus: toStr(importStatus || "draft"),
    autoSyncPriceStock: toBool(autoSyncPriceStock),
    autoImportNewProducts: toBool(autoImportNewProducts),
    timestamps: {
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: existing.data()?.timestamps?.createdAt || FieldValue.serverTimestamp(),
    },
  };

  await ref.set(payload, { merge: true });
  return getSellerShopifyConnection({ sellerCode, sellerSlug });
}

export async function saveSellerShopifyConnection({
  sellerCode = "",
  sellerSlug = "",
  vendorName = "",
  shopDomain = "",
  adminAccessToken = "",
  syncMode = "import_once",
  importStatus = "draft",
  autoSyncPriceStock = false,
  autoImportNewProducts = false,
  refreshToken = "",
  accessTokenExpiresIn = 0,
  refreshTokenExpiresIn = 0,
}) {
  const db = getAdminDb();
  const connectionId = safeConfigId({ sellerCode, sellerSlug });
  const verification = await verifyShopifyConnection({ shopDomain, adminAccessToken });
  const previewProducts = await listShopifyPreviewProducts({ shopDomain, adminAccessToken, limit: 12 });
  const payload = {
    connected: true,
    shopDomain: verification.shopDomain,
    shopName: verification.shopName,
    contactEmail: verification.contactEmail,
    currencyCode: verification.currencyCode,
    planName: verification.planName,
    tokenMasked: maskToken(adminAccessToken),
    lastError: "",
    accessTokenExpiresAt: toIsoFromNow(accessTokenExpiresIn),
    refreshTokenExpiresAt: toIsoFromNow(refreshTokenExpiresIn),
    secret: {
      adminAccessToken: toStr(adminAccessToken),
      refreshToken: toStr(refreshToken),
    },
    seller: {
      sellerCode: toStr(sellerCode),
      sellerSlug: toStr(sellerSlug),
      vendorName: toStr(vendorName),
    },
    syncMode: toStr(syncMode || "import_once"),
    importStatus: toStr(importStatus || "draft"),
    autoSyncPriceStock: toBool(autoSyncPriceStock),
    autoImportNewProducts: toBool(autoImportNewProducts),
    verifiedAt: FieldValue.serverTimestamp(),
    lastPreview: {
      fetchedAt: FieldValue.serverTimestamp(),
      totals: {
        products: previewProducts.length,
        variants: previewProducts.reduce((sum, item) => sum + Number(item?.variantCount || 0), 0),
      },
      products: previewProducts,
    },
    timestamps: {
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
  };

  const ref = db.collection(CONFIG_COLLECTION).doc(connectionId);
  const existing = await ref.get();
  if (existing.exists) {
    payload.timestamps.createdAt = existing.data()?.timestamps?.createdAt || FieldValue.serverTimestamp();
  }
  await ref.set(payload, { merge: true });
  return getSellerShopifyConnection({ sellerCode, sellerSlug });
}

export async function getValidSellerShopifyAccessToken({
  sellerCode = "",
  sellerSlug = "",
}) {
  const db = getAdminDb();
  const ref = db.collection(CONFIG_COLLECTION).doc(safeConfigId({ sellerCode, sellerSlug }));
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Shopify connection not found.");

  const data = snap.data() || {};
  const shopDomain = normalizeShopDomain(data?.shopDomain);
  const accessToken = toStr(data?.secret?.adminAccessToken);
  const refreshToken = toStr(data?.secret?.refreshToken);
  const accessTokenExpiresAt = toStr(data?.accessTokenExpiresAt?.toDate?.()?.toISOString?.() || data?.accessTokenExpiresAt);
  const expiryTime = accessTokenExpiresAt ? new Date(accessTokenExpiresAt).getTime() : 0;
  const now = Date.now();

  if (accessToken && (!expiryTime || expiryTime - now > 60_000)) {
    return accessToken;
  }
  if (!refreshToken) {
    throw new Error("Saved Shopify refresh token missing. Reconnect the store.");
  }

  const refreshed = await refreshShopifyOfflineAccessToken({ shopDomain, refreshToken });
  await ref.set({
    tokenMasked: maskToken(refreshed.accessToken),
    lastError: "",
    accessTokenExpiresAt: toIsoFromNow(refreshed.expiresIn),
    refreshTokenExpiresAt: toIsoFromNow(refreshed.refreshTokenExpiresIn),
    secret: {
      adminAccessToken: toStr(refreshed.accessToken),
      refreshToken: toStr(refreshed.refreshToken),
    },
    timestamps: {
      updatedAt: FieldValue.serverTimestamp(),
    },
  }, { merge: true });

  return refreshed.accessToken;
}

export async function updateSellerShopifyConnectionState({
  sellerCode = "",
  sellerSlug = "",
  patch = {},
}) {
  const db = getAdminDb();
  const ref = db.collection(CONFIG_COLLECTION).doc(safeConfigId({ sellerCode, sellerSlug }));
  await ref.set(
    {
      ...patch,
      timestamps: {
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );
  return getSellerShopifyConnection({ sellerCode, sellerSlug });
}

async function listSellerProductsBySellerCode(sellerCode = "") {
  const db = getAdminDb();
  const normalizedSellerCode = toStr(sellerCode);
  if (!normalizedSellerCode) return [];

  const snap = await db
    .collection("products_v2")
    .where("product.sellerCode", "==", normalizedSellerCode)
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    data: doc.data() || {},
  }));
}

async function findSellerVariantByShopifyVariantId({ sellerCode = "", shopifyVariantId = "" }) {
  const normalizedVariantId = toStr(shopifyVariantId);
  if (!normalizedVariantId) return null;

  const products = await listSellerProductsBySellerCode(sellerCode);
  for (const productRow of products) {
    const variants = asArray(productRow?.data?.variants);
    for (let index = 0; index < variants.length; index += 1) {
      const variant = variants[index] || {};
      if (toStr(getVariantShopifyMeta(variant)?.variantId) === normalizedVariantId) {
        return {
          productId: productRow.id,
          variantIndex: index,
          product: productRow.data || {},
          variant,
        };
      }
    }
  }

  return null;
}

async function buildSellerShopifyImportSummary({ sellerCode = "", shopDomain = "" }) {
  const normalizedSellerCode = toStr(sellerCode);
  if (!normalizedSellerCode) {
    return {
      importedProducts: 0,
      importedVariants: 0,
      lastImportedAt: "",
      recentProducts: [],
    };
  }

  const normalizedShopDomain = normalizeShopDomain(shopDomain);
  const importedRows = (await listSellerProductsBySellerCode(normalizedSellerCode))
    .map((row) => {
      const shopifyMeta = getProductShopifyMeta(row.data);
      const rowShopDomain = normalizeShopDomain(shopifyMeta?.shopDomain);
      if (!toStr(shopifyMeta?.productId)) return null;
      if (normalizedShopDomain && rowShopDomain && rowShopDomain !== normalizedShopDomain) return null;

      const variantCount = asArray(row?.data?.variants).filter((variant) => toStr(getVariantShopifyMeta(variant)?.variantId)).length;
      return {
        id: row.id,
        title: toStr(row?.data?.product?.title || shopifyMeta?.title || row.id),
        moderationStatus: toStr(row?.data?.moderation?.status || "draft"),
        importedAt: toStr(shopifyMeta?.importedAt),
        variantCount,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(toStr(b.importedAt) || 0).getTime() - new Date(toStr(a.importedAt) || 0).getTime());

  return {
    importedProducts: importedRows.length,
    importedVariants: importedRows.reduce((sum, item) => sum + Number(item?.variantCount || 0), 0),
    lastImportedAt: toStr(importedRows[0]?.importedAt),
    recentProducts: importedRows.slice(0, 4),
  };
}

async function buildPreparedImportSelection({ sellerCode = "", previewProducts = [] }) {
  const existingProducts = await listSellerProductsBySellerCode(sellerCode);
  const productMap = new Map();
  const variantMap = new Map();

  for (const row of existingProducts) {
    const productMeta = getProductShopifyMeta(row.data);
    const shopifyProductId = toStr(productMeta?.productId);
    if (shopifyProductId) {
      productMap.set(shopifyProductId, row);
    }
    for (const variant of asArray(row?.data?.variants)) {
      const shopifyVariantId = toStr(getVariantShopifyMeta(variant)?.variantId);
      if (shopifyVariantId) {
        variantMap.set(shopifyVariantId, {
          productId: row.id,
          productTitle: toStr(row?.data?.product?.title || productMeta?.title || row.id),
          variantId: toStr(variant?.variant_id),
        });
      }
    }
  }

  return asArray(previewProducts).map((product) => {
    const shopifyProductId = toStr(product?.id);
    const matchedProduct = productMap.get(shopifyProductId);
    const matchedVariants = asArray(product?.variants)
      .map((variant) => variantMap.get(toStr(variant?.id)))
      .filter(Boolean);
    const alreadyImported = Boolean(matchedProduct);
    return {
      id: shopifyProductId,
      title: toStr(product?.title),
      vendor: toStr(product?.vendor),
      status: toStr(product?.status),
      imageUrl: toStr(product?.imageUrl),
      imageAlt: toStr(product?.imageAlt),
      totalInventory: toNum(product?.totalInventory, 0),
      variantCount: toNum(product?.variantCount, asArray(product?.variants).length),
      variants: asArray(product?.variants),
      alreadyImported,
      importable: !alreadyImported,
      existingProductId: matchedProduct?.id || "",
      existingProductTitle: toStr(matchedProduct?.data?.product?.title),
      matchedVariantCount: matchedVariants.length,
    };
  });
}

function normalizePreparedProductForImport(previewProduct = {}) {
  return {
    admin_graphql_api_id: toStr(previewProduct?.id),
    title: toStr(previewProduct?.title),
    handle: toStr(previewProduct?.handle),
    vendor: toStr(previewProduct?.vendor),
    status: toStr(previewProduct?.status),
    body_html: "",
    product_type: "",
    images: toStr(previewProduct?.imageUrl)
      ? [{ src: toStr(previewProduct?.imageUrl), alt: toStr(previewProduct?.imageAlt), position: 1 }]
      : [],
    variants: asArray(previewProduct?.variants).map((variant, index) => ({
      admin_graphql_api_id: toStr(variant?.id),
      id: toStr(variant?.id),
      title: toStr(variant?.title || `Variant ${index + 1}`),
      sku: toStr(variant?.sku),
      barcode: toStr(variant?.barcode),
      inventory_item_id: toStr(variant?.inventoryItemId),
      price: toNum(variant?.price, 0),
      compare_at_price: toNum(variant?.compareAtPrice, 0),
      inventory_quantity: toInt(variant?.inventoryQuantity, 0),
      option1: toStr(variant?.title && variant?.title !== "Default Title" ? variant.title : ""),
    })),
  };
}

async function collectCatalogueCodesAndBarcodes() {
  const db = getAdminDb();
  const snap = await db.collection("products_v2").get();
  const codes = new Set();
  const barcodes = new Set();
  const skus = new Set();

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const productCode = toStr(data?.product?.unique_id);
    if (/^\d{8}$/.test(productCode)) codes.add(productCode);
    const productSku = toStr(data?.product?.sku).toUpperCase();
    if (productSku) skus.add(productSku);

    for (const variant of asArray(data?.variants)) {
      const variantCode = toStr(variant?.variant_id);
      if (/^\d{8}$/.test(variantCode)) codes.add(variantCode);
      const barcode = toStr(variant?.barcode).toUpperCase();
      if (barcode) barcodes.add(barcode);
      const sku = toStr(variant?.sku).toUpperCase();
      if (sku) skus.add(sku);
    }
  }

  return { codes, barcodes, skus };
}

async function generateUniqueCatalogueCode(seenCodes = null) {
  const localSeen = seenCodes || (await collectCatalogueCodesAndBarcodes()).codes;
  for (let attempt = 0; attempt < 100000; attempt += 1) {
    const code = gen8();
    if (!localSeen.has(code)) {
      localSeen.add(code);
      return code;
    }
  }
  throw new Error("Could not generate a unique Piessang code.");
}

async function generateUniqueBarcode(seenBarcodes = null) {
  const localSeen = seenBarcodes || (await collectCatalogueCodesAndBarcodes()).barcodes;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const barcode = generateEAN13();
    if (!localSeen.has(barcode.toUpperCase())) {
      localSeen.add(barcode.toUpperCase());
      return barcode;
    }
  }
  throw new Error("Could not generate a unique Piessang barcode.");
}

function sanitizeSkuBase(value = "") {
  return toStr(value)
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

async function ensureUniqueImportedSku(baseValue = "", seenSkus = null) {
  const localSeen = seenSkus || (await collectCatalogueCodesAndBarcodes()).skus;
  const base = sanitizeSkuBase(baseValue) || "SHOPIFY-IMPORT";
  let candidate = base;
  let suffix = 1;
  while (localSeen.has(candidate.toUpperCase())) {
    suffix += 1;
    candidate = `${base}-${suffix}`.slice(0, 32);
  }
  localSeen.add(candidate.toUpperCase());
  return candidate;
}

function getProductShopifyMeta(product = {}) {
  return product?.integrations?.shopify && typeof product.integrations.shopify === "object"
    ? product.integrations.shopify
    : {};
}

function getVariantShopifyMeta(variant = {}) {
  return variant?.integrations?.shopify && typeof variant.integrations.shopify === "object"
    ? variant.integrations.shopify
    : {};
}

async function findSellerProductByShopifyProductId({ sellerCode = "", shopifyProductId = "" }) {
  const products = await listSellerProductsBySellerCode(sellerCode);
  return products.find((item) => toStr(getProductShopifyMeta(item.data)?.productId) === toStr(shopifyProductId)) || null;
}

function scoreVariantMatch({ product, variant, shopifyProduct, shopifyVariant, topic = "" }) {
  const productMeta = getProductShopifyMeta(product);
  const variantMeta = getVariantShopifyMeta(variant);
  let score = 0;

  const shopifyProductId = toStr(shopifyProduct?.admin_graphql_api_id || shopifyProduct?.id);
  const shopifyVariantId = toStr(shopifyVariant?.admin_graphql_api_id || shopifyVariant?.id);
  const inventoryItemId = toStr(shopifyVariant?.admin_graphql_api_id_inventory_item || shopifyVariant?.inventory_item_id);
  const sku = toStr(shopifyVariant?.sku).toLowerCase();
  const barcode = toStr(shopifyVariant?.barcode).toUpperCase();

  if (shopifyProductId && toStr(productMeta?.productId) === shopifyProductId) score += 50;
  if (shopifyVariantId && toStr(variantMeta?.variantId) === shopifyVariantId) score += 100;
  if (inventoryItemId && toStr(variantMeta?.inventoryItemId) === inventoryItemId) score += 80;
  if (sku && toStr(variant?.sku).toLowerCase() === sku) score += 25;
  if (barcode && toStr(variant?.barcode).toUpperCase() === barcode) score += 25;
  if (topic === "inventory_levels/update" && inventoryItemId && toStr(variantMeta?.inventoryItemId) === inventoryItemId) score += 40;

  return score;
}

async function matchSellerProductVariant({
  sellerCode = "",
  shopifyProduct = {},
  shopifyVariant = {},
  topic = "",
}) {
  const products = await listSellerProductsBySellerCode(sellerCode);
  let best = null;

  for (const productRow of products) {
    const variants = asArray(productRow?.data?.variants);
    for (let index = 0; index < variants.length; index += 1) {
      const variant = variants[index] || {};
      const score = scoreVariantMatch({
        product: productRow.data,
        variant,
        shopifyProduct,
        shopifyVariant,
        topic,
      });
      if (!best || score > best.score) {
        best = {
          score,
          productId: productRow.id,
          ref: productRow.ref,
          data: productRow.data,
          variantIndex: index,
          variant,
        };
      }
    }
  }

  return best?.score > 0 ? best : null;
}

function buildShopifyVariantSyncPatch({
  currentVariant = {},
  shopifyProduct = {},
  shopifyVariant = {},
  updatePrice = false,
  updateStock = false,
}) {
  const next = {
    ...currentVariant,
    integrations: {
      ...(currentVariant?.integrations && typeof currentVariant.integrations === "object" ? currentVariant.integrations : {}),
      shopify: {
        ...getVariantShopifyMeta(currentVariant),
        variantId: toStr(shopifyVariant?.admin_graphql_api_id || shopifyVariant?.id),
        inventoryItemId: toStr(shopifyVariant?.admin_graphql_api_id_inventory_item || shopifyVariant?.inventory_item_id),
        sku: toStr(shopifyVariant?.sku),
        barcode: toStr(shopifyVariant?.barcode),
        lastSyncedAt: new Date().toISOString(),
      },
    },
  };

  if (updatePrice) {
    const priceIncl = money2(shopifyVariant?.price);
    if (priceIncl > 0) {
      next.pricing = {
        ...(currentVariant?.pricing && typeof currentVariant.pricing === "object" ? currentVariant.pricing : {}),
        selling_price_incl: priceIncl,
        selling_price_excl: moneyInclToExcl(priceIncl),
      };
      const compareAt = money2(shopifyVariant?.compare_at_price);
      next.sale = {
        ...(currentVariant?.sale && typeof currentVariant.sale === "object" ? currentVariant.sale : {}),
        is_on_sale: compareAt > priceIncl && priceIncl > 0,
        sale_price_incl: compareAt > priceIncl ? priceIncl : money2(currentVariant?.sale?.sale_price_incl || 0),
        sale_price_excl: compareAt > priceIncl ? moneyInclToExcl(priceIncl) : money2(currentVariant?.sale?.sale_price_excl || 0),
      };
    }
  }

  if (updateStock) {
    const quantity = Math.max(0, toInt(shopifyVariant?.inventory_quantity, 0));
    next.placement = {
      ...(currentVariant?.placement && typeof currentVariant.placement === "object" ? currentVariant.placement : {}),
      track_inventory: true,
      continue_selling_out_of_stock: false,
    };
    next.logistics = {
      ...(currentVariant?.logistics && typeof currentVariant.logistics === "object" ? currentVariant.logistics : {}),
      stock_qty: quantity,
    };
  }

  return next;
}

async function applyShopifyVariantSync({
  match,
  shopifyProduct = {},
  shopifyVariant = {},
  updatePrice = false,
  updateStock = false,
}) {
  if (!match?.ref || match?.variantIndex == null) return null;

  const variants = asArray(match?.data?.variants).map((item) => ({ ...(item || {}) }));
  const currentVariant = variants[match.variantIndex] || {};
  variants[match.variantIndex] = buildShopifyVariantSyncPatch({
    currentVariant,
    shopifyProduct,
    shopifyVariant,
    updatePrice,
    updateStock,
  });

  const nextProductMeta = {
    ...getProductShopifyMeta(match.data),
    shopDomain: toStr(shopifyProduct?.shop_domain),
    productId: toStr(shopifyProduct?.admin_graphql_api_id || shopifyProduct?.id),
    title: toStr(shopifyProduct?.title),
    handle: toStr(shopifyProduct?.handle),
    status: toStr(shopifyProduct?.status),
    lastSyncedAt: new Date().toISOString(),
  };

  const patch = {
    variants,
    integrations: {
      ...(match?.data?.integrations && typeof match.data.integrations === "object" ? match.data.integrations : {}),
      shopify: nextProductMeta,
    },
    placement: {
      ...(match?.data?.placement && typeof match.data.placement === "object" ? match.data.placement : {}),
      supplier_out_of_stock: updateStock
        ? !variants.some((variant) => Number(variant?.logistics?.stock_qty || 0) > 0)
        : Boolean(match?.data?.placement?.supplier_out_of_stock),
      in_stock: updateStock
        ? variants.some((variant) => Number(variant?.logistics?.stock_qty || 0) > 0)
        : Boolean(match?.data?.placement?.in_stock),
    },
    timestamps: {
      ...(match?.data?.timestamps && typeof match.data.timestamps === "object" ? match.data.timestamps : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
  };

  await match.ref.set(patch, { merge: true });
  return {
    productId: match.productId,
    variantIndex: match.variantIndex,
  };
}

function normalizeShopifyProductWebhookPayload(payload = {}, shopDomain = "") {
  const variants = asArray(payload?.variants).map((variant) => ({
    ...variant,
    admin_graphql_api_id: toStr(variant?.admin_graphql_api_id) || (variant?.id ? `gid://shopify/ProductVariant/${variant.id}` : ""),
    admin_graphql_api_id_inventory_item: variant?.inventory_item_id ? `gid://shopify/InventoryItem/${variant.inventory_item_id}` : "",
  }));
  return {
    ...payload,
    shop_domain: normalizeShopDomain(shopDomain),
    admin_graphql_api_id: toStr(payload?.admin_graphql_api_id) || (payload?.id ? `gid://shopify/Product/${payload.id}` : ""),
    variants,
  };
}

async function syncSellerShopifyProductWebhook({
  connection,
  payload = {},
  topic = "",
  updatePrice = false,
  updateStock = false,
  syncTitleImages = false,
}) {
  const sellerCode = toStr(connection?.seller?.sellerCode);
  const productPayload = normalizeShopifyProductWebhookPayload(payload, connection?.shopDomain);
  const syncedProducts = [];
  const unmatchedVariants = [];

  for (const shopifyVariant of asArray(productPayload?.variants)) {
    const match = await matchSellerProductVariant({
      sellerCode,
      shopifyProduct: productPayload,
      shopifyVariant,
      topic,
    });
    if (!match) {
      unmatchedVariants.push({
        sku: toStr(shopifyVariant?.sku),
        barcode: toStr(shopifyVariant?.barcode),
        variantId: toStr(shopifyVariant?.admin_graphql_api_id || shopifyVariant?.id),
      });
      continue;
    }

    const synced = await applyShopifyVariantSync({
      match,
      shopifyProduct: productPayload,
      shopifyVariant,
      updatePrice,
      updateStock,
    });
    if (synced) syncedProducts.push(synced);
  }

  if (syncTitleImages && syncedProducts.length) {
    const matchedProductIds = Array.from(new Set(syncedProducts.map((item) => toStr(item?.productId)).filter(Boolean)));
    const products = await listSellerProductsBySellerCode(sellerCode);
    const normalizedImages = normalizeShopifyImages(productPayload);
    await Promise.all(
      matchedProductIds.map(async (productId) => {
        const row = products.find((item) => item.id === productId);
        if (!row) return;
        await row.ref.set({
          product: {
            ...(row?.data?.product && typeof row.data.product === "object" ? row.data.product : {}),
            title: toStr(productPayload?.title || row?.data?.product?.title),
            titleSlug: normalizeTitleSlug(productPayload?.title || row?.data?.product?.title),
            description: toStr(productPayload?.body_html || row?.data?.product?.description),
            overview: toStr(productPayload?.product_type || row?.data?.product?.overview),
          },
          media: {
            ...(row?.data?.media && typeof row.data.media === "object" ? row.data.media : {}),
            images: normalizedImages.length ? normalizedImages : asArray(row?.data?.media?.images),
          },
          timestamps: {
            ...(row?.data?.timestamps && typeof row.data.timestamps === "object" ? row.data.timestamps : {}),
            updatedAt: FieldValue.serverTimestamp(),
          },
        }, { merge: true });
      }),
    );
  }

  if (productPayload?.variants?.length === 0 && productPayload?.admin_graphql_api_id) {
    const exact = await findSellerProductByShopifyProductId({
      sellerCode,
      shopifyProductId: productPayload.admin_graphql_api_id,
    });
    if (exact) {
      await exact.ref.set({
        placement: {
          ...(exact?.data?.placement && typeof exact.data.placement === "object" ? exact.data.placement : {}),
          supplier_out_of_stock: true,
          in_stock: false,
        },
        moderation: {
          ...(exact?.data?.moderation && typeof exact.data.moderation === "object" ? exact.data.moderation : {}),
          notes: topic === "products/delete"
            ? "This product was deleted in Shopify and should be reviewed in Piessang."
            : toStr(exact?.data?.moderation?.notes),
        },
        integrations: {
          ...(exact?.data?.integrations && typeof exact.data.integrations === "object" ? exact.data.integrations : {}),
          shopify: {
            ...getProductShopifyMeta(exact.data),
            shopDomain: toStr(productPayload?.shop_domain),
            productId: toStr(productPayload?.admin_graphql_api_id),
            title: toStr(productPayload?.title),
            handle: toStr(productPayload?.handle),
            status: toStr(productPayload?.status),
            lastSyncedAt: new Date().toISOString(),
            deletedAt: topic === "products/delete" ? new Date().toISOString() : "",
          },
        },
        timestamps: {
          ...(exact?.data?.timestamps && typeof exact.data.timestamps === "object" ? exact.data.timestamps : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
      }, { merge: true });
      syncedProducts.push({ productId: exact.id, variantIndex: -1 });
    }
  }

  if (topic === "products/create" && unmatchedVariants.length && connection?.autoImportNewProducts) {
    const exactProduct = await findSellerProductByShopifyProductId({
      sellerCode,
      shopifyProductId: productPayload.admin_graphql_api_id,
    });
    const created = exactProduct
      ? null
      : await createDraftProductFromShopify({
          connection,
          shopifyProduct: productPayload,
        });
    return {
      syncedProducts,
      unmatchedVariants,
      preparedImport: Boolean(created),
      importJobId: "",
      createdDraftProduct: created,
    };
  }

  return {
    syncedProducts,
    unmatchedVariants,
    preparedImport: false,
    importJobId: "",
    createdDraftProduct: null,
  };
}

async function syncSellerShopifyInventoryWebhook({
  connection,
  payload = {},
}) {
  const sellerCode = toStr(connection?.seller?.sellerCode);
  const inventoryPayload = {
    inventory_item_id: toStr(payload?.inventory_item_id ? `gid://shopify/InventoryItem/${payload.inventory_item_id}` : payload?.inventory_item_id),
    available: toInt(payload?.available, 0),
  };

  const match = await matchSellerProductVariant({
    sellerCode,
    shopifyProduct: {
      admin_graphql_api_id: "",
      shop_domain: normalizeShopDomain(connection?.shopDomain),
    },
    shopifyVariant: inventoryPayload,
    topic: "inventory_levels/update",
  });

  if (!match) {
    return {
      syncedProducts: [],
      unmatchedVariants: [{ inventoryItemId: inventoryPayload.inventory_item_id }],
    };
  }

  const synced = await applyShopifyVariantSync({
    match,
    shopifyProduct: {
      admin_graphql_api_id: toStr(getProductShopifyMeta(match.data)?.productId),
      shop_domain: normalizeShopDomain(connection?.shopDomain),
    },
    shopifyVariant: {
      inventory_item_id: inventoryPayload.inventory_item_id,
      inventory_quantity: inventoryPayload.available,
    },
    updatePrice: false,
    updateStock: true,
  });

  return {
    syncedProducts: synced ? [synced] : [],
    unmatchedVariants: [],
  };
}

async function createDraftProductFromShopify({
  connection,
  shopifyProduct = {},
}) {
  const db = getAdminDb();
  const sellerCode = toStr(connection?.seller?.sellerCode);
  const existingProduct = await findSellerProductByShopifyProductId({
    sellerCode,
    shopifyProductId: toStr(shopifyProduct?.admin_graphql_api_id || shopifyProduct?.id),
  });
  if (existingProduct) {
    return {
      productId: existingProduct.id,
      variantIds: asArray(existingProduct?.data?.variants).map((variant) => toStr(variant?.variant_id)).filter(Boolean),
      duplicate: true,
    };
  }

  const seen = await collectCatalogueCodesAndBarcodes();
  const productId = await generateUniqueCatalogueCode(seen.codes);
  const vendorName = toStr(connection?.seller?.vendorName || shopifyProduct?.vendor || connection?.shopName);
  const sellerSlug = toStr(connection?.seller?.sellerSlug || toSellerSlug(vendorName));
  const variantsSource = asArray(shopifyProduct?.variants);
  const fallbackImages = normalizeShopifyImages(shopifyProduct);

  const variants = [];
  for (let index = 0; index < variantsSource.length; index += 1) {
    const variant = variantsSource[index] || {};
    const existingVariant = await findSellerVariantByShopifyVariantId({
      sellerCode,
      shopifyVariantId: toStr(variant?.admin_graphql_api_id || variant?.id),
    });
    if (existingVariant) continue;
    const inferred = buildImportedVariantAttributes(shopifyProduct, variant);
    const variantId = await generateUniqueCatalogueCode(seen.codes);
    const sku = await ensureUniqueImportedSku(
      toStr(variant?.sku) || `${normalizeTitleSlug(shopifyProduct?.title || "shopify-product").slice(0, 12)}-${index + 1}`,
      seen.skus,
    );
    const barcode = toStr(variant?.barcode) || await generateUniqueBarcode(seen.barcodes);
    const priceIncl = money2(variant?.price);
    const compareAt = money2(variant?.compare_at_price);
    const inventoryQty = Math.max(0, toInt(variant?.inventory_quantity, 0));

    variants.push({
      variant_id: variantId,
      label: toStr(variant?.title || `Variant ${index + 1}`),
      sku,
      barcode,
      barcodeImageUrl: null,
      color: inferred.color,
      size: inferred.size,
      sizeSystem: inferred.sizeSystem,
      material: inferred.material,
      shade: inferred.shade,
      scent: inferred.scent,
      flavor: inferred.flavor,
      storageCapacity: inferred.storageCapacity,
      connectivity: inferred.connectivity,
      compatibility: inferred.compatibility,
      skinType: inferred.skinType,
      hairType: inferred.hairType,
      containerType: inferred.containerType,
      media: {
        images: fallbackImages,
      },
      placement: {
        is_default: index === 0,
        isActive: false,
        isFeatured: false,
        is_loyalty_eligible: false,
        track_inventory: true,
        continue_selling_out_of_stock: false,
      },
      pricing: {
        supplier_price_excl: 0,
        selling_price_incl: priceIncl > 0 ? priceIncl : 0,
        selling_price_excl: priceIncl > 0 ? moneyInclToExcl(priceIncl) : 0,
        cost_price_excl: 0,
        rebate_eligible: true,
      },
      sale: {
        is_on_sale: compareAt > priceIncl && priceIncl > 0,
        disabled_by_admin: false,
        discount_percent: compareAt > priceIncl && compareAt > 0 ? Math.max(0, Math.round((1 - priceIncl / compareAt) * 100)) : 0,
        sale_price_incl: compareAt > priceIncl ? priceIncl : 0,
        sale_price_excl: compareAt > priceIncl ? moneyInclToExcl(priceIncl) : 0,
        qty_available: 0,
      },
      pack: {
        unit_count: 1,
        volume: 0,
        volume_unit: "each",
      },
      logistics: {
        weight_kg: inferred.weightKg,
        length_cm: 0,
        width_cm: 0,
        height_cm: 0,
        monthly_sales_30d: 0,
        stock_qty: inventoryQty,
        warehouse_id: null,
        volume_cm3: 0,
      },
      inventory: [],
      integrations: {
        shopify: {
          variantId: toStr(variant?.admin_graphql_api_id || variant?.id),
          inventoryItemId: toStr(variant?.admin_graphql_api_id_inventory_item || variant?.inventory_item_id),
          sku: toStr(variant?.sku),
          barcode: toStr(variant?.barcode),
          importedAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
        },
      },
    });
  }

  if (!variants.length) {
    return {
      productId: "",
      variantIds: [],
      duplicate: true,
    };
  }

  const body = {
    docId: productId,
    seller: {
      sellerCode: sellerCode || null,
      sellerSlug: sellerSlug || null,
      vendorName: vendorName || null,
    },
    grouping: {
      category: "",
      subCategory: "",
      brand: "",
    },
    placement: {
      position: 0,
      isActive: false,
      isFeatured: false,
      supplier_out_of_stock: !variants.some((variant) => Number(variant?.logistics?.stock_qty || 0) > 0),
      in_stock: variants.some((variant) => Number(variant?.logistics?.stock_qty || 0) > 0),
      inventory_tracking: true,
    },
    media: {
      color: null,
      images: fallbackImages,
      video: null,
      icon: null,
    },
    product: {
      unique_id: productId,
      sku: await ensureUniqueImportedSku(`${normalizeTitleSlug(shopifyProduct?.title || "shopify-product").slice(0, 18)}-MAIN`, seen.skus),
      title: toStr(shopifyProduct?.title || "Imported Shopify product"),
      titleSlug: normalizeTitleSlug(shopifyProduct?.title || productId),
      brand: "",
      brandTitle: toStr(shopifyProduct?.vendor),
      brandCode: null,
      brandStatus: "pending",
      brandRequestId: null,
      sellerSlug: sellerSlug || null,
      sellerCode: sellerCode || null,
      overview: toStr(shopifyProduct?.product_type),
      description: toStr(shopifyProduct?.body_html),
      vendorDescription: null,
      keywords: [],
      vendorName: vendorName || null,
    },
    moderation: {
      status: "draft",
      reason: "shopify_import",
      notes: "Imported from Shopify. Category and subcategory still need to be set in Piessang.",
      reviewedAt: null,
      reviewedBy: null,
    },
    fulfillment: {
      mode: "seller",
      commission_rate: null,
      lead_time_days: null,
      cutoff_time: null,
      locked: true,
      change_request: null,
    },
    variants,
    inventory: [],
    timestamps: {
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    marketplace: buildOfferGroupMetadata({
      sellerCode,
      variants,
    }),
    integrations: {
      shopify: {
        shopDomain: normalizeShopDomain(connection?.shopDomain),
        productId: toStr(shopifyProduct?.admin_graphql_api_id || shopifyProduct?.id),
        title: toStr(shopifyProduct?.title),
        handle: toStr(shopifyProduct?.handle),
        status: toStr(shopifyProduct?.status),
        importedAt: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString(),
      },
    },
  };

  await db.collection("products_v2").doc(productId).set(body);
  return {
    productId,
    variantIds: variants.map((variant) => toStr(variant?.variant_id)),
  };
}

export async function prepareSellerShopifyImport({
  sellerCode = "",
  sellerSlug = "",
}) {
  const db = getAdminDb();
  const connection = await getSellerShopifyConnection({ sellerCode, sellerSlug });
  if (!connection?.connected || !connection?.shopDomain) {
    throw new Error("Connect and verify a Shopify store before preparing an import.");
  }

  const configSnap = await db.collection(CONFIG_COLLECTION).doc(safeConfigId({ sellerCode, sellerSlug })).get();
  const config = configSnap.data() || {};
  const token = await getValidSellerShopifyAccessToken({ sellerCode, sellerSlug });
  if (!token) throw new Error("Saved Shopify token missing. Reconnect the store.");

  const previewProducts = await listShopifyPreviewProducts({ shopDomain: connection.shopDomain, adminAccessToken: token, limit: 20 });
  const ref = db.collection(JOB_COLLECTION).doc();
  await ref.set({
    seller: {
      connectionId: safeConfigId({ sellerCode, sellerSlug }),
      sellerCode: toStr(sellerCode),
      sellerSlug: toStr(sellerSlug),
      vendorName: toStr(connection?.shopName || config?.seller?.vendorName),
    },
    connection: {
      shopDomain: connection.shopDomain,
      shopName: connection.shopName,
    },
    status: "ready",
    syncMode: toStr(connection.syncMode || "import_once"),
    importStatus: toStr(connection.importStatus || "draft"),
    totals: {
      products: previewProducts.length,
      variants: previewProducts.reduce((sum, item) => sum + Number(item?.variantCount || 0), 0),
    },
    previewProducts,
    timestamps: {
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
  });

  await db.collection(CONFIG_COLLECTION).doc(safeConfigId({ sellerCode, sellerSlug })).set({
    lastPreparedImportAt: FieldValue.serverTimestamp(),
    lastPreview: {
      fetchedAt: FieldValue.serverTimestamp(),
      totals: {
        products: previewProducts.length,
        variants: previewProducts.reduce((sum, item) => sum + Number(item?.variantCount || 0), 0),
      },
      products: previewProducts,
    },
    timestamps: {
      updatedAt: FieldValue.serverTimestamp(),
    },
  }, { merge: true });

  const selection = await buildPreparedImportSelection({
    sellerCode,
    previewProducts,
  });

  return {
    id: ref.id,
    status: "ready",
    totals: {
      products: previewProducts.length,
      variants: previewProducts.reduce((sum, item) => sum + Number(item?.variantCount || 0), 0),
    },
    previewProducts,
    selection,
  };
}

export async function importSelectedSellerShopifyProducts({
  sellerCode = "",
  sellerSlug = "",
  vendorName = "",
  jobId = "",
  productIds = [],
}) {
  const db = getAdminDb();
  const normalizedJobId = toStr(jobId);
  if (!normalizedJobId) throw new Error("Missing prepared import job.");

  const connection = await getSellerShopifyConnection({ sellerCode, sellerSlug });
  if (!connection?.connected || !connection?.shopDomain) {
    throw new Error("Connect and verify a Shopify store before importing products.");
  }

  const jobSnap = await db.collection(JOB_COLLECTION).doc(normalizedJobId).get();
  if (!jobSnap.exists) throw new Error("Prepared Shopify import job not found.");
  const job = jobSnap.data() || {};
  const selectedIds = Array.from(new Set(asArray(productIds).map((item) => toStr(item)).filter(Boolean)));
  if (!selectedIds.length) throw new Error("Select at least one Shopify product to import.");

  const previewProducts = asArray(job?.previewProducts);
  const selectedProducts = previewProducts.filter((item) => selectedIds.includes(toStr(item?.id)));
  if (!selectedProducts.length) throw new Error("None of the selected Shopify products were found in the prepared snapshot.");

  const createdProducts = [];
  const skippedProducts = [];

  for (const previewProduct of selectedProducts) {
    const normalized = normalizePreparedProductForImport(previewProduct);
    const created = await createDraftProductFromShopify({
      connection: {
        ...connection,
        seller: {
          sellerCode: toStr(sellerCode),
          sellerSlug: toStr(sellerSlug),
          vendorName: toStr(vendorName || connection?.seller?.vendorName || connection?.shopName),
        },
      },
      shopifyProduct: normalized,
    });

    if (created?.duplicate || !toStr(created?.productId)) {
      skippedProducts.push({
        shopifyProductId: toStr(previewProduct?.id),
        title: toStr(previewProduct?.title),
      });
      continue;
    }

    createdProducts.push({
      shopifyProductId: toStr(previewProduct?.id),
      title: toStr(previewProduct?.title),
      productId: toStr(created?.productId),
      variantIds: asArray(created?.variantIds).map((item) => toStr(item)).filter(Boolean),
    });
  }

  await db.collection(JOB_COLLECTION).doc(normalizedJobId).set({
    status: "imported",
    results: {
      requestedProducts: selectedIds.length,
      createdProducts: createdProducts.length,
      skippedProducts: skippedProducts.length,
      createdProductIds: createdProducts.map((item) => item.productId),
      skippedShopifyProductIds: skippedProducts.map((item) => item.shopifyProductId),
    },
    timestamps: {
      updatedAt: FieldValue.serverTimestamp(),
      importedAt: FieldValue.serverTimestamp(),
    },
  }, { merge: true });

  const selection = await buildPreparedImportSelection({
    sellerCode,
    previewProducts,
  });

  return {
    job: {
      id: normalizedJobId,
      status: "imported",
      totals: {
        products: previewProducts.length,
        variants: previewProducts.reduce((sum, item) => sum + Number(item?.variantCount || 0), 0),
      },
      previewProducts,
      selection,
    },
    createdProducts,
    skippedProducts,
  };
}

async function computeShopifyWebhookSignature(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Buffer.from(signature).toString("base64");
}

export async function verifyShopifyWebhookSignature(payload, headerValue) {
  const secret = getShopifyWebhookSecret();
  if (!secret) {
    const error = new Error("Shopify webhook verification requires the app client secret or SHOPIFY_WEBHOOK_SECRET.");
    error.status = 500;
    throw error;
  }

  const signature = toStr(headerValue);
  if (!payload || !signature) {
    const error = new Error("Missing Shopify webhook signature header.");
    error.status = 400;
    throw error;
  }

  const expected = await computeShopifyWebhookSignature(secret, payload);
  if (signature !== expected) {
    const error = new Error("Shopify webhook signature verification failed.");
    error.status = 401;
    throw error;
  }

  return true;
}

export async function findSellerShopifyConnectionByShopDomain(shopDomain = "") {
  const db = getAdminDb();
  const normalizedDomain = normalizeShopDomain(shopDomain);
  if (!normalizedDomain) return null;

  const snap = await db
    .collection(CONFIG_COLLECTION)
    .where("shopDomain", "==", normalizedDomain)
    .limit(1)
    .get();
  if (snap.empty) return null;

  const doc = snap.docs[0];
  const data = doc.data() || {};
  return {
    connectionId: doc.id,
    seller: {
      sellerCode: toStr(data?.seller?.sellerCode),
      sellerSlug: toStr(data?.seller?.sellerSlug),
      vendorName: toStr(data?.seller?.vendorName),
    },
    syncMode: toStr(data?.syncMode || "import_once"),
    autoSyncPriceStock: toBool(data?.autoSyncPriceStock),
    autoImportNewProducts: toBool(data?.autoImportNewProducts),
    connected: toBool(data?.connected),
    shopDomain: toStr(data?.shopDomain),
    shopName: toStr(data?.shopName),
  };
}

export async function recordSellerShopifyWebhookEvent({
  topic = "",
  shopDomain = "",
  webhookId = "",
  payload = {},
  connection = null,
}) {
  const db = getAdminDb();
  const ref = db.collection(WEBHOOK_EVENT_COLLECTION).doc();
  const syncMode = toStr(connection?.syncMode || "import_once");
  const autoSyncPriceStock = toBool(connection?.autoSyncPriceStock);
  const autoImportNewProducts = toBool(connection?.autoImportNewProducts);

  const allowedActions = [];
  if (autoSyncPriceStock && ["products/update", "inventory_levels/update"].includes(topic)) {
    allowedActions.push("sync_price_stock");
  }
  if (autoImportNewProducts && topic === "products/create") {
    allowedActions.push("create_draft_product");
  }
  if (topic === "products/delete") {
    allowedActions.push("mark_deleted_for_review");
  }

  const status = connection?.connected ? "received" : "ignored";
  await ref.set({
    topic: toStr(topic),
    webhookId: toStr(webhookId || ref.id),
    shopDomain: normalizeShopDomain(shopDomain),
    connectionId: toStr(connection?.connectionId),
    seller: connection?.seller || {},
    status,
    syncMode,
    rules: {
      autoSyncPriceStock,
      autoImportNewProducts,
      categoriesManagedInPiessang: true,
      allowedActions,
    },
    // Store a compact payload so we can inspect and process later without
    // letting Shopify overwrite Piessang-owned fields such as categories.
    payload: payload && typeof payload === "object" ? payload : {},
    timestamps: {
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
  });

  return {
    id: ref.id,
    allowedActions,
    connected: Boolean(connection?.connected),
  };
}

export async function markSellerShopifyWebhookEventProcessed(eventId = "", patch = {}) {
  const id = toStr(eventId);
  if (!id) return;
  const db = getAdminDb();
  await db.collection(WEBHOOK_EVENT_COLLECTION).doc(id).set(
    {
      ...patch,
      timestamps: {
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );
}

export async function processSellerShopifyWebhookEvent({
  eventId = "",
  topic = "",
  shopDomain = "",
  payload = {},
  connection = null,
}) {
  const normalizedTopic = topicToHeaderTopic(topic);
  if (["customers/data_request", "customers/redact", "shop/redact"].includes(normalizedTopic)) {
    await markSellerShopifyWebhookEventProcessed(eventId, {
      status: "processed",
      processing: {
        reason: "compliance_webhook_acknowledged",
        topic: normalizedTopic,
      },
    });
    return {
      ok: true,
      compliance: true,
      topic: normalizedTopic,
    };
  }

  if (!connection?.connected || !connection?.seller) {
    await markSellerShopifyWebhookEventProcessed(eventId, {
      status: "ignored",
      processing: {
        reason: "connection_not_found",
      },
    });
    return { ok: true, ignored: true };
  }

  const sellerCode = toStr(connection?.seller?.sellerCode);
  const sellerSlug = toStr(connection?.seller?.sellerSlug);
  const config = await getSellerShopifyConnection({ sellerCode, sellerSlug });
  if (!config?.connected) {
    await markSellerShopifyWebhookEventProcessed(eventId, {
      status: "ignored",
      processing: {
        reason: "connection_not_active",
      },
    });
    return { ok: true, ignored: true };
  }

  const db = getAdminDb();
  const configSnap = await db.collection(CONFIG_COLLECTION).doc(safeConfigId({ sellerCode, sellerSlug })).get();
  const token = await getValidSellerShopifyAccessToken({ sellerCode, sellerSlug });
  if (!token) {
    await markSellerShopifyWebhookEventProcessed(eventId, {
      status: "failed",
      processing: {
        reason: "missing_token",
      },
    });
    throw new Error("Saved Shopify token missing for webhook processing.");
  }

  const previewProducts = await listShopifyPreviewProducts({
    shopDomain: normalizeShopDomain(shopDomain || config.shopDomain),
    adminAccessToken: token,
    limit: 12,
  });

  const totals = {
    products: previewProducts.length,
    variants: previewProducts.reduce((sum, item) => sum + Number(item?.variantCount || 0), 0),
  };

  await updateSellerShopifyConnectionState({
    sellerCode,
    sellerSlug,
    patch: {
      lastWebhookAt: FieldValue.serverTimestamp(),
      lastWebhookTopic: topicToHeaderTopic(topic),
      lastSyncSummary: {
        topic: normalizedTopic,
        syncedProducts: syncResult.syncedProducts.length,
        unmatchedVariants: syncResult.unmatchedVariants.length,
        preparedImport: Boolean(syncResult.preparedImport),
        createdDraftProductId: toStr(syncResult?.createdDraftProduct?.productId),
        happenedAt: new Date().toISOString(),
      },
      lastPreview: {
        fetchedAt: FieldValue.serverTimestamp(),
        totals,
        products: previewProducts,
      },
    },
  });
  let syncResult = {
    syncedProducts: [],
    unmatchedVariants: [],
    preparedImport: false,
    importJobId: "",
    createdDraftProduct: null,
  };

  if (
    normalizedTopic === "products/update" &&
    config.autoSyncPriceStock
  ) {
    syncResult = await syncSellerShopifyProductWebhook({
      connection,
      payload,
      topic: normalizedTopic,
      updatePrice: true,
      updateStock: true,
      syncTitleImages: true,
    });
  } else if (
    normalizedTopic === "products/create"
  ) {
    syncResult = await syncSellerShopifyProductWebhook({
      connection,
      payload,
      topic: normalizedTopic,
      updatePrice: config.autoSyncPriceStock,
      updateStock: config.autoSyncPriceStock,
      syncTitleImages: true,
    });
  } else if (
    normalizedTopic === "products/delete"
  ) {
    syncResult = await syncSellerShopifyProductWebhook({
      connection,
      payload,
      topic: normalizedTopic,
      updatePrice: false,
      updateStock: false,
    });
  } else if (
    normalizedTopic === "inventory_levels/update" &&
    config.autoSyncPriceStock
  ) {
    syncResult = await syncSellerShopifyInventoryWebhook({
      connection,
      payload,
    });
  }

  await markSellerShopifyWebhookEventProcessed(eventId, {
    status: "processed",
    processing: {
      refreshedPreview: true,
      syncedProducts: syncResult.syncedProducts,
      unmatchedVariants: syncResult.unmatchedVariants,
      preparedImport: Boolean(syncResult.preparedImport),
      importedJobId: toStr(syncResult.importJobId),
      createdDraftProduct: syncResult.createdDraftProduct,
      preservedPiessangCategories: true,
    },
  });

  return {
    ok: true,
    refreshedPreview: true,
    syncedProducts: syncResult.syncedProducts,
    unmatchedVariants: syncResult.unmatchedVariants,
    preparedImport: Boolean(syncResult.preparedImport),
    importJobId: toStr(syncResult.importJobId),
    createdDraftProduct: syncResult.createdDraftProduct,
  };
}
