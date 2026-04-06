export const runtime = "nodejs";
export const preferredRegion = "fra1";

import { POST as getReturnCases } from "@/app/api/client/v1/orders/returns/get/route";

export async function POST(req) {
  return getReturnCases(req);
}
