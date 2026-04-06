"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function DocumentLinkModal({
  open,
  title,
  description,
  url,
  onClose,
  openLabel = "Open document",
}: {
  open: boolean;
  title: string;
  description: string;
  url: string;
  onClose: () => void;
  openLabel?: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setCopyState("idle");
    }
  }, [open, url]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  async function handleCopyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  if (!portalReady || !open || !url) return null;

  return createPortal(
    <div className="fixed inset-0 z-[185] flex items-center justify-center bg-black/35 px-4" onClick={onClose}>
      <div
        className="w-full max-w-[560px] rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.24)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">{title}</p>
            <p className="mt-2 text-[14px] text-[#57636c]">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[18px] text-[#57636c]"
          >
            ×
          </button>
        </div>
        <div className="mt-5 rounded-[18px] border border-black/8 bg-[#f6f7f8] p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#8b94a3]">Document link</p>
          <p className="mt-2 break-all text-[13px] text-[#202020]">{url}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-[14px] bg-[#202020] px-4 text-[14px] font-semibold text-white"
          >
            {openLabel}
          </a>
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]"
          >
            Copy link
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]"
          >
            Close
          </button>
        </div>
        {copyState === "copied" ? (
          <p className="mt-3 text-[13px] font-medium text-[#1f8f55]">Document link copied.</p>
        ) : null}
        {copyState === "error" ? (
          <p className="mt-3 text-[13px] font-medium text-[#b91c1c]">
            Couldn’t copy automatically. You can still open or manually copy the link above.
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
