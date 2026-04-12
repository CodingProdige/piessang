"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { PageBody } from "@/components/layout/page-body";
import { SellerPageIntro } from "@/components/seller/page-intro";
import { toSellerSlug } from "@/lib/seller/vendor-name";

type MemberRow = {
  uid?: string;
  email?: string;
  role?: string;
  status?: string;
  joinedAt?: string;
  grantedAt?: string;
  grantedBy?: string;
  lastActiveAt?: string;
  systemAccessType?: string;
};

type TeamPayload = {
  seller?: {
    uid?: string;
    sellerSlug?: string;
    sellerCode?: string;
    vendorName?: string;
    teamRole?: string;
  };
  members?: MemberRow[];
  accessGrants?: Array<{
    uid?: string;
    email?: string;
    role?: string;
    status?: string;
    grantedAt?: string;
    grantedBy?: string;
  }>;
  canManage?: boolean;
};

function formatRoleLabel(role?: string) {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "owner") return "Seller account owner";
  if (value === "admin") return "Seller dashboard admin";
  if (value === "manager") return "Manager";
  if (value === "catalogue") return "Catalogue";
  if (value === "orders") return "Orders";
  if (value === "analytics") return "Analytics";
  return value || "Member";
}

function roleDescription(role?: string) {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "owner") return "Full owner control over this seller account, including team access, products, orders, analytics, and settings.";
  if (value === "admin") return "Full seller control, including team access, products, orders, analytics, and settings.";
  if (value === "manager") return "Can manage products and orders without changing team permissions.";
  if (value === "catalogue") return "Can create, edit, and publish products and variants.";
  if (value === "orders") return "Can view and work through seller orders.";
  if (value === "analytics") return "Can view seller performance and reporting only.";
  return "Member access for this seller account.";
}

function formatMemberTime(value?: string) {
  const input = String(value ?? "").trim();
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

type SellerTeamPageProps = {
  showIntro?: boolean;
};

function SellerTeamPageContent({ showIntro = true }: SellerTeamPageProps = {}) {
  const {
    authReady,
    isAuthenticated,
    isSeller,
    profile,
    openAuthModal,
    openSellerRegistrationModal,
    refreshProfile,
    leaveSellerTeam,
  } = useAuth();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("manager");
  const [submitting, setSubmitting] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [teamPayload, setTeamPayload] = useState<TeamPayload | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [systemAdminDrafts, setSystemAdminDrafts] = useState<Record<string, boolean>>({});
  const [savingMemberKey, setSavingMemberKey] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);
  const [removingMemberKey, setRemovingMemberKey] = useState<string | null>(null);
  const [selectedMemberKeys, setSelectedMemberKeys] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState("manager");
  const [grantSystemAdmin, setGrantSystemAdmin] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sellerContexts = useMemo(
    () =>
      [
        {
          sellerSlug: profile?.sellerActiveSellerSlug?.trim() || profile?.sellerSlug?.trim() || toSellerSlug(profile?.sellerVendorName ?? profile?.accountName ?? ""),
          sellerCode: profile?.sellerCode?.trim() || "",
          vendorName: profile?.sellerVendorName ?? profile?.accountName ?? "",
          role: profile?.sellerTeamRole || "admin",
        },
        ...(profile?.sellerManagedAccounts ?? []).map((item) => ({
          sellerSlug: item?.sellerSlug?.trim() || "",
          sellerCode: item?.sellerCode?.trim() || "",
          vendorName: item?.vendorName?.trim() || "",
          role: item?.role ? String(item.role).trim().toLowerCase() : null,
        })),
      ].filter((item) => item.sellerSlug || item.sellerCode),
    [profile],
  );
  const sellerSlug = useMemo(() => {
    const currentSeller = searchParams.get("seller")?.trim() || "";
    if (currentSeller && sellerContexts.some((item) => item.sellerSlug === currentSeller || item.sellerCode === currentSeller)) return currentSeller;
    return sellerContexts[0]?.sellerCode || sellerContexts[0]?.sellerSlug || "";
  }, [searchParams, sellerContexts]);
  const isSystemAdmin = profile?.systemAccessType === "admin";
  const activeSellerContext = useMemo(
    () => sellerContexts.find((item) => item.sellerSlug === sellerSlug || item.sellerCode === sellerSlug) ?? sellerContexts[0] ?? null,
    [sellerContexts, sellerSlug],
  );
  const vendorName = useMemo(
    () => sellerContexts.find((item) => item.sellerSlug === sellerSlug)?.vendorName ?? profile?.sellerVendorName ?? "",
    [profile?.sellerVendorName, sellerContexts, sellerSlug],
  );
  const members = (teamPayload?.members ?? profile?.sellerTeamMembers ?? []) as MemberRow[];
  const canManageTeam =
    teamPayload?.canManage === true ||
    activeSellerContext?.role === "admin" ||
    activeSellerContext?.role === "owner" ||
    profile?.sellerTeamRole === "admin" ||
    profile?.sellerTeamRole === "owner";
  const sellerLabel = teamPayload?.seller?.vendorName || vendorName || "your vendor";
  const canLeaveCurrentSeller = Boolean(profile?.sellerTeamOwnerUid && activeSellerContext?.role !== "admin");

  const sortedMembers = useMemo(() => [...members].sort((a, b) => String(a?.email ?? "").localeCompare(String(b?.email ?? ""))), [members]);
  const selectedMembers = useMemo(
    () => sortedMembers.filter((member) => selectedMemberKeys.includes(String(member.uid || member.email || "").trim())),
    [selectedMemberKeys, sortedMembers],
  );
  const selectAllChecked = sortedMembers.length > 0 && selectedMembers.length === sortedMembers.length;

  useEffect(() => {
    let cancelled = false;

    async function loadTeam() {
      if (!profile?.uid || !sellerSlug) return;
      setLoadingTeam(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          uid: profile.uid,
          sellerSlug,
        });
        const response = await fetch(`/api/client/v1/accounts/seller/team/get?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to load team access.");
        }
        if (!cancelled) {
          setTeamPayload(payload);
          const draftRoles: Record<string, string> = {};
          const draftSystemAccess: Record<string, boolean> = {};
          for (const member of Array.isArray(payload?.members) ? payload.members : []) {
            const key = String(member?.uid || member?.email || "").trim();
            if (key) {
              draftRoles[key] = String(member?.role || "manager");
              draftSystemAccess[key] = String(member?.systemAccessType || "").trim().toLowerCase() === "admin";
            }
          }
          setRoleDrafts(draftRoles);
          setSystemAdminDrafts(draftSystemAccess);
        }
      } catch (cause) {
        if (!cancelled) {
          setTeamPayload(null);
          setError(cause instanceof Error ? cause.message : "Unable to load team access.");
        }
      } finally {
        if (!cancelled) setLoadingTeam(false);
      }
    }

    void loadTeam();

    return () => {
      cancelled = true;
    };
  }, [profile?.uid, sellerSlug]);

  async function sendInvite() {
    if (!email.trim()) {
      setError("Provide the teammate email first.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile?.uid,
          data: { email, role, sellerSlug, grantSystemAdmin },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to grant access.");
      }
      setEmail("");
      setRole("manager");
      setGrantSystemAdmin(false);
      setMessage("Access granted.");
      await refreshProfile();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const params = new URLSearchParams({ uid: String(profile?.uid || ""), sellerSlug });
      const refreshedResponse = await fetch(`/api/client/v1/accounts/seller/team/get?${params.toString()}`, { cache: "no-store" });
      const refreshed = await refreshedResponse.json().catch(() => ({}));
      if (refreshedResponse.ok && refreshed?.ok !== false) {
        setTeamPayload(refreshed);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to grant access.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveMemberRole(member: MemberRow) {
    const key = String(member.uid || member.email || "").trim();
    if (!key) return;

    setSavingMemberKey(key);
    setError(null);
    setMessage(null);
    try {
      const nextRole = roleDrafts[key] || member.role || "manager";
      const nextSystemAdmin = Boolean(systemAdminDrafts[key]);
      const response = await fetch("/api/client/v1/accounts/seller/team/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile?.uid,
          data: {
            sellerSlug,
            memberUid: member.uid,
            memberEmail: member.email,
            role: nextRole,
            grantSystemAdmin: nextSystemAdmin,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to update team member.");
      }
      setMessage("Member access updated.");
      const params = new URLSearchParams({ uid: String(profile?.uid || ""), sellerSlug });
      const nextResponse = await fetch(`/api/client/v1/accounts/seller/team/get?${params.toString()}`, { cache: "no-store" });
      const refreshed = await nextResponse.json().catch(() => ({}));
      if (nextResponse.ok && refreshed?.ok !== false) {
        setTeamPayload(refreshed);
      }
      await refreshProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update team member.");
    } finally {
      setSavingMemberKey(null);
    }
  }

  async function confirmRemoveMember() {
    if (!removeTarget) return;
    const key = String(removeTarget.uid || removeTarget.email || "").trim();
    setRemovingMemberKey(key || "removing");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/client/v1/accounts/seller/team/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: profile?.uid,
          data: {
            sellerSlug,
            memberUid: removeTarget.uid,
            memberEmail: removeTarget.email,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to remove team member.");
      }
      setRemoveTarget(null);
      setMessage("Member removed.");
      const params = new URLSearchParams({ uid: String(profile?.uid || ""), sellerSlug });
      const nextResponse = await fetch(`/api/client/v1/accounts/seller/team/get?${params.toString()}`, { cache: "no-store" });
      const refreshed = await nextResponse.json().catch(() => ({}));
      if (nextResponse.ok && refreshed?.ok !== false) {
        setTeamPayload(refreshed);
      }
      await refreshProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove team member.");
    } finally {
      setRemovingMemberKey(null);
    }
  }

  function toggleMemberSelection(member: MemberRow, checked: boolean) {
    const memberKey = String(member.uid || member.email || "").trim();
    if (!memberKey) return;

    setSelectedMemberKeys((current) => {
      if (checked) {
        return current.includes(memberKey) ? current : [...current, memberKey];
      }
      return current.filter((item) => item !== memberKey);
    });
  }

  function toggleAllMembers(checked: boolean) {
    if (!checked) {
      setSelectedMemberKeys([]);
      return;
    }

    setSelectedMemberKeys(
      sortedMembers
        .map((member) => String(member.uid || member.email || "").trim())
        .filter(Boolean),
    );
  }

  async function saveSelectedMembers() {
    if (!selectedMembers.length) return;

    setBulkWorking(true);
    setError(null);
    setMessage(null);
    try {
      for (const member of selectedMembers) {
        const memberKey = String(member.uid || member.email || "").trim();
        if (!memberKey) continue;
        const response = await fetch("/api/client/v1/accounts/seller/team/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: profile?.uid,
            data: {
              sellerSlug,
              memberUid: member.uid,
              memberEmail: member.email,
              role: bulkRole,
              grantSystemAdmin: Boolean(systemAdminDrafts[memberKey]),
            },
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to update team members.");
        }
      }
      setMessage("Selected members updated.");
      setSelectedMemberKeys([]);
      const params = new URLSearchParams({ uid: String(profile?.uid || ""), sellerSlug });
      const nextResponse = await fetch(`/api/client/v1/accounts/seller/team/get?${params.toString()}`, { cache: "no-store" });
      const refreshed = await nextResponse.json().catch(() => ({}));
      if (nextResponse.ok && refreshed?.ok !== false) {
        setTeamPayload(refreshed);
      }
      await refreshProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update team members.");
    } finally {
      setBulkWorking(false);
    }
  }

  async function removeSelectedMembers() {
    if (!selectedMembers.length) return;

    setBulkWorking(true);
    setError(null);
    setMessage(null);
    try {
      for (const member of selectedMembers) {
        const response = await fetch("/api/client/v1/accounts/seller/team/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: profile?.uid,
            data: {
              sellerSlug,
              memberUid: member.uid,
              memberEmail: member.email,
            },
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || "Unable to remove team members.");
        }
      }
      setSelectedMemberKeys([]);
      setMessage("Selected members removed.");
      const params = new URLSearchParams({ uid: String(profile?.uid || ""), sellerSlug });
      const nextResponse = await fetch(`/api/client/v1/accounts/seller/team/get?${params.toString()}`, { cache: "no-store" });
      const refreshed = await nextResponse.json().catch(() => ({}));
      if (nextResponse.ok && refreshed?.ok !== false) {
        setTeamPayload(refreshed);
      }
      await refreshProfile();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove team members.");
    } finally {
      setBulkWorking(false);
    }
  }

  if (!authReady) {
    return (
      <PageBody className="py-10">
        <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Seller team</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Loading team access</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
            We’re checking your seller access and loading your vendor group.
          </p>
        </section>
      </PageBody>
    );
  }

  if (!isAuthenticated) {
    return (
      <PageBody className="py-10">
        <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Seller team</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Sign in to manage your team</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
            Add team members to manage catalogue, orders, and analytics from your vendor account.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("Sign in to manage your seller team.")}
            className="brand-button mt-5 inline-flex h-10 items-center rounded-[8px] px-4 text-[13px] font-semibold"
          >
            Sign in
          </button>
        </section>
      </PageBody>
    );
  }

  if (!isSeller) {
    return (
      <PageBody className="py-10">
        <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Seller team</p>
          <h1 className="mt-2 text-[28px] font-semibold text-[#202020]">Register as a seller first</h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
            You can invite teammates once your vendor account is active.
          </p>
          <button
            type="button"
            onClick={() => openSellerRegistrationModal("Register your seller account to unlock catalogue tools.")}
            className="mt-5 inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
          >
            Register as seller
          </button>
        </section>
      </PageBody>
    );
  }

  return (
    <PageBody className="px-3 py-6 lg:px-4 lg:py-8">
      {showIntro ? (
        <SellerPageIntro
          title="Team"
          description="Add teammates, assign roles, and manage access for this seller account."
        />
      ) : null}

      <section className="mt-4 rounded-[8px] bg-[#171717] px-4 py-3 text-white shadow-[0_8px_24px_rgba(20,24,27,0.08)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f2dfaa]">Current access</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
              <span className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white">{profile?.email || "Signed in"}</span>
              <span className="rounded-full bg-[#cbb26b]/15 px-3 py-1 font-semibold text-[#f2dfaa]">
                {activeSellerContext?.role ? formatRoleLabel(activeSellerContext.role) : "Seller access"}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white/90">
                {sellerLabel}
              </span>
            </div>
            <p className="mt-2 max-w-[720px] text-[12px] leading-[1.5] text-white/72">
              Changing a teammate&apos;s role updates their own Piessang account access too. Use the table below to manage
              permissions for this seller account.
            </p>
          </div>

          {canLeaveCurrentSeller ? (
            <button
              type="button"
              onClick={() => void leaveSellerTeam(sellerSlug)}
              className="inline-flex h-10 items-center rounded-[8px] bg-white px-4 text-[13px] font-semibold text-[#202020] transition-colors hover:bg-[#f3f3f3]"
            >
              Leave seller team
            </button>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)]">
          <div className="flex flex-col gap-3 border-b border-black/5 pb-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Members</p>
              <h2 className="mt-1 text-[22px] font-semibold text-[#202020]">Members</h2>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#57636c]">
                Select one or more members to change roles or remove access.
              </p>
            </div>
          </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#202020]">
            {canManageTeam ? (
              <input
                type="checkbox"
                checked={selectAllChecked}
                onChange={(event) => toggleAllMembers(event.target.checked)}
                className="h-4 w-4 rounded border-black/20 text-[#cbb26b] focus:ring-[#cbb26b]"
              />
            ) : null}
            Select all
            {canManageTeam && selectedMembers.length ? (
              <span className="rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f7531]">
                {selectedMembers.length} selected
              </span>
            ) : null}
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {canManageTeam ? (
              <button
                type="button"
                onClick={() => setAddMemberOpen(true)}
                className="inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white"
              >
                Add teammate
              </button>
            ) : null}
            {canManageTeam && selectedMembers.length ? (
              <>
                <label className="flex items-center gap-2 text-[12px] font-medium text-[#202020]">
                  Bulk role
                  <select
                    value={bulkRole}
                    onChange={(event) => setBulkRole(event.target.value)}
                    className="rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] outline-none transition-colors focus:border-[#cbb26b]"
                  >
                    <option value="admin">Seller dashboard admin</option>
                    <option value="manager">Manager</option>
                    <option value="catalogue">Catalogue</option>
                    <option value="orders">Orders</option>
                    <option value="analytics">Analytics</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void saveSelectedMembers()}
                  disabled={bulkWorking}
                  className="inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {bulkWorking ? "Updating..." : "Apply to selected"}
                </button>
                <button
                  type="button"
                  onClick={() => void removeSelectedMembers()}
                  disabled={bulkWorking}
                  className="inline-flex h-9 items-center rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-3 text-[12px] font-semibold text-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {bulkWorking ? "Removing..." : "Remove selected"}
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {sortedMembers.length ? (
            sortedMembers.map((member) => {
              const memberKey = String(member.uid || member.email || "").trim();
              const draftRole = roleDrafts[memberKey] || member.role || "manager";
              const savedRole = String(member.role || "manager").trim().toLowerCase();
              const canEdit = canManageTeam && Boolean(memberKey);
              const isRemoving = removingMemberKey === memberKey;
              const isSaving = savingMemberKey === memberKey;
              const isSelected = selectedMemberKeys.includes(memberKey);
              const hasRoleChanged = String(draftRole).trim().toLowerCase() !== savedRole;
              const draftSystemAdmin = Boolean(systemAdminDrafts[memberKey]);
              const savedSystemAdmin = String(member.systemAccessType || "").trim().toLowerCase() === "admin";
              const hasSystemAdminChanged = draftSystemAdmin !== savedSystemAdmin;
              const joinedLabel = member.joinedAt ? formatMemberTime(member.joinedAt) : "recently";
              const activeLabel = formatMemberTime(member.lastActiveAt) || "not recorded yet";

              return (
                <div key={memberKey || `member-${member.email}`} className="rounded-[8px] border border-black/5 bg-[rgba(32,32,32,0.02)] px-4 py-3 text-[13px] text-[#202020]">
                  <div className="flex items-start gap-3">
                    {canManageTeam ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) => toggleMemberSelection(member, event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-black/20 text-[#cbb26b] focus:ring-[#cbb26b]"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-semibold">{member.email ?? member.uid}</p>
                        <span className="inline-flex w-fit rounded-full bg-[rgba(203,178,107,0.14)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f7531]">
                          {formatRoleLabel(member.role)}
                        </span>
                        {savedSystemAdmin ? (
                          <span className="inline-flex w-fit rounded-full bg-[rgba(32,32,32,0.08)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#202020]">
                            System admin
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#7d7d7d]">
                        <span>Joined {joinedLabel}</span>
                        <span>Last active {activeLabel}</span>
                      </div>
                      <p className="mt-2 text-[12px] leading-[1.5] text-[#57636c]">
                        {roleDescription(member.role)}
                      </p>
                    </div>
                  </div>
                  {canEdit ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3">
                      <select
                        value={draftRole}
                        onChange={(event) =>
                          setRoleDrafts((current) => ({
                            ...current,
                            [memberKey]: event.target.value,
                          }))
                        }
                        className="rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] outline-none transition-colors focus:border-[#cbb26b]"
                      >
                        <option value="admin">Seller dashboard admin</option>
                        <option value="manager">Manager</option>
                        <option value="catalogue">Catalogue</option>
                        <option value="orders">Orders</option>
                        <option value="analytics">Analytics</option>
                      </select>
                      {isSystemAdmin ? (
                        <label className="inline-flex items-center gap-2 rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] text-[#202020]">
                          <input
                            type="checkbox"
                            checked={draftSystemAdmin}
                            onChange={(event) =>
                              setSystemAdminDrafts((current) => ({
                                ...current,
                                [memberKey]: event.target.checked,
                              }))
                            }
                            className="h-4 w-4 rounded border-black/20 text-[#202020] focus:ring-[#202020]"
                          />
                          Grant system admin
                        </label>
                      ) : null}
                      {hasRoleChanged || hasSystemAdminChanged ? (
                        <button
                          type="button"
                          onClick={() => void saveMemberRole(member)}
                          disabled={isSaving}
                          className="inline-flex h-9 items-center rounded-[8px] bg-[#202020] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSaving ? "Saving..." : "Save"}
                        </button>
                      ) : (
                        <span className="inline-flex h-9 items-center rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.08)] px-3 text-[12px] font-semibold text-[#166534]">
                          Saved
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(member)}
                        disabled={isSaving}
                        className="inline-flex h-9 items-center rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-3 text-[12px] font-semibold text-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Remove
                      </button>
                      {isRemoving ? (
                        <span className="text-[11px] uppercase tracking-[0.12em] text-[#7d7d7d]">Removing...</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : loadingTeam ? (
            <p className="text-[13px] text-[#57636c]">Loading team members...</p>
          ) : (
            <p className="text-[13px] text-[#57636c]">No team members yet.</p>
          )}
        </div>
      </section>

      {addMemberOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setAddMemberOpen(false)}
        >
          <div
            className="relative w-full max-w-[760px] rounded-[8px] bg-white p-5 shadow-[0_20px_50px_rgba(20,24,27,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Add teammate</p>
                <h2 className="mt-1 text-[22px] font-semibold text-[#202020]">Grant access to this seller account</h2>
                <p className="mt-2 max-w-[600px] text-[13px] leading-[1.6] text-[#57636c]">
                  Add a teammate by email and choose the role they should have. Access is granted immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddMemberOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-[20px] leading-none text-[#57636c] transition-colors hover:bg-[#ededed]"
                aria-label="Close add teammate dialog"
              >
                ×
              </button>
            </div>

            {canManageTeam ? (
              <div className="mt-5 grid gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Email</span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value.replace(/\s+/g, ""))}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
                    placeholder="teammate@example.com"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#202020]">Role</span>
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    className="w-full rounded-[8px] border border-black/10 bg-white px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#cbb26b]"
                  >
                    <option value="admin">Seller dashboard admin</option>
                    <option value="manager">Manager</option>
                    <option value="catalogue">Catalogue</option>
                    <option value="orders">Orders</option>
                    <option value="analytics">Analytics</option>
                  </select>
                  <p className="mt-2 text-[12px] leading-[1.5] text-[#57636c]">
                    {roleDescription(role)}
                  </p>
                </label>
                {isSystemAdmin ? (
                  <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#202020]">
                    <input
                      type="checkbox"
                      checked={grantSystemAdmin}
                      onChange={(event) => setGrantSystemAdmin(event.target.checked)}
                      className="h-4 w-4 rounded border-black/20 text-[#202020] focus:ring-[#202020]"
                    />
                    Grant system admin access
                  </label>
                ) : null}
                {message ? (
                  <div className="rounded-[8px] border border-[#cfe8d8] bg-[rgba(57,169,107,0.07)] px-4 py-3 text-[12px] text-[#166534]">
                    {message}
                  </div>
                ) : null}
                {error ? (
                  <div className="rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[12px] text-[#b91c1c]">
                    {error}
                  </div>
                ) : null}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAddMemberOpen(false)}
                    className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendInvite()}
                    disabled={submitting || !email.trim() || !canManageTeam}
                    className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "Adding..." : "Grant access"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[8px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#b91c1c]">Read only</p>
                <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">
                  Only a <span className="font-semibold text-[#202020]">Seller dashboard admin</span> or{" "}
                  <span className="font-semibold text-[#202020]">seller account owner</span> can add, remove, or change team roles for{" "}
                  <span className="font-semibold text-[#202020]">{sellerLabel}</span>.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {removeTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setRemoveTarget(null)}
        >
          <div
            className="w-full max-w-[520px] rounded-[8px] bg-white p-5 shadow-[0_20px_50px_rgba(20,24,27,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Confirm removal</p>
            <h2 className="mt-2 text-[22px] font-semibold text-[#202020]">Remove team access?</h2>
            <p className="mt-2 text-[14px] leading-[1.6] text-[#57636c]">
              Remove <span className="font-semibold text-[#202020]">{removeTarget.email || removeTarget.uid}</span> from
              this seller account.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmRemoveMember()}
                disabled={Boolean(removingMemberKey)}
                className="inline-flex h-10 items-center rounded-[8px] bg-[#b91c1c] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {removingMemberKey ? "Removing..." : "Remove access"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </PageBody>
  );
}

export default function SellerTeamPage(props: SellerTeamPageProps = {}) {
  return (
    <Suspense
      fallback={
        <PageBody className="px-4 py-6 lg:px-6">
          <div className="mx-auto w-full max-w-[1200px]">
            <SellerPageIntro
              title="Seller team"
              description="Loading your team workspace..."
            />
          </div>
        </PageBody>
      }
    >
      <SellerTeamPageContent {...props} />
    </Suspense>
  );
}
