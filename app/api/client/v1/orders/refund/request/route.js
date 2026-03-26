export const runtime = "nodejs";

import { POST as createReturnCase } from "@/app/api/client/v1/orders/returns/create/route";

export async function POST(req) {
  return createReturnCase(req);
}
