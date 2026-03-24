import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "bevgo_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value?.trim());

  if (pathname === "/account" && !hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname === "/cart" && !hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname.startsWith("/seller/") && pathname !== "/seller/team/accept" && !hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/account", "/seller/:path*"],
};
