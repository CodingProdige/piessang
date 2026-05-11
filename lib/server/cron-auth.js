export function isAuthorizedCronRequest(req) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (secret) {
    const authorization = String(req.headers.get("authorization") || "").trim();
    return authorization === `Bearer ${secret}`;
  }

  const vercelCronAuthToken = String(req.headers.get("x-vercel-cron-auth-token") || "").trim();
  if (vercelCronAuthToken) {
    return true;
  }

  const vercelCronHeader = String(req.headers.get("x-vercel-cron") || "").trim();
  if (vercelCronHeader === "1") {
    return true;
  }

  return false;
}
