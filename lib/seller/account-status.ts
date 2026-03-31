function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

export type SellerBlockReasonCode =
  | "incomplete_listing"
  | "stock_shortage"
  | "policy_issue"
  | "duplicate_account"
  | "payment_issue"
  | "other";

export type SellerBlockReasonOption = {
  value: SellerBlockReasonCode;
  label: string;
  fix: string;
};

export const SELLER_BLOCK_REASONS: SellerBlockReasonOption[] = [
  {
    value: "incomplete_listing",
    label: "Incomplete listing information",
    fix: "Complete the missing product, branding, or account details before requesting a review.",
  },
  {
    value: "stock_shortage",
    label: "Stock or fulfilment issue",
    fix: "Ensure stock is available, inventory is tracked, and fulfilment settings are correct.",
  },
  {
    value: "policy_issue",
    label: "Policy or content issue",
    fix: "Update the affected content so it meets Piessang marketplace requirements.",
  },
  {
    value: "duplicate_account",
    label: "Duplicate or conflicting account",
    fix: "Leave the conflicting team or seller account before requesting access again.",
  },
  {
    value: "payment_issue",
    label: "Payment or compliance issue",
    fix: "Resolve the outstanding compliance or payment matter before requesting review.",
  },
  {
    value: "other",
    label: "Other",
    fix: "Resolve the issue described by the reviewing admin before requesting a review.",
  },
];

export function normalizeSellerBlockReasonCode(value?: string | null): SellerBlockReasonCode {
  const candidate = toStr(value, "other").toLowerCase();
  return SELLER_BLOCK_REASONS.some((item) => item.value === candidate) ? (candidate as SellerBlockReasonCode) : "other";
}

export function getSellerBlockReasonLabel(value?: string | null) {
  const code = normalizeSellerBlockReasonCode(value);
  return SELLER_BLOCK_REASONS.find((item) => item.value === code)?.label ?? "Other";
}

export function getSellerBlockReasonFix(value?: string | null) {
  const code = normalizeSellerBlockReasonCode(value);
  return SELLER_BLOCK_REASONS.find((item) => item.value === code)?.fix ?? "Resolve the issue before requesting a review.";
}

export function isSellerAccountBlocked(source: Record<string, any> | null | undefined) {
  const seller = source?.seller && typeof source.seller === "object" ? source.seller : source || {};
  const status = toStr(seller?.status || source?.sellerStatus).toLowerCase();
  return status === "blocked";
}

export function isSellerAccountUnavailable(source: Record<string, any> | null | undefined) {
  const seller = source?.seller && typeof source.seller === "object" ? source.seller : source || {};
  const status = toStr(seller?.status || source?.sellerStatus).toLowerCase();
  return ["blocked", "closed", "deleted", "archived"].includes(status);
}

export function getSellerUnavailableReason(source: Record<string, any> | null | undefined) {
  const seller = source?.seller && typeof source.seller === "object" ? source.seller : source || {};
  const reasonCode = toStr(seller?.closedReasonCode || seller?.blockedReasonCode || source?.sellerBlockedReasonCode);
  const reasonMessage = toStr(
    seller?.closedReasonMessage ||
      seller?.blockedReasonMessage ||
      seller?.closedReason ||
      source?.sellerBlockedReasonMessage,
  );

  return {
    reasonCode: reasonCode || null,
    reasonMessage: reasonMessage || null,
  };
}

export function getSellerReviewRequest(source: Record<string, any> | null | undefined) {
  const seller = source?.seller && typeof source.seller === "object" ? source.seller : source || {};
  const request = seller?.reviewRequest && typeof seller.reviewRequest === "object" ? seller.reviewRequest : null;
  if (request) return request;
  return null;
}

export function isSellerReviewPending(source: Record<string, any> | null | undefined) {
  const request = getSellerReviewRequest(source);
  const status = toStr(request?.status || "").toLowerCase();
  return status === "pending" || status === "requested";
}
