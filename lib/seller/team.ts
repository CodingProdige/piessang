export type SellerTeamRole = "owner" | "admin" | "manager" | "catalogue" | "orders" | "analytics";

export type SellerTeamInvite = {
  token: string;
  email: string;
  role: SellerTeamRole;
  status: "pending" | "accepted" | "revoked";
  invitedAt: string;
  invitedBy: string;
  vendorName: string;
  sellerSlug?: string;
};

export type SellerTeamMember = {
  uid: string;
  email: string;
  role: SellerTeamRole;
  status: "active" | "inactive";
  joinedAt: string;
};

export function sanitizeInviteEmail(value: string) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

export function normalizeSellerTeamRole(value: string): SellerTeamRole {
  const role = String(value ?? "").trim().toLowerCase();
  if (["admin", "seller-dashboard-admin", "seller admin", "dashboard admin"].includes(role)) {
    return "admin";
  }
  if (["manager", "catalogue", "orders", "analytics"].includes(role)) {
    return role as SellerTeamRole;
  }
  return "manager";
}

export function generateSellerTeamInviteToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `invite_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}
