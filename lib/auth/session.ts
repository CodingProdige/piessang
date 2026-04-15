export const SESSION_COOKIE = "bevgo_session";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

function normalizeHost(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

export function getSessionCookieDomains(hostname?: string | null) {
  const currentHost = normalizeHost(hostname || "");
  const siteHost = (() => {
    try {
      return normalizeHost(new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "").hostname);
    } catch {
      return "";
    }
  })();

  const candidates = new Set<string>();
  for (const host of [currentHost, siteHost]) {
    if (!host || host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) continue;
    candidates.add(host);

    const parts = host.split(".").filter(Boolean);
    if (parts.length >= 2) {
      candidates.add(`.${parts.slice(-2).join(".")}`);
    }
  }

  return Array.from(candidates);
}
