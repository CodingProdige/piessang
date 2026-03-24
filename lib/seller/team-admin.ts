import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeSellerTeamRole, sanitizeInviteEmail } from "@/lib/seller/team";

type SellerDoc = {
  id: string;
  data: Record<string, any>;
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function sellerMatchesSlug(seller: Record<string, any> | null | undefined, sellerSlug: string) {
  const needle = toStr(sellerSlug);
  if (!needle || !seller || typeof seller !== "object") return false;

  return [
    seller?.sellerSlug,
    seller?.groupSellerSlug,
    seller?.activeSellerSlug,
  ].some((value) => toStr(value) === needle);
}

function sellerMatchesCode(seller: Record<string, any> | null | undefined, sellerCode: string) {
  const needle = toStr(sellerCode).toUpperCase();
  if (!needle || !seller || typeof seller !== "object") return false;

  return [
    seller?.sellerCode,
    seller?.groupSellerCode,
    seller?.activeSellerCode,
  ].some((value) => toStr(value).toUpperCase() === needle);
}

function sellerIdentifierMatches(seller: Record<string, any> | null | undefined, sellerIdentifier: string) {
  return sellerMatchesSlug(seller, sellerIdentifier) || sellerMatchesCode(seller, sellerIdentifier);
}

export async function findSellerOwnerBySlug(sellerSlug: string): Promise<SellerDoc | null> {
  const needle = toStr(sellerSlug);
  if (!needle) return null;

  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection("users").get();
  const candidates: Array<{ doc: SellerDoc; score: number }> = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const seller = data?.seller && typeof data.seller === "object" ? data.seller : null;
    const team = seller?.team && typeof seller.team === "object" ? seller.team : null;
    if (!sellerIdentifierMatches(seller, needle) && !sellerIdentifierMatches(team, needle)) continue;

    const teamMembers = Array.isArray(team?.members) ? team.members.length : 0;
    const accessGrants = Array.isArray(team?.accessGrants) ? team.accessGrants.length : 0;
    const invites = Array.isArray(team?.invites) ? team.invites.length : 0;
    const ownsTeam = teamMembers + accessGrants + invites;
    const score =
      (ownsTeam > 0 ? 100 : 0) +
      (team ? 25 : 0) +
      (seller?.sellerAccess === true ? 10 : 0) +
      (toStr(seller?.teamOwnerUid) ? 0 : 5);

    candidates.push({
      doc: { id: docSnap.id, data },
      score,
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].doc;
}

export async function findSellerOwnerByCode(sellerCode: string): Promise<SellerDoc | null> {
  const needle = toStr(sellerCode);
  if (!needle) return null;

  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection("users").get();
  const candidates: Array<{ doc: SellerDoc; score: number }> = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const seller = data?.seller && typeof data.seller === "object" ? data.seller : null;
    const team = seller?.team && typeof seller.team === "object" ? seller.team : null;
    if (!sellerMatchesCode(seller, needle) && !sellerMatchesCode(team, needle)) continue;

    const teamMembers = Array.isArray(team?.members) ? team.members.length : 0;
    const accessGrants = Array.isArray(team?.accessGrants) ? team.accessGrants.length : 0;
    const invites = Array.isArray(team?.invites) ? team.invites.length : 0;
    const ownsTeam = teamMembers + accessGrants + invites;
    const score =
      (ownsTeam > 0 ? 100 : 0) +
      (team ? 25 : 0) +
      (seller?.sellerAccess === true ? 10 : 0) +
      (toStr(seller?.teamOwnerUid) ? 0 : 5);

    candidates.push({
      doc: { id: docSnap.id, data },
      score,
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].doc;
}

export async function findSellerOwnerByIdentifier(identifier: string): Promise<SellerDoc | null> {
  const needle = toStr(identifier);
  if (!needle) return null;

  return (await findSellerOwnerByCode(needle)) ?? (await findSellerOwnerBySlug(needle));
}

export function normalizeSellerTeamMember(value: Record<string, any> | null | undefined) {
  const record = value && typeof value === "object" ? value : {};
  return {
    uid: toStr(record.uid || record.userUid || record.memberUid),
    email: sanitizeInviteEmail(record.email || record.contactEmail || ""),
    role: normalizeSellerTeamRole(record.role || "manager"),
    status: toStr(record.status || "active"),
    joinedAt: toStr(record.joinedAt || record.grantedAt || record.invitedAt),
    grantedAt: toStr(record.grantedAt || record.joinedAt || record.invitedAt),
    grantedBy: toStr(record.grantedBy || record.invitedBy || record.teamOwnerUid),
    teamOwnerUid: toStr(record.teamOwnerUid || record.grantedBy),
    lastActiveAt: toStr(record.lastActiveAt || record.activity?.lastActiveAt || record.auth?.lastLoginAt || record.timestamps?.updatedAt),
    systemAccessType: toStr(record.systemAccessType || record.system?.accessType),
  };
}

export function normalizeSellerAccessGrant(value: Record<string, any> | null | undefined) {
  const record = value && typeof value === "object" ? value : {};
  return {
    uid: toStr(record.uid || record.userUid || record.memberUid),
    email: sanitizeInviteEmail(record.email || record.contactEmail || ""),
    role: normalizeSellerTeamRole(record.role || "manager"),
    status: toStr(record.status || "active"),
    grantedAt: toStr(record.grantedAt || record.joinedAt || record.invitedAt),
    grantedBy: toStr(record.grantedBy || record.invitedBy || record.teamOwnerUid),
    vendorName: toStr(record.vendorName || ""),
    sellerSlug: toStr(record.sellerSlug || record.groupSellerSlug || record.activeSellerSlug),
    teamOwnerUid: toStr(record.teamOwnerUid || record.grantedBy),
  };
}

export function getSellerTeamMembers(
  team: Record<string, any> | null | undefined,
  memberMetaByUid: Record<string, Record<string, any>> = {},
) {
  const members = Array.isArray(team?.members) ? team.members : [];
  return members.map((item) => {
    const member = normalizeSellerTeamMember(item);
    const meta = member.uid ? memberMetaByUid[member.uid] : null;
    if (!meta || typeof meta !== "object") return member;

    return {
      ...member,
      lastActiveAt: member.lastActiveAt || toStr(meta.lastActiveAt || meta.activity?.lastActiveAt || meta.auth?.lastLoginAt || meta.timestamps?.updatedAt),
      systemAccessType: member.systemAccessType || toStr(meta?.system?.accessType || meta?.systemAccessType),
    };
  });
}

export function getSellerAccessGrants(team: Record<string, any> | null | undefined) {
  const grants = Array.isArray(team?.accessGrants) ? team.accessGrants : [];
  return grants.map((item) => normalizeSellerAccessGrant(item));
}

export function canManageSellerTeam(requesterData: Record<string, any> | null | undefined, sellerSlug: string) {
  const needle = toStr(sellerSlug);
  if (!needle || !requesterData || typeof requesterData !== "object") return false;

  const seller = requesterData?.seller && typeof requesterData.seller === "object" ? requesterData.seller : {};
  const teamRole = normalizeSellerTeamRole(seller?.teamRole || "");
  const sellerAccess = seller?.sellerAccess === true;
  const sellerSlugMatches = sellerIdentifierMatches(seller, needle);
  const sellerTeamOwnerUid = toStr(seller?.teamOwnerUid);
  const managedAccounts = Array.isArray(seller?.managedSellerAccounts) ? seller.managedSellerAccounts : [];
  const managedMatch = managedAccounts.some((item: any) => {
    const itemSlug = toStr(item?.sellerSlug);
    const itemCode = toStr(item?.sellerCode);
    const itemRole = normalizeSellerTeamRole(item?.role || "");
    const itemStatus = toStr(item?.status || "active").toLowerCase();
    return (itemSlug === needle || itemCode === needle) && itemRole === "admin" && itemStatus !== "inactive";
  });
  const isPrimaryOwner = sellerAccess && sellerSlugMatches && !sellerTeamOwnerUid;

  return (sellerAccess && sellerSlugMatches && (teamRole === "admin" || isPrimaryOwner)) || managedMatch;
}

export function teamMemberMatches(target: Record<string, any> | null | undefined, needle: { uid?: string; email?: string }) {
  const member = target && typeof target === "object" ? target : {};
  const uid = toStr(needle?.uid);
  const email = sanitizeInviteEmail(needle?.email || "");
  return Boolean(
    (uid && toStr(member.uid || member.userUid || member.memberUid) === uid) ||
    (email && sanitizeInviteEmail(member.email || member.contactEmail || "") === email),
  );
}
