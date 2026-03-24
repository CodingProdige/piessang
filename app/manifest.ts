import type { MetadataRoute } from "next";
import { PIESSANG_COLORS } from "@/lib/brand/colors";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Piessang",
    short_name: "Piessang",
    description: "Piessang marketplace",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: PIESSANG_COLORS.background,
    theme_color: PIESSANG_COLORS.primary,
    icons: [
      {
        src: "/favicon-for-public/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon-for-public/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
