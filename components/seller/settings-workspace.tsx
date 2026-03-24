"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { decode, encode } from "blurhash";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { useAuth } from "@/components/auth/auth-provider";
import { BlurhashImage } from "@/components/shared/blurhash-image";
import { clientStorage } from "@/lib/firebase";

type SellerBranding = {
  bannerImageUrl: string;
  bannerBlurHashUrl: string;
  bannerAltText: string;
  bannerObjectPosition: string;
  logoImageUrl: string;
  logoBlurHashUrl: string;
  logoAltText: string;
  logoObjectPosition: string;
};

type SellerSettingsWorkspaceProps = {
  sellerSlug: string;
  vendorName: string;
  sellerRole: string;
  isSystemAdmin?: boolean;
};

const EMPTY_BRANDING: SellerBranding = {
  bannerImageUrl: "",
  bannerBlurHashUrl: "",
  bannerAltText: "",
  bannerObjectPosition: "center center",
  logoImageUrl: "",
  logoBlurHashUrl: "",
  logoAltText: "",
  logoObjectPosition: "center center",
};

const BANNER_RATIOS = ["3:1", "16:9", "2:1"];
const LOGO_RATIOS = ["1:1", "4:3"];

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function sanitizeVendorName(value: unknown) {
  return toStr(value).replace(/\s+/g, " ").trim().slice(0, 30);
}

function sanitizeFileName(value: string) {
  return toStr(value)
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizePlacement(value: unknown) {
  const candidate = toStr(value, "center center").toLowerCase();
  const percentageMatch = candidate.match(/^(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/);
  if (percentageMatch) {
    const x = clampNumber(Number.parseFloat(percentageMatch[1]), 0, 100);
    const y = clampNumber(Number.parseFloat(percentageMatch[2]), 0, 100);
    return `${x.toFixed(1)}% ${y.toFixed(1)}%`;
  }
  const allowed = new Set(["left center", "center top", "center center", "center bottom", "right center"]);
  return allowed.has(candidate) ? candidate : "center center";
}

function parsePlacement(value: string) {
  const match = normalizePlacement(value).match(/^(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/);
  if (match) {
    return {
      x: clampNumber(Number.parseFloat(match[1]), 0, 100),
      y: clampNumber(Number.parseFloat(match[2]), 0, 100),
    };
  }

  switch (normalizePlacement(value)) {
    case "left center":
      return { x: 0, y: 50 };
    case "center top":
      return { x: 50, y: 0 };
    case "center bottom":
      return { x: 50, y: 100 };
    case "right center":
      return { x: 100, y: 50 };
    case "center center":
    default:
      return { x: 50, y: 50 };
  }
}

function placementToString(x: number, y: number) {
  return `${clampNumber(x, 0, 100).toFixed(1)}% ${clampNumber(y, 0, 100).toFixed(1)}%`;
}

function useSellerAccessLabel(role: string) {
  return useMemo(() => {
    const value = String(role ?? "").trim().toLowerCase();
    if (value === "owner") return "Seller account owner";
    if (value === "admin") return "Seller dashboard admin";
    if (value === "manager") return "Manager";
    if (value === "catalogue") return "Catalogue";
    if (value === "orders") return "Orders";
    if (value === "analytics") return "Analytics";
    return value || "Seller role";
  }, [role]);
}

export function SellerSettingsWorkspace({
  sellerSlug,
  vendorName,
  sellerRole,
  isSystemAdmin = false,
}: SellerSettingsWorkspaceProps) {
  const { profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [branding, setBranding] = useState<SellerBranding>(EMPTY_BRANDING);
  const [vendorNameValue, setVendorNameValue] = useState(vendorName);
  const [vendorDescriptionValue, setVendorDescriptionValue] = useState("");
  const [sellerCodeValue, setSellerCodeValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [bannerDragging, setBannerDragging] = useState(false);
  const [sellerCodeCopied, setSellerCodeCopied] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; tone?: "success" | "error" } | null>(null);
  const [sellerNameCheck, setSellerNameCheck] = useState<{
    checking: boolean;
    unique: boolean | null;
    suggestions: string[];
  }>({
    checking: false,
    unique: null,
    suggestions: [],
  });
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const bannerStageRef = useRef<HTMLDivElement | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const snackbarTimeoutRef = useRef<number | null>(null);

  const canEditSettings = Boolean(isSystemAdmin || ["owner", "admin"].includes(String(sellerRole ?? "").trim().toLowerCase()));
  const canDeleteSeller = Boolean(isSystemAdmin || String(sellerRole ?? "").trim().toLowerCase() === "owner");
  const publicVendorHref = sellerSlug ? `/vendors/${sellerSlug}` : "/products";

  const bannerPosition = useMemo(
    () => parsePlacement(branding.bannerObjectPosition || "50% 50%"),
    [branding.bannerObjectPosition],
  );
  
  function showSnackbar(message: string, tone: "success" | "error" = "success") {
    setSnackbar({ message, tone });
    if (snackbarTimeoutRef.current) window.clearTimeout(snackbarTimeoutRef.current);
    snackbarTimeoutRef.current = window.setTimeout(() => setSnackbar(null), 1800);
  }

  useEffect(() => {
    const fallbackSellerCode = toStr(profile?.sellerCode);
    if (!sellerCodeValue && fallbackSellerCode) {
      setSellerCodeValue(fallbackSellerCode);
    }
  }, [profile?.sellerCode, sellerCodeValue]);

  useEffect(() => {
    if (!canEditSettings) return;

    const nextVendorName = sanitizeVendorName(vendorNameValue || vendorName);
    if (!nextVendorName || nextVendorName.length < 3) {
      setSellerNameCheck({ checking: false, unique: null, suggestions: [] });
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSellerNameCheck((current) => ({ ...current, checking: true }));

      try {
        const response = await fetch("/api/client/v1/accounts/seller/check-vendor-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: profile?.uid,
            sellerSlug,
            vendorName: nextVendorName,
          }),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to validate vendor name.");
        }

        setSellerNameCheck({
          checking: false,
          unique: payload?.unique === true,
          suggestions: Array.isArray(payload?.suggestions) ? payload.suggestions : [],
        });
      } catch {
        if (!controller.signal.aborted) {
          setSellerNameCheck({ checking: false, unique: null, suggestions: [] });
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [canEditSettings, profile?.uid, sellerSlug, vendorName, vendorNameValue]);

  useEffect(() => {
    let cancelled = false;

    async function loadBranding() {
      if (!sellerSlug) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/client/v1/accounts/seller/settings/get?sellerSlug=${encodeURIComponent(sellerSlug)}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load seller settings.");
        }

        const sellerRecord = payload?.seller && typeof payload.seller === "object" ? payload.seller : null;
        const nextBranding = payload?.branding && typeof payload.branding === "object" ? payload.branding : {};
        if (!cancelled && sellerRecord) {
          const nextVendorName = sanitizeVendorName(
            sellerRecord.vendorName || sellerRecord.groupVendorName || vendorName,
          );
          const nextVendorDescription = toStr(
            sellerRecord.vendorDescription || sellerRecord.description || "",
          ).slice(0, 500);
          setBranding({
            bannerImageUrl: toStr(nextBranding?.bannerImageUrl || nextBranding?.bannerUrl),
            bannerBlurHashUrl: toStr(nextBranding?.bannerBlurHashUrl || nextBranding?.bannerBlurHash),
            bannerAltText: toStr(nextBranding?.bannerAltText || nextBranding?.bannerAlt || `${nextVendorName || vendorName} banner`),
            bannerObjectPosition: normalizePlacement(nextBranding?.bannerObjectPosition),
            logoImageUrl: toStr(nextBranding?.logoImageUrl || nextBranding?.logoUrl),
            logoBlurHashUrl: toStr(nextBranding?.logoBlurHashUrl || nextBranding?.logoBlurHash),
            logoAltText: toStr(nextBranding?.logoAltText || nextBranding?.logoAlt || `${nextVendorName || vendorName} logo`),
            logoObjectPosition: normalizePlacement(nextBranding?.logoObjectPosition),
          });
          setVendorNameValue(nextVendorName || vendorName);
          setVendorDescriptionValue(nextVendorDescription);
          setSellerCodeValue(
            toStr(
              sellerRecord.sellerCode ||
                sellerRecord.activeSellerCode ||
                sellerRecord.groupSellerCode ||
                profile?.sellerCode,
            ),
          );
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load seller settings.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadBranding();

    return () => {
      cancelled = true;
    };
  }, [sellerSlug, vendorName]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      if (snackbarTimeoutRef.current) window.clearTimeout(snackbarTimeoutRef.current);
    };
  }, []);

  async function fileToBlurHash(file: File) {
    const bitmap = await createImageBitmap(file);
    const width = 32;
    const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Unable to process image preview.");
    context.drawImage(bitmap, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    return encode(imageData.data, imageData.width, imageData.height, 4, 3);
  }

  async function uploadAsset(file: File, kind: "banner" | "logo") {
    if (!profile?.uid) throw new Error("Missing seller profile.");
    if (!file.type.startsWith("image/")) throw new Error("Please upload an image file.");

    const blurHashUrl = await fileToBlurHash(file);
    const safeName = file.name.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase();
    const path = `users/${profile.uid}/seller-branding/${sellerSlug}-${kind}-${Date.now()}-${safeName}`;
    const fileRef = storageRef(clientStorage, path);
    await uploadBytes(fileRef, file, { contentType: file.type });
    const imageUrl = await getDownloadURL(fileRef);

    return {
      imageUrl,
      blurHashUrl,
      altText: sanitizeFileName(file.name) || `${vendorName} ${kind}`,
    };
  }

  async function handleUpload(kind: "banner" | "logo", file?: File | null) {
    if (!file) return;
    setError(null);
    setMessage(null);

    if (kind === "banner") setBannerUploading(true);
    if (kind === "logo") setLogoUploading(true);

    try {
      const asset = await uploadAsset(file, kind);
      setBranding((current) => ({
        ...current,
        ...(kind === "banner"
          ? {
              bannerImageUrl: asset.imageUrl,
              bannerBlurHashUrl: asset.blurHashUrl,
              bannerAltText: asset.altText,
              bannerObjectPosition: "50% 50%",
            }
          : {
              logoImageUrl: asset.imageUrl,
              logoBlurHashUrl: asset.blurHashUrl,
              logoAltText: asset.altText,
            }),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload image.");
    } finally {
      if (kind === "banner") setBannerUploading(false);
      if (kind === "logo") setLogoUploading(false);
      if (bannerInputRef.current && kind === "banner") bannerInputRef.current.value = "";
      if (logoInputRef.current && kind === "logo") logoInputRef.current.value = "";
    }
  }

  async function saveSettings() {
    if (!canEditSettings) {
      setError("You do not have permission to change seller settings.");
      return;
    }
    const nextVendorName = sanitizeVendorName(vendorNameValue || vendorName);
    if (!nextVendorName) {
      setError("Vendor name is required.");
      return;
    }
    if (sellerNameCheck.checking) {
      setError("Wait for the vendor name check to finish.");
      return;
    }
    if (sellerNameCheck.unique === false) {
      setError("Choose a unique vendor name before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/settings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile?.uid,
          sellerSlug,
          data: {
            branding,
            vendorName: nextVendorName,
            vendorDescription: vendorDescriptionValue,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to save seller settings.");
      }

      const nextBranding = payload?.branding || branding;
      const nextSeller = payload?.seller || {};
      setBranding({
        bannerImageUrl: toStr(nextBranding?.bannerImageUrl),
        bannerBlurHashUrl: toStr(nextBranding?.bannerBlurHashUrl),
        bannerAltText: toStr(nextBranding?.bannerAltText),
        bannerObjectPosition: normalizePlacement(nextBranding?.bannerObjectPosition),
        logoImageUrl: toStr(nextBranding?.logoImageUrl),
        logoBlurHashUrl: toStr(nextBranding?.logoBlurHashUrl),
        logoAltText: toStr(nextBranding?.logoAltText),
        logoObjectPosition: normalizePlacement(nextBranding?.logoObjectPosition),
      });
      setVendorNameValue(sanitizeVendorName(nextSeller?.vendorName || nextVendorName));
      setVendorDescriptionValue(toStr(nextSeller?.vendorDescription || vendorDescriptionValue).slice(0, 500));
      setSellerCodeValue(toStr(nextSeller?.sellerCode || sellerCodeValue));
      setMessage("Seller settings saved.");
      await refreshProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save seller settings.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSellerAccount() {
    if (!canDeleteSeller) {
      setError("You do not have permission to delete this seller account.");
      return;
    }
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile?.uid,
          sellerSlug,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to delete seller account.");
      }
      await refreshProfile();
      window.location.href = "/seller/dashboard";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete seller account.");
    } finally {
      setDeleting(false);
    }
  }

  function updateBannerPosition(clientX: number, clientY: number) {
    const stage = bannerStageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = clampNumber(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clampNumber(((clientY - rect.top) / rect.height) * 100, 0, 100);
    setBranding((current) => ({
      ...current,
      bannerObjectPosition: placementToString(x, y),
    }));
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <Link
          href={publicVendorHref}
          className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c] transition-colors hover:text-[#6f5d2d]"
        >
          View Public <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="rounded-[8px] border border-black/5 bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Vendor profile</p>
            <h4 className="mt-1 text-[18px] font-semibold text-[#202020]">Update your seller identity</h4>
            <p className="mt-1 text-[12px] text-[#57636c]">
              Keep your vendor name and description current. Your seller code stays fixed and is used across Piessang.
            </p>
          </div>
          <div className="rounded-[8px] border border-black/10 bg-[rgba(32,32,32,0.03)] px-3 py-2 text-[12px] text-[#57636c]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b94a3]">Seller code</p>
            <p className="mt-1 font-semibold text-[#202020]">{sellerCodeValue || "Will be generated"}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Vendor name</span>
            <input
              value={vendorNameValue}
              onChange={(event) => setVendorNameValue(sanitizeVendorName(event.target.value))}
              onBlur={(event) => setVendorNameValue(sanitizeVendorName(event.target.value))}
              placeholder="Your vendor name"
              disabled={!canEditSettings}
              className={`w-full rounded-[8px] bg-white px-3 py-2.5 text-[13px] outline-none transition-colors disabled:bg-[#f7f7f7] ${
                sellerNameCheck.unique === true
                  ? "border border-[#39a96b] bg-[rgba(57,169,107,0.06)] focus:border-[#39a96b]"
                  : sellerNameCheck.unique === false
                    ? "border border-[#d11c1c] focus:border-[#d11c1c]"
                    : "border border-black/10 focus:border-[#cbb26b]"
              }`}
            />
            <p className="mt-1 text-[11px] leading-[1.4] text-[#57636c]">
              This must be unique across Piessang sellers.
            </p>
            {sellerNameCheck.checking ? (
              <p className="mt-1 text-[11px] font-medium text-[#907d4c]">Checking availability...</p>
            ) : sellerNameCheck.unique === true ? (
              <p className="mt-1 text-[11px] font-semibold text-[#39a96b]">Vendor name available.</p>
            ) : sellerNameCheck.unique === false ? (
              <div className="mt-2 rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-3 py-2">
                <p className="text-[11px] font-semibold text-[#b91c1c]">Vendor name already exists.</p>
                {sellerNameCheck.suggestions.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sellerNameCheck.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setVendorNameValue(suggestion)}
                        className="inline-flex items-center rounded-[8px] border border-[#d9b5b8] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#907d4c]"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Seller code</span>
            <div className="flex items-center gap-2 rounded-[8px] border border-black/10 bg-[#fafafa] px-3 py-2.5 text-[13px] text-[#202020]">
              <span className="truncate font-mono font-semibold">{sellerCodeValue || "Will be generated automatically"}</span>
              {sellerCodeValue ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(sellerCodeValue);
                      setSellerCodeCopied(true);
                      showSnackbar("Seller code copied.");
                      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
                      copyTimeoutRef.current = window.setTimeout(() => setSellerCodeCopied(false), 1600);
                    } catch {
                      setError("Unable to copy seller code.");
                      showSnackbar("Unable to copy seller code.", "error");
                    }
                  }}
                  className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-black/10 bg-white px-2.5 text-[11px] font-semibold text-[#202020]"
                >
                  {sellerCodeCopied ? (
                    <>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
                        <path
                          d="M5 12.5 10 17 19 7.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Copied
                    </>
                  ) : (
                    "Copy"
                  )}
                </button>
              ) : null}
            </div>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Vendor description</span>
          <textarea
            value={vendorDescriptionValue}
            onChange={(event) => setVendorDescriptionValue(event.target.value.slice(0, 500))}
            placeholder="Tell buyers and team members what your vendor account is about..."
            disabled={!canEditSettings}
            rows={4}
            className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[#cbb26b] disabled:bg-[#f7f7f7]"
          />
          <p className="mt-1 text-[11px] text-[#8b94a3]">Optional. Keep it short and clear.</p>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[8px] border border-black/5 bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Branding</p>
              <h4 className="mt-1 text-[18px] font-semibold text-[#202020]">Banner image</h4>
              <p className="mt-1 text-[12px] text-[#57636c]">
                Suggested ratio: {BANNER_RATIOS.join(" or ")}. Drag the image inside the frame to reposition it.
              </p>
            </div>
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              disabled={!canEditSettings || bannerUploading}
              className="inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bannerUploading ? "Uploading..." : "Upload"}
            </button>
          </div>

          <div
            ref={bannerStageRef}
            className={`mt-4 overflow-hidden rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] ${
              canEditSettings ? "cursor-grab active:cursor-grabbing" : ""
            }`}
            onPointerDown={(event) => {
              if (!canEditSettings || !branding.bannerImageUrl) return;
              setBannerDragging(true);
              updateBannerPosition(event.clientX, event.clientY);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!bannerDragging || !canEditSettings || !branding.bannerImageUrl) return;
              updateBannerPosition(event.clientX, event.clientY);
            }}
            onPointerUp={() => setBannerDragging(false)}
            onPointerCancel={() => setBannerDragging(false)}
            onLostPointerCapture={() => setBannerDragging(false)}
          >
            <div className="relative aspect-[3/1] w-full bg-[#fff]">
              {branding.bannerImageUrl ? (
                <BlurhashImage
                  src={branding.bannerImageUrl}
                  blurHash={branding.bannerBlurHashUrl}
                  alt={branding.bannerAltText || `${vendorName} banner`}
                  className="h-full w-full"
                  imageClassName="object-cover"
                  imageStyle={{ objectPosition: branding.bannerObjectPosition || "50% 50%" }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-center text-[12px] text-[#8b94a3]">
                  Banner preview appears here.
                </div>
              )}
              {branding.bannerImageUrl ? (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(32,32,32,0.35)]"
                    style={{
                      left: `${bannerPosition.x}%`,
                      top: `${bannerPosition.y}%`,
                    }}
                  />
                  <div
                    className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70"
                    style={{
                      left: `${bannerPosition.x}%`,
                      top: `${bannerPosition.y}%`,
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleUpload("banner", event.target.files?.[0])}
          />

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Banner alt text</span>
            <input
              value={branding.bannerAltText}
              onChange={(event) =>
                setBranding((current) => ({ ...current, bannerAltText: event.target.value.slice(0, 120) }))
              }
              placeholder="Describe the banner image"
              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
            />
          </label>
        </div>

        <div className="rounded-[8px] border border-black/5 bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Branding</p>
              <h4 className="mt-1 text-[18px] font-semibold text-[#202020]">Logo image</h4>
              <p className="mt-1 text-[12px] text-[#57636c]">
                Suggested ratio: {LOGO_RATIOS.join(" or ")}. Keep the brand mark centered for best results.
              </p>
            </div>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={!canEditSettings || logoUploading}
              className="inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {logoUploading ? "Uploading..." : "Upload"}
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center overflow-hidden rounded-[8px] border border-dashed border-black/10 bg-[#fafafa] px-4 py-8">
            <div className="relative h-32 w-32 overflow-hidden rounded-[8px] border border-black/10 bg-white">
              {branding.logoImageUrl ? (
                <BlurhashImage
                  src={branding.logoImageUrl}
                  blurHash={branding.logoBlurHashUrl}
                  alt={branding.logoAltText || `${vendorName} logo`}
                  className="h-full w-full"
                  imageClassName="object-contain"
                  imageStyle={{ objectPosition: branding.logoObjectPosition || "center center" }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-center text-[12px] text-[#8b94a3]">
                  Logo preview appears here.
                </div>
              )}
            </div>
          </div>

          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleUpload("logo", event.target.files?.[0])}
          />

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Logo alt text</span>
            <input
              value={branding.logoAltText}
              onChange={(event) =>
                setBranding((current) => ({ ...current, logoAltText: event.target.value.slice(0, 120) }))
              }
              placeholder="Describe the logo image"
              className="w-full rounded-[8px] border border-black/10 bg-white px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={saving || !canEditSettings}
          className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          disabled={!canDeleteSeller}
          className="inline-flex h-10 items-center rounded-[8px] border border-[#f1c3c3] bg-[#fff7f7] px-4 text-[13px] font-semibold text-[#b91c1c] transition-colors hover:border-[#ef9f9f] hover:bg-[#fff0f0] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Close seller account
        </button>
      </div>

      {message ? (
        <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[13px] text-[#166534]">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[13px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[8px] border border-black/5 bg-white p-5 text-[13px] text-[#57636c] shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          Loading seller settings...
        </div>
      ) : null}

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setDeleteOpen(false)}
        >
          <div
            className="max-h-[90svh] w-full max-w-[560px] overflow-y-auto rounded-[8px] bg-white p-6 shadow-[0_18px_42px_rgba(20,24,27,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d11c1c]">
              Close seller account
            </p>
            <h3 className="mt-2 text-[22px] font-semibold text-[#202020]">
              This will close the seller profile and hide its products from the marketplace.
            </h3>
            <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">
              Confirming this action will close the active seller account for {vendorName || sellerSlug}. The seller
              page and product links will no longer be available publicly, but the data remains saved in Piessang.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteSellerAccount()}
                disabled={deleting}
                className="inline-flex h-10 items-center rounded-[8px] bg-[#b91c1c] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#991b1b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "Closing..." : "Close seller account"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {snackbar ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 px-4">
          <div
            className={`pointer-events-auto inline-flex items-center gap-2 rounded-[8px] px-4 py-2 text-[12px] font-semibold shadow-[0_10px_24px_rgba(20,24,27,0.2)] ${
              snackbar.tone === "error" ? "bg-[#b91c1c] text-white" : "bg-[#202020] text-white"
            }`}
          >
            {snackbar.tone === "success" ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                <path
                  d="M5 12.5 10 17 19 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
            {snackbar.message}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default SellerSettingsWorkspace;
