export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp } from "@/lib/firebase/admin";
import { getServerAuthBootstrap } from "@/lib/auth/server";
import ffmpegStatic from "ffmpeg-static";

const ok = (payload = {}, status = 200) => NextResponse.json({ ok: true, ...payload }, { status });
const err = (status, title, message, extra = {}) => NextResponse.json({ ok: false, title, message, ...extra }, { status });

function toStr(value, fallback = "") {
  if (value == null) return fallback;
  return String(value).trim();
}

function safeFileStem(value) {
  const stem = toStr(value, "product-video")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return stem || "product-video";
}

function firebaseDownloadUrl(bucketName, filePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
}

function runFfmpeg(args, label) {
  const ffmpegPath = toStr(process.env.FFMPEG_PATH || ffmpegStatic, "ffmpeg");
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 5000) stderr = stderr.slice(-5000);
    });
    child.on("error", (cause) => {
      reject(new Error(`${label} failed to start. Make sure FFmpeg is available to the API runtime. ${cause?.message || ""}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed with code ${code}. ${stderr}`.trim()));
    });
  });
}

async function savePublicFile(bucket, filePath, localPath, contentType) {
  const token = randomUUID();
  await bucket.upload(localPath, {
    destination: filePath,
    metadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });
  return firebaseDownloadUrl(bucket.name, filePath, token);
}

export async function POST(req) {
  const auth = await getServerAuthBootstrap();
  const profile = auth?.profile || null;
  if (!profile?.uid) return err(401, "Unauthorized", "Sign in again to process video media.");

  const app = getAdminApp();
  if (!app) return err(500, "Firebase Not Configured", "Server Firebase access is not configured.");

  let workDir = "";
  try {
    const body = await req.json().catch(() => ({}));
    const sourceUrl = toStr(body?.sourceUrl || body?.videoUrl || body?.url);
    const fileName = toStr(body?.fileName, "product-video.mp4");
    if (!sourceUrl) return err(400, "Missing Video", "Provide a sourceUrl to process.");

    const response = await fetch(sourceUrl);
    if (!response.ok) {
      return err(400, "Video Download Failed", "Unable to download the uploaded video for processing.", {
        status: response.status,
      });
    }

    const id = randomUUID();
    const stem = safeFileStem(fileName);
    workDir = join(tmpdir(), `piessang-video-${id}`);
    await mkdir(workDir, { recursive: true });

    const inputPath = join(workDir, "source-video");
    const playbackPath = join(workDir, "playback-720p.mp4");
    const previewPath = join(workDir, "preview-360p.mp4");
    const posterPath = join(workDir, "poster.jpg");
    const arrayBuffer = await response.arrayBuffer();
    await writeFile(inputPath, Buffer.from(arrayBuffer));

    await runFfmpeg(
      [
        "-y",
        "-i",
        inputPath,
        "-vf",
        "scale=1280:720:force_original_aspect_ratio=decrease",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "24",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        playbackPath,
      ],
      "720p playback encode",
    );

    await runFfmpeg(
      [
        "-y",
        "-i",
        inputPath,
        "-vf",
        "scale=640:360:force_original_aspect_ratio=decrease",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "30",
        "-movflags",
        "+faststart",
        previewPath,
      ],
      "360p preview encode",
    );

    await runFfmpeg(
      [
        "-y",
        "-ss",
        "1",
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-vf",
        "scale=1280:720:force_original_aspect_ratio=decrease",
        posterPath,
      ],
      "poster extraction",
    );

    const storage = getStorage(app);
    const bucketName = process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_STORAGE_BUCKET;
    const bucket = bucketName ? storage.bucket(bucketName) : storage.bucket();
    const basePath = `users/${profile.uid}/uploads/videos/processed/${id}`;

    const [videoUrl, previewUrl, posterUrl] = await Promise.all([
      savePublicFile(bucket, `${basePath}/${stem}-720p.mp4`, playbackPath, "video/mp4"),
      savePublicFile(bucket, `${basePath}/${stem}-360p-preview.mp4`, previewPath, "video/mp4"),
      savePublicFile(bucket, `${basePath}/${stem}-poster.jpg`, posterPath, "image/jpeg"),
    ]);

    return ok({
      data: {
        sourceUrl,
        videoUrl,
        previewUrl,
        posterUrl,
        processingStatus: "ready",
      },
    });
  } catch (cause) {
    console.error("[products/videos/process] failed:", cause);
    return err(500, "Video Processing Failed", "Unable to process this video right now.", {
      details: toStr(cause?.message).slice(0, 900),
    });
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
