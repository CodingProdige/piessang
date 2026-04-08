export const runtime = "nodejs";
export const preferredRegion = "fra1";
export const dynamic = "force-dynamic";

import { handleCreateRecipient } from "@/app/api/payouts/recipient/_create-handler";

export async function POST(req) {
  return handleCreateRecipient(req);
}
