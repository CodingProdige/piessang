import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";

function loadLocalEnvFiles() {
  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    try {
      process.loadEnvFile(filePath);
    } catch (error) {
      console.warn(`Unable to load env file ${filePath}:`, error instanceof Error ? error.message : String(error));
    }
  }
}

loadLocalEnvFiles();

function normalizePrivateKey(value = "") {
  return String(value).replace(/\\n/g, "\n").trim();
}

function getAdminServices() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_PROJECT_ID ||
    "";
  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL ||
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    "";
  const privateKey = normalizePrivateKey(
    process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  );
  const databaseId = process.env.PIESSANG_FIREBASE_DATABASE_ID || "";

  if (!projectId || !clientEmail || !privateKey || !databaseId) {
    throw new Error("Missing Firebase admin env for image backfill.");
  }

  const app =
    getApps().find((entry) => entry.name === "piessang-image-backfill") ||
    initializeApp(
      {
        credential: cert({ projectId, clientEmail, privateKey }),
        storageBucket: process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_STORAGE_BUCKET || undefined,
      },
      "piessang-image-backfill",
    );

  const db = getFirestore(app, databaseId);
  const storage = getStorage(app);
  const bucketName = process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_STORAGE_BUCKET;
  const bucket = bucketName ? storage.bucket(bucketName) : storage.bucket();
  return { db, bucket };
}

function parseArgs(argv) {
  const options = {
    target: "all",
    dryRun: false,
    limit: 0,
    maxDimension: 2200,
    includeAlreadyModern: false,
  };

  for (const argument of argv.slice(2)) {
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--include-already-modern") {
      options.includeAlreadyModern = true;
      continue;
    }
    if (argument.startsWith("--target=")) {
      options.target = argument.slice("--target=".length) || "all";
      continue;
    }
    if (argument.startsWith("--limit=")) {
      options.limit = Math.max(0, Number(argument.slice("--limit=".length)) || 0);
      continue;
    }
    if (argument.startsWith("--max-dimension=")) {
      options.maxDimension = Math.max(1, Number(argument.slice("--max-dimension=".length)) || 2200);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function toStr(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function parseFirebaseStoragePath(url) {
  try {
    const parsed = new URL(toStr(url));
    if (parsed.hostname !== "firebasestorage.googleapis.com") return null;
    const match = parsed.pathname.match(/\/v0\/b\/[^/]+\/o\/(.+)$/);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function isModernFormatPath(storagePath = "") {
  return /\.(webp|avif|heic)$/i.test(storagePath);
}

function buildDownloadUrl(bucketName, storagePath) {
  const token = randomUUID();
  const encodedPath = encodeURIComponent(storagePath);
  return {
    url: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`,
    token,
  };
}

async function downloadToFile(url, destinationPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed with ${response.status} for ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(destinationPath, bytes);
}

async function reencodeToWebp(inputBuffer, maxDimension) {
  const pipeline = sharp(inputBuffer, { failOn: "none" }).rotate();
  const metadata = await pipeline.metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  const longestSide = Math.max(width, height, 1);
  const resizeWidth = width > 0 && width >= height && longestSide > maxDimension ? maxDimension : null;
  const resizeHeight = height > 0 && height > width && longestSide > maxDimension ? maxDimension : null;

  const transformed = pipeline.resize({
    width: resizeWidth || undefined,
    height: resizeHeight || undefined,
    fit: "inside",
    withoutEnlargement: true,
  });

  const output = await transformed.webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
  return {
    bytes: output.data,
    width: output.info.width,
    height: output.info.height,
    format: "webp",
  };
}

async function optimizeAndUploadAsset({ bucket, url, sourceStoragePath, optimizedFolder, maxDimension, dryRun }) {
  const extension = path.extname(sourceStoragePath || new URL(url).pathname) || ".img";
  const tempInputPath = path.join("/tmp", `piessang-image-backfill-${randomUUID()}${extension}`);
  try {
    await downloadToFile(url, tempInputPath);
    const sourceBytes = await readFile(tempInputPath);
    const encoded = await reencodeToWebp(sourceBytes, maxDimension);

    const originalName = path.basename(sourceStoragePath || "image");
    const stem = originalName.replace(/\.[^.]+$/, "") || "image";
    const targetPath = `${optimizedFolder}/${stem}.${encoded.format}`;
    const contentType = "image/webp";

    if (dryRun) {
      return {
        storagePath: targetPath,
        url: `dry-run://${targetPath}`,
        contentType,
      };
    }

    const { url: downloadUrl, token } = buildDownloadUrl(bucket.name, targetPath);
    await bucket.file(targetPath).save(encoded.bytes, {
      contentType,
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
          sourceStoragePath: sourceStoragePath || "",
          optimizedBy: "scripts/backfill-image-assets.mjs",
          optimizedAt: new Date().toISOString(),
          width: String(encoded.width || ""),
          height: String(encoded.height || ""),
        },
      },
    });

    return {
      storagePath: targetPath,
      url: downloadUrl,
      contentType,
    };
  } finally {
    await import("node:fs/promises").then(({ rm }) => rm(tempInputPath, { force: true }));
  }
}

async function transformImageEntries(entries, context) {
  let changed = false;
  let optimizedCount = 0;
  let skippedCount = 0;

  const nextEntries = await Promise.all(
    (Array.isArray(entries) ? entries : []).map(async (entry, index) => {
      const current = entry && typeof entry === "object" ? { ...entry } : entry;
      const imageUrl = toStr(current?.imageUrl || current?.url || current);
      if (!imageUrl) return current;

      const sourceStoragePath = parseFirebaseStoragePath(imageUrl);
      if (!sourceStoragePath) {
        skippedCount += 1;
        return current;
      }
      if (!context.options.includeAlreadyModern && (sourceStoragePath.includes("/optimized/") || isModernFormatPath(sourceStoragePath))) {
        skippedCount += 1;
        return current;
      }

      const optimizedFolder = `${path.posix.dirname(sourceStoragePath)}/optimized`;
      const uploaded = await optimizeAndUploadAsset({
        bucket: context.bucket,
        url: imageUrl,
        sourceStoragePath,
        optimizedFolder,
        maxDimension: context.options.maxDimension,
        dryRun: context.options.dryRun,
      });

      changed = true;
      optimizedCount += 1;

      if (current && typeof current === "object") {
        if ("imageUrl" in current) current.imageUrl = uploaded.url;
        else if ("url" in current) current.url = uploaded.url;
        current.optimizedImage = {
          storagePath: uploaded.storagePath,
          contentType: uploaded.contentType,
          backfilledAt: new Date().toISOString(),
          sourceStoragePath,
        };
        if (typeof current.position !== "number") current.position = index + 1;
        return current;
      }

      return uploaded.url;
    }),
  );

  return { nextEntries, changed, optimizedCount, skippedCount };
}

async function processProducts(context) {
  const snap = await context.db.collection("products_v2").get();
  let docsVisited = 0;
  let docsUpdated = 0;
  let imagesOptimized = 0;
  let imagesSkipped = 0;

  for (const docSnap of snap.docs) {
    if (context.options.limit > 0 && docsUpdated >= context.options.limit) break;
    docsVisited += 1;
    const data = docSnap.data() || {};

    const topLevel = await transformImageEntries(data?.media?.images, context);
    const variants = Array.isArray(data?.variants) ? data.variants : [];
    let variantsChanged = false;
    const nextVariants = [];

    for (const variant of variants) {
      if (!variant || typeof variant !== "object") {
        nextVariants.push(variant);
        continue;
      }
      const result = await transformImageEntries(variant?.media?.images, context);
      imagesOptimized += result.optimizedCount;
      imagesSkipped += result.skippedCount;
      if (result.changed) {
        variantsChanged = true;
        nextVariants.push({
          ...variant,
          media: {
            ...(variant.media || {}),
            images: result.nextEntries,
          },
        });
      } else {
        nextVariants.push(variant);
      }
    }

    imagesOptimized += topLevel.optimizedCount;
    imagesSkipped += topLevel.skippedCount;

    if (!topLevel.changed && !variantsChanged) continue;

    if (!context.options.dryRun) {
      await docSnap.ref.set(
        {
          media: {
            ...(data?.media || {}),
            images: topLevel.changed ? topLevel.nextEntries : data?.media?.images || [],
          },
          variants: variantsChanged ? nextVariants : variants,
          timestamps: {
            ...(data?.timestamps || {}),
            imageBackfillAt: new Date().toISOString(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
    }
    docsUpdated += 1;
  }

  return { docsVisited, docsUpdated, imagesOptimized, imagesSkipped };
}

async function processProductRatings(context) {
  const snap = await context.db.collection("products_v2").get();
  let docsVisited = 0;
  let docsUpdated = 0;
  let imagesOptimized = 0;
  let imagesSkipped = 0;

  for (const docSnap of snap.docs) {
    if (context.options.limit > 0 && docsUpdated >= context.options.limit) break;
    docsVisited += 1;
    const data = docSnap.data() || {};
    const ratings = data?.ratings && typeof data.ratings === "object" ? data.ratings : {};
    const entries = Array.isArray(ratings.entries) ? ratings.entries : [];
    let changed = false;

    const nextEntries = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        nextEntries.push(entry);
        continue;
      }
      const result = await transformImageEntries(entry?.images, context);
      imagesOptimized += result.optimizedCount;
      imagesSkipped += result.skippedCount;
      if (result.changed) {
        changed = true;
        nextEntries.push({
          ...entry,
          images: result.nextEntries,
        });
      } else {
        nextEntries.push(entry);
      }
    }

    if (!changed) continue;

    if (!context.options.dryRun) {
      await docSnap.ref.set(
        {
          ratings: {
            ...ratings,
            entries: nextEntries,
          },
          timestamps: {
            ...(data?.timestamps || {}),
            imageBackfillAt: new Date().toISOString(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
    }
    docsUpdated += 1;
  }

  return { docsVisited, docsUpdated, imagesOptimized, imagesSkipped };
}

async function processSellerRatings(context) {
  const snap = await context.db.collection("seller_ratings_v1").get();
  let docsVisited = 0;
  let docsUpdated = 0;
  let imagesOptimized = 0;
  let imagesSkipped = 0;

  for (const docSnap of snap.docs) {
    if (context.options.limit > 0 && docsUpdated >= context.options.limit) break;
    docsVisited += 1;
    const data = docSnap.data() || {};
    const result = await transformImageEntries(data?.images, context);
    imagesOptimized += result.optimizedCount;
    imagesSkipped += result.skippedCount;
    if (!result.changed) continue;

    if (!context.options.dryRun) {
      await docSnap.ref.set(
        {
          images: result.nextEntries,
          updatedAt: new Date().toISOString(),
          imageBackfillAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }
    docsUpdated += 1;
  }

  return { docsVisited, docsUpdated, imagesOptimized, imagesSkipped };
}

async function processReturns(context) {
  const snap = await context.db.collection("returns_v2").get();
  let docsVisited = 0;
  let docsUpdated = 0;
  let imagesOptimized = 0;
  let imagesSkipped = 0;

  for (const docSnap of snap.docs) {
    if (context.options.limit > 0 && docsUpdated >= context.options.limit) break;
    docsVisited += 1;
    const data = docSnap.data() || {};
    const result = await transformImageEntries(data?.evidence, context);
    imagesOptimized += result.optimizedCount;
    imagesSkipped += result.skippedCount;
    if (!result.changed) continue;

    if (!context.options.dryRun) {
      await docSnap.ref.set(
        {
          evidence: result.nextEntries,
          timestamps: {
            ...(data?.timestamps || {}),
            imageBackfillAt: new Date().toISOString(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );
    }
    docsUpdated += 1;
  }

  return { docsVisited, docsUpdated, imagesOptimized, imagesSkipped };
}

async function main() {
  const options = parseArgs(process.argv);
  const { db, bucket } = getAdminServices();
  const context = { db, bucket, options };
  const tasks = {
    products: processProducts,
    "product-ratings": processProductRatings,
    "seller-ratings": processSellerRatings,
    returns: processReturns,
  };

  const targets =
    options.target === "all"
      ? ["products", "product-ratings", "seller-ratings", "returns"]
      : options.target.split(",").map((entry) => entry.trim()).filter(Boolean);

  for (const target of targets) {
    if (!tasks[target]) {
      throw new Error(`Unsupported target "${target}". Use all, products, product-ratings, seller-ratings, or returns.`);
    }
  }

  const summary = {
    dryRun: options.dryRun,
    maxDimension: options.maxDimension,
    includeAlreadyModern: options.includeAlreadyModern,
    bucket: bucket.name,
    targets: {},
  };

  for (const target of targets) {
    console.log(`Processing ${target}...`);
    summary.targets[target] = await tasks[target](context);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
