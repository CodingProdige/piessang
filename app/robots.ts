import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://piessang.co.za").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/products",
          "/categories",
          "/vendors",
          "/contact",
          "/delivery",
          "/returns",
          "/payments",
          "/privacy",
          "/terms",
          "/support",
          "/sell-on-bevgo",
          "/sell-on-piessang",
        ],
        disallow: [
          "/account",
          "/seller",
          "/cart",
          "/checkout",
          "/support/tickets",
          "/api",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
