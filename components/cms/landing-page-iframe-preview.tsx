"use client";

import { useEffect, useMemo, useState } from "react";
import { LandingPageLivePreview } from "@/components/cms/landing-page-live-preview";
import type { LandingSection } from "@/lib/cms/landing-page-schema";
import type { ProductItem } from "@/components/products/products-results";
import type { LandingPreviewMode } from "@/components/cms/landing-page-live-preview";

type PreviewCategory = {
  id: string;
  slug: string;
  title: string;
};

type PreviewPayload = {
  sections?: LandingSection[];
  products?: ProductItem[];
  categories?: PreviewCategory[];
  mode?: LandingPreviewMode;
  selectedBlockId?: string;
};

type InsertPayload = {
  afterBlockId?: string;
};

function isObjectLike(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object";
}

export function LandingPageIframePreview() {
  const [payload, setPayload] = useState<PreviewPayload>({
    sections: [],
    products: [],
    categories: [],
    mode: "desktop",
    selectedBlockId: "",
  });

  const parentOrigin = useMemo(() => {
    if (typeof window === "undefined") return "*";
    return window.location.origin;
  }, []);
  const sectionCount = Array.isArray(payload.sections) ? payload.sections.length : 0;

  useEffect(() => {
    if (typeof window === "undefined") return;

    let frame = 0;
    const sendMetrics = () => {
      frame = 0;
      const contentHeight = Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0,
        document.documentElement?.offsetHeight || 0,
        document.body?.offsetHeight || 0
      );
      window.parent?.postMessage({ type: "landing-preview:metrics", payload: { contentHeight, mode: payload.mode || "desktop" } }, parentOrigin);
    };
    const queueMetrics = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(sendMetrics);
    };

    queueMetrics();
    window.addEventListener("load", queueMetrics);
    window.addEventListener("resize", queueMetrics);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => queueMetrics()) : null;
    if (observer) {
      observer.observe(document.documentElement);
      if (document.body) observer.observe(document.body);
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("load", queueMetrics);
      window.removeEventListener("resize", queueMetrics);
      observer?.disconnect();
    };
  }, [parentOrigin, payload.mode, payload.sections, payload.selectedBlockId]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (parentOrigin !== "*" && event.origin !== parentOrigin) return;
      const data = event.data;
      if (!isObjectLike(data)) return;
      if (data.type === "landing-preview:select") {
        const blockId = typeof data.payload?.blockId === "string" ? data.payload.blockId : "";
        if (blockId) {
          setPayload((current) => ({ ...current, selectedBlockId: blockId }));
          window.requestAnimationFrame(() => {
            const element = document.querySelector(`[data-preview-block-id="${blockId}"]`);
            if (element instanceof HTMLElement) {
              element.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          });
        }
        return;
      }
      if (data.type !== "landing-preview:sync") return;

      setPayload({
        sections: Array.isArray(data.payload?.sections) ? data.payload.sections : [],
        products: Array.isArray(data.payload?.products) ? data.payload.products : [],
        categories: Array.isArray(data.payload?.categories) ? data.payload.categories : [],
        mode: data.payload?.mode || "desktop",
        selectedBlockId: data.payload?.selectedBlockId || "",
      });
    }

    window.addEventListener("message", handleMessage);
    window.parent?.postMessage({ type: "landing-preview:ready" }, parentOrigin);
    return () => window.removeEventListener("message", handleMessage);
  }, [parentOrigin]);

  return (
    <div className="min-h-screen bg-white">
      <LandingPageLivePreview
        sections={Array.isArray(payload.sections) ? payload.sections : []}
        products={Array.isArray(payload.products) ? payload.products : []}
        categories={Array.isArray(payload.categories) ? payload.categories : []}
        mode={payload.mode || "desktop"}
        editorCanvas
        selectedBlockId={payload.selectedBlockId || ""}
        onSelectBlock={(blockId) => {
          window.parent?.postMessage({ type: "landing-preview:selected", payload: { blockId } }, parentOrigin);
        }}
        renderBlockControls={(blockId) => (
          <div
            className="flex items-center gap-2 rounded-[14px] border border-black/10 bg-white/96 p-2 shadow-[0_14px_28px_rgba(20,24,27,0.12)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => window.parent?.postMessage({ type: "landing-preview:insert", payload: { afterBlockId: blockId } satisfies InsertPayload }, parentOrigin)}
              className="inline-flex h-9 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
            >
              Add below
            </button>
            <button
              type="button"
              onClick={() => window.parent?.postMessage({ type: "landing-preview:action", payload: { action: "select", blockId } }, parentOrigin)}
              className="inline-flex h-9 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => window.parent?.postMessage({ type: "landing-preview:action", payload: { action: "duplicate", blockId } }, parentOrigin)}
              className="inline-flex h-9 items-center rounded-[10px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020]"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => window.parent?.postMessage({ type: "landing-preview:action", payload: { action: "move-up", blockId } }, parentOrigin)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/10 bg-white text-[15px] font-semibold text-[#202020]"
              aria-label="Move section up"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => window.parent?.postMessage({ type: "landing-preview:action", payload: { action: "move-down", blockId } }, parentOrigin)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/10 bg-white text-[15px] font-semibold text-[#202020]"
              aria-label="Move section down"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => window.parent?.postMessage({ type: "landing-preview:action", payload: { action: "delete", blockId } }, parentOrigin)}
              className="inline-flex h-9 items-center rounded-[10px] border border-[#ef4444]/20 bg-[#fff5f5] px-3 text-[12px] font-semibold text-[#d14343]"
            >
              Delete
            </button>
          </div>
        )}
      />
      {sectionCount > 0 ? (
        <div className="px-4 pb-6">
          <div className="w-full">
            <button
              type="button"
              onClick={() => {
                const lastSection = Array.isArray(payload.sections) ? payload.sections[payload.sections.length - 1] : null;
                window.parent?.postMessage(
                  { type: "landing-preview:insert", payload: { afterBlockId: lastSection?.id || "" } satisfies InsertPayload },
                  parentOrigin
                );
              }}
              className="inline-flex h-9 items-center rounded-[12px] border border-dashed border-black/20 bg-white px-3 text-[12px] font-semibold text-[#202020]"
            >
              Add section
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
