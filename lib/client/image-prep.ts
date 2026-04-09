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

export async function prepareImageAsset(
  file: File,
  {
    maxDimension = 2200,
    quality = 0.86,
  }: {
    maxDimension?: number;
    quality?: number;
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
    canvas.toBlob(
      (nextBlob) => {
        if (nextBlob) resolve(nextBlob);
        else reject(new Error("Unable to convert this image for the web."));
      },
      "image/webp",
      quality,
    );
  });

  const safeStem = makeSafeFileStem(file.name) || "image";
  const webpFile = new File([blob], `${safeStem}.webp`, { type: "image/webp" });

  return {
    file: webpFile,
    blurHashUrl,
    altText: sanitizeFileName(file.name) || "Image",
    width: targetWidth,
    height: targetHeight,
  };
}
