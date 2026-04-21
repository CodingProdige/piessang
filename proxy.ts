import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "bevgo_session";
const CANONICAL_SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://piessang.com").replace(/\/+$/, "");
const canonicalSite = new URL(CANONICAL_SITE_URL);
const canonicalHost = canonicalSite.host.toLowerCase();
const canonicalProtocol = canonicalSite.protocol.replace(/:$/, "").toLowerCase();

function isLocalHost(host: string) {
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
}

function shouldCanonicalizeHost(host: string) {
  if (!host) return false;
  if (host === canonicalHost) return false;
  if (isLocalHost(host.split(":")[0] || host)) return false;
  if (host.endsWith(".vercel.app")) return false;
  return host === `www.${canonicalHost}` || host.endsWith(`.${canonicalHost}`);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHost = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").toLowerCase();
  const requestProtocol = (request.headers.get("x-forwarded-proto") || request.nextUrl.protocol || canonicalProtocol)
    .replace(/:$/, "")
    .toLowerCase();

  if (shouldCanonicalizeHost(requestHost) || (requestHost === canonicalHost && requestProtocol !== canonicalProtocol)) {
    const redirectUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, CANONICAL_SITE_URL);
    return NextResponse.redirect(redirectUrl, 308);
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value?.trim());

  if (pathname === "/account" && !hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname.startsWith("/seller/") && pathname !== "/seller/team/accept" && !hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.[^/]+$).*)",
  ],
};
