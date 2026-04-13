"use client";

import Image from "next/image";
import Link from "next/link";
import { ProductLink } from "@/components/products/product-link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ConfirmModal } from "@/components/ui/confirm-modal";

type AccountReviewItem = {
  docId: string;
  productId: string;
  productDocId: string;
  productTitle: string;
  productSlug?: string;
  productImage?: string;
  average?: number;
  count?: number;
  review: {
    userId: string;
    name: string;
    stars: number;
    comment?: string;
    images?: string[];
    verifiedPurchase?: boolean;
    createdAt?: string;
    updatedAt?: string;
  };
};

function toStr(value: unknown, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function formatDateTime(value?: string) {
  const input = toStr(value);
  if (!input) return "Unknown";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function renderStars(stars: number) {
  return Array.from({ length: 5 }, (_, index) => index + 1 <= stars);
}

export function AccountProductReviewsWorkspace() {
  const { uid, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AccountReviewItem[]>([]);
  const [activeReview, setActiveReview] = useState<AccountReviewItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AccountReviewItem | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!isAuthenticated || !uid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/client/v1/accounts/reviews?uid=${encodeURIComponent(String(uid))}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to load your reviews.");
        if (!cancelled) setItems(Array.isArray(payload?.data?.reviews) ? payload.data.reviews : []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load your reviews.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, uid]);

  function openEdit(item: AccountReviewItem) {
    setActiveReview(item);
    setStars(Number(item?.review?.stars || 5));
    setComment(toStr(item?.review?.comment));
  }

  async function submitEdit() {
    if (!activeReview || !uid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/products/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: activeReview.productId,
          stars,
          comment,
          images: activeReview.review.images || [],
          name: activeReview.review.name,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to update your review.");
      setItems((current) =>
        current.map((entry) =>
          entry.docId !== activeReview.docId
            ? entry
            : {
                ...entry,
                review: {
                  ...entry.review,
                  stars,
                  comment,
                  updatedAt: new Date().toISOString(),
                },
              },
        ),
      );
      setNotice("Review updated.");
      setActiveReview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update your review.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteReview(item: AccountReviewItem) {
    if (!uid || deletingId === item.docId) return;
    setDeletingId(item.docId);
    setError(null);
    try {
      const response = await fetch("/api/client/v1/products/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: item.productId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.message || "Unable to delete your review.");
      setItems((current) => current.filter((entry) => entry.docId !== item.docId));
      if (activeReview?.docId === item.docId) setActiveReview(null);
      setPendingDelete(null);
      setNotice("Review deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete your review.");
    } finally {
      setDeletingId(null);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="rounded-[24px] border border-black/6 bg-white px-6 py-10 text-[14px] text-[#57636c] shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
        Sign in to view your product reviews.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#57636c]">
        <Link href="/account" className="font-semibold text-[#0f80c3]">My Account</Link>
        <span>/</span>
        <span className="text-[#202020]">Product reviews</span>
      </div>

      <section className="rounded-[24px] border border-black/6 bg-white p-5 shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#202020]">Product reviews</h1>
        <p className="mt-2 text-[14px] text-[#57636c]">See every product review you’ve left and update it whenever you need to.</p>
      </section>

      {notice ? <div className="rounded-[18px] border border-[#b7f0cf] bg-[#ecfdf5] px-4 py-3 text-[14px] text-[#166534]">{notice}</div> : null}
      {error ? <div className="rounded-[18px] border border-[#f0c7cb] bg-[#fff7f8] px-4 py-3 text-[14px] text-[#b91c1c]">{error}</div> : null}

      <section className="rounded-[24px] border border-black/6 bg-white shadow-[0_12px_30px_rgba(20,24,27,0.06)]">
        {loading ? (
          <div className="px-6 py-10 text-[14px] text-[#57636c]">Loading your reviews…</div>
        ) : items.length ? (
          <div className="divide-y divide-black/6">
            {items.map((item) => (
              <article key={item.docId} className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 gap-4">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[16px] border border-black/8 bg-[#f8f8f8]">
                    {item.productImage ? (
                      <Image src={item.productImage} alt={item.productTitle} fill className="object-cover" sizes="80px" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-[#907d4c]">Item</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <ProductLink href={item.productSlug ? `/products/${item.productSlug}` : "#"} className="text-[18px] font-semibold text-[#202020]">
                      {item.productTitle}
                    </ProductLink>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1">
                        {renderStars(Number(item.review.stars || 0)).map((filled, index) => (
                          <span key={`${item.docId}-star-${index}`} className={`text-[14px] ${filled ? "text-[#cbb26b]" : "text-[#d7dce2]"}`}>★</span>
                        ))}
                      </div>
                      <span className="text-[13px] font-semibold text-[#202020]">{Number(item.review.stars || 0).toFixed(1)}</span>
                      <span className="text-[13px] text-[#57636c]">Updated {formatDateTime(item.review.updatedAt || item.review.createdAt)}</span>
                    </div>
                    <p className="mt-3 text-[14px] leading-[1.6] text-[#57636c]">{item.review.comment || "No written comment added."}</p>
                    {Array.isArray(item.review.images) && item.review.images.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.review.images.map((url, index) => (
                          <div key={`${url}-${index}`} className="relative h-16 w-16 overflow-hidden rounded-[12px] border border-black/8 bg-white">
                            <Image src={url} alt={`${item.productTitle} review image ${index + 1}`} fill className="object-cover" sizes="64px" />
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]"
                  >
                    Edit review
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(item)}
                    disabled={deletingId === item.docId}
                    className="inline-flex h-11 items-center rounded-[14px] border border-[#f0c7cb] bg-[#fff7f8] px-4 text-[14px] font-semibold text-[#b91c1c] disabled:opacity-60"
                  >
                    {deletingId === item.docId ? "Deleting..." : "Delete review"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-6 py-10 text-[14px] text-[#57636c]">You haven’t reviewed any products yet.</div>
        )}
      </section>

      {activeReview ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/35 px-4" onClick={() => setActiveReview(null)}>
          <div
            className="w-full max-w-[640px] rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.24)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[24px] font-semibold tracking-[-0.03em] text-[#202020]">Edit review</p>
                <p className="mt-2 text-[14px] text-[#57636c]">{activeReview.productTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveReview(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[18px] text-[#57636c]"
                aria-label="Close review modal"
              >
                ×
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setStars(star)}
                  className={`rounded-full border px-4 py-2 text-[14px] font-semibold transition ${stars === star ? "border-[#202020] bg-[#202020] text-white" : "border-black/10 bg-white text-[#202020]"}`}
                >
                  {star} star{star === 1 ? "" : "s"}
                </button>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Tell other customers what you thought of the product."
              className="mt-5 min-h-[120px] w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-[14px] text-[#202020] outline-none placeholder:text-[#8b94a3]"
            />

            {Array.isArray(activeReview.review.images) && activeReview.review.images.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {activeReview.review.images.map((url, index) => (
                  <div key={`${url}-${index}`} className="relative h-16 w-16 overflow-hidden rounded-[12px] border border-black/8 bg-white">
                    <Image src={url} alt={`${activeReview.productTitle} review image ${index + 1}`} fill className="object-cover" sizes="64px" />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void submitEdit()}
                disabled={submitting}
                className="inline-flex h-11 items-center rounded-[14px] bg-[#202020] px-4 text-[14px] font-semibold text-white disabled:opacity-60"
              >
                {submitting ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => setActiveReview(null)}
                className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#202020]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(pendingDelete)}
        eyebrow="Delete review"
        title="Are you sure?"
        description={
          pendingDelete
            ? `This will permanently remove your review for ${pendingDelete.productTitle}. Your rating, comment, and any attached review photos will no longer appear on the product.`
            : ""
        }
        confirmLabel={pendingDelete && deletingId === pendingDelete.docId ? "Deleting..." : "Delete review"}
        busy={Boolean(pendingDelete && deletingId === pendingDelete.docId)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete ? deleteReview(pendingDelete) : undefined}
      />
    </div>
  );
}
