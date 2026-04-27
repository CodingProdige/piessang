export type EasyshipCategoryMapping = {
  itemCategory: string | null;
  hsSearchTerm: string | null;
  supportLevel: "supported" | "restricted" | "review";
  sellerMessage: string | null;
};

export type ReviewedHsFallback = {
  code: string;
  description: string;
  confidence: "reviewed";
};

export const EASYSHIP_CUSTOMS_CATEGORY_FALLBACK_OPTIONS: readonly string[] = [];

export function resolveEasyshipCategoryMapping(_input?: unknown): EasyshipCategoryMapping {
  return {
    itemCategory: null,
    hsSearchTerm: null,
    supportLevel: "review",
    sellerMessage: "Legacy Easyship customs guidance has been deprecated.",
  };
}

export function resolveReviewedHsFallback(_input?: unknown): ReviewedHsFallback | null {
  return null;
}

export function buildEasyshipSellerWarnings(_input?: unknown) {
  return ["Legacy Easyship shipping guidance has been deprecated."];
}
