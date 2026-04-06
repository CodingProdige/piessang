export const runtime = "nodejs";
export const preferredRegion = "fra1";

// app/api/barcodes/generateUniversal/route.js
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp } from "@/lib/firebase/admin";
import bwipjs from "bwip-js";

const ok  = (p={},s=200)=>NextResponse.json({ ok:true,...p },{ status:s });
const err =(s,t,m,e={})=>NextResponse.json({ ok:false,title:t,message:m,...e},{status:s});

/* ---------- Auto-detect barcode type ---------- */
function detectBarcodeType(code) {
  const numeric = /^[0-9]+$/.test(code);
  if (numeric) {
    if (code.length === 8) return "ean8";
    if (code.length === 12) return "upca";
    if (code.length === 13) return "ean13";
    if (code.length === 14) return "itf14";
  }
  if (/^[A-Z0-9]+$/i.test(code)) return "code128";
  return "code128"; // fallback default
}

export async function POST(req) {
  try {
    const app = getAdminApp();
    if (!app) {
      return err(500, "Firebase Not Configured", "Server Firestore access is not configured.");
    }

    const { code } = await req.json();
    if (!code) return err(400, "Missing Code", "Provide a 'code' (barcode serial).");

    const barcodeType = detectBarcodeType(code);

    console.log(`[barcode/generateUniversal] Detected type '${barcodeType}' for code '${code}'`);

    // ✅ Generate barcode as PNG buffer with white background
    const pngBuffer = await bwipjs.toBuffer({
      bcid: barcodeType,        // Barcode type
      text: code,               // Text to encode
      scale: 3,                 // 3x scaling
      height: 12,               // Bar height (mm)
      includetext: true,        // Include human-readable text
      textxalign: "center",     // Center text
      backgroundcolor: 'FFFFFF', // ✅ White background
      inkcolor: '000000',       // ✅ Black bars
    });

    // Upload to Firebase Storage
    const filePath = `barcodes/${code}.png`;
    const storage = getStorage(app);
    const bucketName = process.env.NEXT_PUBLIC_PIESSANG_FIREBASE_STORAGE_BUCKET;
    const bucket = bucketName ? storage.bucket(bucketName) : storage.bucket();
    const fileRef = bucket.file(filePath);
    const token = randomUUID();
    await fileRef.save(pngBuffer, {
      contentType: "image/png",
      metadata: {
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    });
    const encodedPath = encodeURIComponent(filePath);
    const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;

    console.log("[barcode/generateUniversal] ✅ Uploaded successfully", { filePath });

    return ok({
      message: "Barcode generated successfully.",
      data: {
        code,
        type: barcodeType,
        storage_path: filePath,
        barcodeImageUrl: downloadURL,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (e) {
    console.error("[barcode/generateUniversal] 💥 Failed:", e);
    return err(500, "Unexpected Error", "Failed to generate and upload barcode.", {
      error: e.message,
      stack: e.stack?.split("\n").slice(0, 3),
    });
  }
}
