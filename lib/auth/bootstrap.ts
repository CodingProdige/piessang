export type AuthBootstrapProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  systemAccessType: string | null;
  favoriteCount: number;
  favoriteIds: string[];
  isSeller: boolean;
  sellerAccessRequested: boolean;
  sellerStatus: string | null;
  sellerBlockedReasonCode: string | null;
  sellerBlockedReasonMessage: string | null;
  sellerBlockedAt: string | null;
  sellerBlockedBy: string | null;
  sellerReviewRequestStatus: string | null;
  sellerReviewRequestedAt: string | null;
  sellerReviewRequestedBy: string | null;
  sellerReviewRequestMessage: string | null;
  sellerReviewResponseStatus: string | null;
  sellerReviewResponseAt: string | null;
  sellerReviewResponseBy: string | null;
  sellerReviewResponseMessage: string | null;
  sellerTeamOwnerUid: string | null;
  sellerTeamRole: string | null;
  accountName: string | null;
  sellerVendorName: string | null;
  sellerVendorDescription: string | null;
  sellerCode: string | null;
  sellerSlug: string | null;
  sellerActiveSellerSlug: string | null;
  sellerCategory: string | null;
  sellerCategoryTitle: string | null;
  sellerSubCategory: string | null;
  sellerSubCategoryTitle: string | null;
  sellerManagedAccounts: Array<{
    sellerSlug?: string;
    vendorName?: string;
    sellerCode?: string;
    vendorDescription?: string;
    role?: string;
    status?: string;
    teamOwnerUid?: string;
    grantedAt?: string;
    blockedReasonCode?: string;
    blockedReasonMessage?: string;
    blockedAt?: string;
    blockedBy?: string;
    reviewRequestStatus?: string;
    reviewRequestedAt?: string;
    reviewRequestedBy?: string;
    reviewRequestMessage?: string;
    reviewResponseStatus?: string;
    reviewResponseAt?: string;
    reviewResponseBy?: string;
    reviewResponseMessage?: string;
  }> | null;
  sellerTeamMembers: Array<{ uid?: string; email?: string; role?: string; status?: string }> | null;
  sellerTeamInvites: Array<{ email?: string; role?: string; status?: string; token?: string }> | null;
};

export type AuthBootstrap = {
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
  } | null;
  profile: AuthBootstrapProfile | null;
  itemCount: number;
  productCounts: Record<string, number>;
  variantCounts: Record<string, number>;
};

export const EMPTY_AUTH_BOOTSTRAP: AuthBootstrap = {
  user: null,
  profile: null,
  itemCount: 0,
  productCounts: {},
  variantCounts: {},
};
