"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { AppSnackbar } from "@/components/ui/app-snackbar";
import type { SeoPageKey } from "@/lib/seo/page-overrides";
import { prepareImageAsset } from "@/lib/client/image-prep";

type SeoPageDefinition = {
  key: SeoPageKey;
  label: string;
  path: string;
  defaultTitle: string;
  defaultDescription: string;
};

type SeoOverride = {
  key: SeoPageKey;
  path: string;
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  updatedAt?: string | null;
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export function SellerAdminLandingSeoWorkspace() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [pages, setPages] = useState<SeoPageDefinition[]>([]);
  const [overrides, setOverrides] = useState<SeoOverride[]>([]);
  const [selectedKey, setSelectedKey] = useState<SeoPageKey>("home");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ogTitle, setOgTitle] = useState("");
  const [ogDescription, setOgDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [uploadingOgImage, setUploadingOgImage] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; tone: "info" | "success" | "error"; message: string }>({
    open: false,
    tone: "info",
    message: "",
  });

  async function loadSeoPages() {
    setLoading(true);
    try {
      const response = await fetch("/api/client/v1/admin/seo", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load SEO pages.");
      setPages(Array.isArray(payload?.data?.pages) ? payload.data.pages : []);
      setOverrides(Array.isArray(payload?.data?.overrides) ? payload.data.overrides : []);
    } catch (error) {
      setSnackbar({
        open: true,
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to load SEO pages.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSeoPages();
  }, []);

  const selectedPage = useMemo(
    () => pages.find((page) => page.key === selectedKey) || pages[0] || null,
    [pages, selectedKey],
  );

  const selectedOverride = useMemo(
    () => overrides.find((item) => item.key === selectedKey) || null,
    [overrides, selectedKey],
  );

  useEffect(() => {
    if (!selectedPage) return;
    setTitle(toStr(selectedOverride?.title, selectedPage.defaultTitle));
    setDescription(toStr(selectedOverride?.description, selectedPage.defaultDescription));
    setOgTitle(toStr(selectedOverride?.ogTitle));
    setOgDescription(toStr(selectedOverride?.ogDescription));
    setOgImage(toStr(selectedOverride?.ogImage));
  }, [selectedPage, selectedOverride]);

  async function saveSeo() {
    if (!selectedPage) return;
    setSaving(true);
    try {
      const response = await fetch("/api/client/v1/admin/seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          pageKey: selectedPage.key,
          title,
          description,
          ogTitle,
          ogDescription,
          ogImage,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to save SEO.");
      await loadSeoPages();
      setSnackbar({ open: true, tone: "success", message: "SEO metadata saved." });
    } catch (error) {
      setSnackbar({
        open: true,
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save SEO.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function suggestSeo() {
    if (!selectedPage) return;
    setSuggesting(true);
    try {
      const response = await fetch("/api/client/v1/admin/seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suggest",
          pageKey: selectedPage.key,
          title,
          description,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to generate SEO suggestion.");
      const suggestion = payload?.data?.suggestion || {};
      setTitle(toStr(suggestion?.title, title));
      setDescription(toStr(suggestion?.description, description));
      setSnackbar({ open: true, tone: "success", message: "SEO suggestion generated." });
    } catch (error) {
      setSnackbar({
        open: true,
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to generate SEO suggestion.",
      });
    } finally {
      setSuggesting(false);
    }
  }

  async function uploadOgImage(file?: File | null) {
    if (!selectedPage || !file) return;
    setUploadingOgImage(true);
    try {
      const prepared = await prepareImageAsset(file, {
        maxDimension: 2400,
        quality: 0.9,
        format: "jpeg",
      });
      const formData = new FormData();
      formData.append("action", "upload-og-image");
      formData.append("pageKey", selectedPage.key);
      formData.append("file", prepared.file);
      const response = await fetch("/api/client/v1/admin/seo", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to upload OG image.");
      const nextUrl = toStr(payload?.data?.uploaded?.url);
      if (!nextUrl) throw new Error("The uploaded image URL was missing.");
      setOgImage(nextUrl);
      setSnackbar({ open: true, tone: "success", message: "Open Graph image uploaded." });
    } catch (error) {
      setSnackbar({
        open: true,
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to upload OG image.",
      });
    } finally {
      setUploadingOgImage(false);
    }
  }

  if (loading) {
    return <div className="rounded-[18px] border border-black/6 bg-white px-5 py-10 text-[14px] text-[#57636c]">Loading SEO workspace...</div>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-[20px] border border-black/6 bg-white p-4 shadow-[0_12px_30px_rgba(20,24,27,0.05)]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8b94a3]">SEO pages</p>
        <p className="mt-1 text-[14px] text-[#57636c]">Choose a public page and manage its search metadata separately from the landing-page components.</p>
        <div className="mt-4 space-y-2">
          {pages.map((page) => {
            const active = page.key === selectedKey;
            const hasOverride = overrides.some((item) => item.key === page.key);
            return (
              <button
                key={page.key}
                type="button"
                onClick={() => setSelectedKey(page.key)}
                className={`w-full rounded-[14px] border px-4 py-3 text-left transition ${
                  active ? "border-[#202020] bg-[#202020] text-white" : "border-black/8 bg-[#fbfbfb] text-[#202020]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px] font-semibold">{page.label}</p>
                  {hasOverride ? (
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${active ? "bg-white/12 text-white" : "bg-[rgba(26,133,83,0.12)] text-[#1a8553]"}`}>
                      Custom
                    </span>
                  ) : null}
                </div>
                <p className={`mt-1 text-[12px] ${active ? "text-white/72" : "text-[#8b94a3]"}`}>{page.path}</p>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="rounded-[20px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8b94a3]">Page SEO</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[#202020]">{selectedPage?.label || "SEO"}</h2>
            <p className="mt-2 text-[14px] text-[#57636c]">
              This saves metadata for the public page route <span className="font-semibold text-[#202020]">{selectedPage?.path}</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (!selectedPage) return;
                setTitle(selectedPage.defaultTitle);
                setDescription(selectedPage.defaultDescription);
                setOgTitle("");
                setOgDescription("");
                setOgImage("");
              }}
              className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={() => void suggestSeo()}
              disabled={suggesting}
              className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020] disabled:opacity-60"
            >
              {suggesting ? "Generating..." : "Generate with AI"}
            </button>
            <button
              type="button"
              onClick={() => void saveSeo()}
              disabled={saving}
              className="inline-flex h-11 items-center rounded-[14px] bg-[#202020] px-4 text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save SEO"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Page title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[15px] outline-none"
              />
              <span className="mt-1 block text-[12px] text-[#8b94a3]">{title.length}/120 characters</span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Page description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-[150px] w-full rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[15px] outline-none"
              />
              <span className="mt-1 block text-[12px] text-[#8b94a3]">{description.length}/320 characters</span>
            </label>
            <div className="rounded-[18px] border border-black/6 bg-[#fbfbfb] p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Open Graph</p>
              <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">
                These settings control how this public page looks when it is shared on social platforms and messaging apps. Leave them blank to inherit the page title, description, and default image.
              </p>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">OG title</span>
                  <input
                    value={ogTitle}
                    onChange={(event) => setOgTitle(event.target.value)}
                    placeholder="Falls back to the page title"
                    className="w-full rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[15px] outline-none"
                  />
                  <span className="mt-1 block text-[12px] text-[#8b94a3]">{ogTitle.length}/120 characters</span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">OG description</span>
                  <textarea
                    value={ogDescription}
                    onChange={(event) => setOgDescription(event.target.value)}
                    placeholder="Falls back to the page description"
                    className="min-h-[120px] w-full rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[15px] outline-none"
                  />
                  <span className="mt-1 block text-[12px] text-[#8b94a3]">{ogDescription.length}/320 characters</span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">OG image URL</span>
                  <input
                    value={ogImage}
                    onChange={(event) => setOgImage(event.target.value)}
                    placeholder="/backgrounds/monkey-on-beach-wide.png"
                    className="w-full rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[15px] outline-none"
                  />
                  <span className="mt-1 block text-[12px] text-[#8b94a3]">Use a public absolute URL or a site-relative image path.</span>
                </label>
                <div className="rounded-[14px] border border-dashed border-black/10 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-semibold text-[#202020]">Upload OG image</p>
                      <p className="mt-1 text-[12px] leading-[1.6] text-[#57636c]">Upload a public share image here and we’ll store the hosted URL for this page automatically.</p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center rounded-[12px] border border-black/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#202020]">
                      {uploadingOgImage ? "Uploading..." : "Upload image"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingOgImage}
                        onChange={(event) => void uploadOgImage(event.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[18px] border border-black/6 bg-[#fbfbfb] p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Search preview</p>
            <div className="mt-4 rounded-[16px] border border-black/6 bg-white p-4">
              <p className="text-[12px] text-[#1a0dab]">{selectedPage?.path}</p>
              <p className="mt-2 text-[20px] font-medium leading-[1.3] text-[#1a0dab]">{title || selectedPage?.defaultTitle}</p>
              <p className="mt-2 text-[13px] leading-[1.6] text-[#4d5156]">{description || selectedPage?.defaultDescription}</p>
            </div>
            <div className="mt-4 rounded-[16px] border border-black/6 bg-white p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">Social share preview</p>
              <div className="mt-3 overflow-hidden rounded-[16px] border border-black/8 bg-white">
                <div className="aspect-[1.91/1] w-full bg-[#f1f3f7]">
                  {toStr(ogImage) ? (
                    <Image
                      src={ogImage}
                      alt={ogTitle || title || selectedPage?.defaultTitle || "Open Graph image"}
                      width={1200}
                      height={630}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">
                      Default page image
                    </div>
                  )}
                </div>
                <div className="border-t border-black/6 p-4">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-[#8b94a3]">piessang.com</p>
                  <p className="mt-2 text-[18px] font-semibold leading-[1.35] text-[#202020]">
                    {ogTitle || title || selectedPage?.defaultTitle}
                  </p>
                  <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">
                    {ogDescription || description || selectedPage?.defaultDescription}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-[16px] border border-black/6 bg-white p-4 text-[13px] text-[#57636c]">
              <p className="font-semibold text-[#202020]">Why this is separate</p>
              <p className="mt-2">Section editing is now focused only on the landing-page content. Search metadata is handled here as a dedicated admin concern.</p>
            </div>
          </div>
        </div>
      </section>

      <AppSnackbar
        notice={snackbar.open ? { tone: snackbar.tone, message: snackbar.message } : null}
        onClose={() => setSnackbar((current) => ({ ...current, open: false }))}
      />
    </div>
  );
}
