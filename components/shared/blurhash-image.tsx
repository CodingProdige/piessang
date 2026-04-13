"use client";

import Image from "next/image";
import { decode } from "blurhash";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

type BlurhashImageProps = {
  src?: string | null;
  blurHash?: string | null;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  onClick?: () => void;
  imageStyle?: CSSProperties;
};

export function BlurhashImage({
  src,
  blurHash,
  alt,
  sizes,
  priority,
  className = "",
  imageClassName = "",
  fallbackClassName = "",
  onClick,
  imageStyle,
}: BlurhashImageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const hasBlurHash = Boolean(blurHash);
  const showLoadingFallback = Boolean(src) && !hasBlurHash && loadState === "loading";
  const showErrorFallback = Boolean(src) && !hasBlurHash && loadState === "error";

  useEffect(() => {
    setLoadState(src ? "loading" : "error");
  }, [src, blurHash]);

  useEffect(() => {
    const image = imageRef.current;
    if (!src || !image) return;
    if (image.complete && image.naturalWidth > 0) {
      setLoadState("loaded");
    }
  }, [src]);

  useEffect(() => {
    if (!blurHash || !canvasRef.current) return;

    let cancelled = false;

    try {
      const width = 32;
      const height = 32;
      const pixels = decode(blurHash, width, height);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      const imageData = context.createImageData(width, height);
      imageData.data.set(pixels);
      if (cancelled) return;
      canvas.width = width;
      canvas.height = height;
      context.putImageData(imageData, 0, 0);
    } catch {
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = 8;
      canvas.height = 8;
      context.fillStyle = "#f4f4f4";
      context.fillRect(0, 0, 8, 8);
    }

    return () => {
      cancelled = true;
    };
  }, [blurHash]);

  return (
    <div className={`relative overflow-hidden bg-white ${className}`}>
      {showLoadingFallback ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-[1] overflow-hidden rounded-inherit bg-[#f1f3f5]"
        >
          <div className="absolute inset-0 animate-pulse bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(225,229,234,0.9))]" />
          <div className="absolute inset-y-0 left-[-40%] w-[40%] animate-[piessang-image-shimmer_1.25s_ease-in-out_infinite] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.82),transparent)]" />
        </div>
      ) : null}
      {hasBlurHash ? (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={[
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
            loadState === "loaded" ? "opacity-0" : "opacity-100",
          ].join(" ")}
          style={imageStyle}
        />
      ) : null}
      {src ? (
        <>
          <Image
            ref={imageRef}
            src={src}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            className={[
              "object-cover transition-opacity duration-300",
              loadState === "loaded" ? "opacity-100" : "opacity-0",
              imageClassName,
            ].join(" ")}
            style={imageStyle}
            onLoad={() => setLoadState("loaded")}
            onError={() => setLoadState("error")}
            onClick={onClick}
          />
          {showErrorFallback ? (
            <div className="absolute inset-0 z-[1] flex h-full w-full items-center justify-center bg-[#f1f3f5]">
              <div className="flex items-center justify-center rounded-full border border-black/5 bg-white/80 p-3 text-[#a1a8b3] shadow-[0_8px_18px_rgba(20,24,27,0.06)]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="9" cy="10" r="1.5" />
                  <path d="M21 15l-4.2-4.2a1 1 0 0 0-1.4 0L9 17" />
                </svg>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className={["flex h-full w-full items-center justify-center bg-[#f1f3f5]", fallbackClassName].join(" ")}>
          <div className="flex items-center justify-center rounded-full border border-black/5 bg-white/80 p-3 text-[#a1a8b3] shadow-[0_8px_18px_rgba(20,24,27,0.06)]">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="10" r="1.5" />
              <path d="M21 15l-4.2-4.2a1 1 0 0 0-1.4 0L9 17" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
