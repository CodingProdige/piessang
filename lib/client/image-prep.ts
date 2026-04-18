"use client";

import { encode } from "blurhash";

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeFileName(value: string) {
  return String(value ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function makeSafeFileStem(value: string) {
  return String(value ?? "image")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9.-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

type PreparedImageAsset = {
  file: File;
  blurHashUrl: string;
  altText: string;
  width: number;
  height: number;
};

function getTargetMimeType(format: "webp" | "jpeg" | "png") {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  return "image/webp";
}

function getTargetExtension(format: "webp" | "jpeg" | "png") {
  if (format === "jpeg") return "jpg";
  return format;
}

export async function prepareImageAsset(
  file: File,
  {
    maxDimension = 2200,
    quality = 0.86,
    format = "webp",
  }: {
    maxDimension?: number;
    quality?: number;
    format?: "webp" | "jpeg" | "png";
  } = {},
): Promise<PreparedImageAsset> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload an image file.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
  const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!context) {
    throw new Error("Unable to prepare this image.");
  }

  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  const blurWidth = clampNumber(Math.min(32, targetWidth), 1, 32);
  const blurHeight = clampNumber(Math.max(1, Math.round((targetHeight / targetWidth) * blurWidth)), 1, 32);
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = blurWidth;
  blurCanvas.height = blurHeight;
  const blurContext = blurCanvas.getContext("2d", { willReadFrequently: true });
  if (!blurContext) {
    throw new Error("Unable to prepare this image preview.");
  }
  blurContext.drawImage(canvas, 0, 0, blurWidth, blurHeight);
  const blurImageData = blurContext.getImageData(0, 0, blurWidth, blurHeight);
  const blurHashUrl = encode(blurImageData.data, blurImageData.width, blurImageData.height, 4, 3);

  const blob = await new Promise<Blob>((resolve, reject) => {
    const mimeType = getTargetMimeType(format);
    canvas.toBlob(
      (nextBlob) => {
        if (nextBlob) resolve(nextBlob);
        else reject(new Error("Unable to convert this image for the web."));
      },
      mimeType,
      quality,
    );
  });

  const safeStem = makeSafeFileStem(file.name) || "image";
  const outputExtension = getTargetExtension(format);
  const outputMimeType = getTargetMimeType(format);
  const outputFile = new File([blob], `${safeStem}.${outputExtension}`, { type: outputMimeType });

  return {
    file: outputFile,
    blurHashUrl,
    altText: sanitizeFileName(file.name) || "Image",
    width: targetWidth,
    height: targetHeight,
  };
}
