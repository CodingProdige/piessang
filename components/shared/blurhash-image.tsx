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
  const [loaded, setLoaded] = useState(false);
  const showLoadingFallback = Boolean(src) && !loaded;

  useEffect(() => {
    setLoaded(false);
  }, [src, blurHash]);

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
      {showLoadingFallback && !blurHash ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 overflow-hidden rounded-inherit bg-[#f5f1e8]"
        >
          <div className="absolute inset-y-0 left-[-40%] w-[40%] animate-[piessang-image-shimmer_1.25s_ease-in-out_infinite] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.82),transparent)]" />
        </div>
      ) : null}
      {blurHash ? (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={[
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
            loaded ? "opacity-0" : "opacity-100",
          ].join(" ")}
          style={imageStyle}
        />
      ) : null}
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className={[
            "object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
            imageClassName,
          ].join(" ")}
          style={imageStyle}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          onClick={onClick}
        />
      ) : (
        <div className={["flex h-full w-full items-center justify-center bg-white text-[13px] text-[#8b94a3]", fallbackClassName].join(" ")}>
          No image available
        </div>
      )}
    </div>
  );
}
