"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { clientStorage } from "@/lib/firebase";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";

type ProductItem = {
  id?: string;
  data?: {
    product?: {
      unique_id?: string | number;
      title?: string | null;
    };
  };
};

type ProductReview = {
  userId?: string;
  name?: string | null;
  stars?: number;
  comment?: string | null;
  images?: string[];
  verifiedPurchase?: boolean;
  createdAt?: string | null;
};

export function ProductReviewsSection({
  item,
  productId,
}: {
  item: ProductItem;
  productId: string;
}) {
  const { profile, isAuthenticated, openAuthModal } = useAuth();
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [canReview, setCanReview] = useState(false);
  const [reviewFilterStars, setReviewFilterStars] = useState<number | "all">("all");
  const [reviewFilterWithImages, setReviewFilterWithImages] = useState(false);
  const [reviewSort, setReviewSort] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [activeReviewImage, setActiveReviewImage] = useState<string | null>(null);
  const [reviewImagesUploading, setReviewImagesUploading] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const reviewUploadRef = useRef<HTMLInputElement | null>(null);

  const currentUserReview = useMemo(
    () => (profile?.uid ? reviews.find((review) => String(review?.userId || "") === profile.uid) || null : null),
    [profile?.uid, reviews],
  );

  const reviewSummary = useMemo(() => {
    const entries = Array.isArray(reviews) ? reviews : [];
    const count = entries.length;
    const average = count
      ? Number((entries.reduce((sum, review) => sum + Number(review?.stars || 0), 0) / count).toFixed(1))
      : 0;
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
    for (const review of entries) {
      const stars = Math.max(1, Math.min(5, Number(review?.stars || 0))) as 1 | 2 | 3 | 4 | 5;
      counts[stars] += 1;
    }
    return { average, count, counts };
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    const entries = [...reviews];
    const filtered = entries.filter((review) => {
      const stars = Math.max(1, Math.min(5, Number(review?.stars || 0)));
      if (reviewFilterStars !== "all" && stars !== reviewFilterStars) return false;
      if (reviewFilterWithImages && (!Array.isArray(review.images) || review.images.length === 0)) return false;
      return true;
    });
    filtered.sort((a, b) => {
      if (reviewSort === "highest") return Number(b?.stars || 0) - Number(a?.stars || 0);
      if (reviewSort === "lowest") return Number(a?.stars || 0) - Number(b?.stars || 0);
      const aTime = new Date(String(a?.createdAt || 0)).getTime();
      const bTime = new Date(String(b?.createdAt || 0)).getTime();
      if (reviewSort === "oldest") return aTime - bTime;
      return bTime - aTime;
    });
    return filtered;
  }, [reviewFilterStars, reviewFilterWithImages, reviewSort, reviews]);

  useEffect(() => {
    let cancelled = false;

    async function loadReviews() {
      if (!productId) return;
      setReviewsLoading(true);
      try {
        const params = new URLSearchParams({ productId });
        if (profile?.uid) params.set("uid", profile.uid);
        const response = await fetch(`/api/client/v1/products/reviews?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && payload?.ok !== false) {
          setReviews(Array.isArray(payload?.data?.reviews) ? payload.data.reviews : []);
          setCanReview(payload?.data?.canReview === true);
        }
      } finally {
        if (!cancelled) setReviewsLoading(false);
      }
    }

    void loadReviews();
    return () => {
      cancelled = true;
    };
  }, [productId, profile?.uid]);

  async function uploadReviewImages(files: FileList | null) {
    if (!files?.length || !profile?.uid || !productId) return;
    setReviewImagesUploading(true);
    setReviewMessage(null);
    try {
      const uploads: string[] = [];
      for (const file of Array.from(files).slice(0, Math.max(0, 6 - reviewImages.length))) {
        const fileRef = storageRef(
          clientStorage,
          `users/${profile.uid}/product-reviews/${productId}/${Date.now()}-${file.name}`,
        );
        await uploadBytes(fileRef, file, { contentType: file.type || "image/jpeg" });
        uploads.push(await getDownloadURL(fileRef));
      }
      setReviewImages((current) => [...current, ...uploads].slice(0, 6));
    } catch (cause) {
      setReviewMessage(cause instanceof Error ? cause.message : "Unable to upload review images.");
    } finally {
      setReviewImagesUploading(false);
    }
  }

  async function submitReview() {
    if (!isAuthenticated || !profile?.uid) {
      openAuthModal("Sign in to review this product.");
      return;
    }
    setReviewSubmitting(true);
    setReviewMessage(null);
    try {
      const response = await fetch("/api/client/v1/products/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          stars: reviewStars,
          comment: reviewComment,
          images: reviewImages,
          name: profile?.accountName || profile?.displayName || "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Unable to submit your review.");
      }
      setReviewMessage(payload?.message || "Review submitted.");
      setReviewComment("");
      setReviewImages([]);
      const refresh = await fetch(
        `/api/client/v1/products/reviews?productId=${encodeURIComponent(productId)}&uid=${encodeURIComponent(profile.uid)}`,
        { cache: "no-store" },
      );
      const refreshPayload = await refresh.json().catch(() => ({}));
      if (refresh.ok && refreshPayload?.ok !== false) {
        setReviews(Array.isArray(refreshPayload?.data?.reviews) ? refreshPayload.data.reviews : []);
        setCanReview(refreshPayload?.data?.canReview === true);
      }
      setReviewModalOpen(false);
    } catch (cause) {
      setReviewMessage(cause instanceof Error ? cause.message : "Unable to submit your review.");
    } finally {
      setReviewSubmitting(false);
    }
  }

  function removeReviewImage(url: string) {
    setReviewImages((current) => current.filter((item) => item !== url));
  }

  function openReviewEditor(review?: ProductReview | null) {
    if (review) {
      setReviewStars(Math.max(1, Math.min(5, Number(review.stars || 5))));
      setReviewComment(String(review.comment || ""));
      setReviewImages(Array.isArray(review.images) ? review.images.filter(Boolean).slice(0, 6) : []);
    } else {
      setReviewStars(5);
      setReviewComment("");
      setReviewImages([]);
    }
    setReviewMessage(null);
    setReviewModalOpen(true);
  }

  return (
    <>
      <section className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[20px] font-semibold text-[#202020]">Customer reviews</h2>
          <p className="text-[12px] text-[#57636c]">{reviews.length} review{reviews.length === 1 ? "" : "s"}</p>
        </div>

        <div className="mt-4 grid gap-4 rounded-[8px] border border-black/8 bg-[#fafafa] p-4 lg:grid-cols-[220px_1fr]">
          <div>
            <p className="text-[32px] font-semibold tracking-[-0.04em] text-[#202020]">
              {reviewSummary.average ? reviewSummary.average.toFixed(1) : "0.0"}
            </p>
            <p className="mt-1 text-[12px] font-semibold text-[#cbb26b]">
              {"★".repeat(Math.max(1, Math.round(reviewSummary.average || 0)))}
              <span className="ml-2 text-[#57636c]">{reviewSummary.count} total</span>
            </p>
            <p className="mt-2 text-[12px] text-[#57636c]">Average customer rating for this product.</p>
          </div>

          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = reviewSummary.counts[star as 1 | 2 | 3 | 4 | 5];
              const width = reviewSummary.count ? (count / reviewSummary.count) * 100 : 0;
              return (
                <div key={star} className="grid grid-cols-[52px_1fr_42px] items-center gap-3 text-[12px] text-[#57636c]">
                  <button
                    type="button"
                    onClick={() =>
                      setReviewFilterStars((current) => (current === star ? "all" : (star as 1 | 2 | 3 | 4 | 5)))
                    }
                    className={`text-left font-semibold transition ${reviewFilterStars === star ? "text-[#202020]" : "hover:text-[#202020]"}`}
                  >
                    {star} star
                  </button>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-[#cbb26b]" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {canReview ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-[8px] border border-black/10 bg-[#fafafa] p-4">
            <div>
              <p className="text-[14px] font-semibold text-[#202020]">
                {currentUserReview ? "Want to update your review?" : "Used this item?"}
              </p>
              <p className="mt-1 text-[12px] text-[#57636c]">
                {currentUserReview
                  ? "You can edit your rating, comment, and uploaded photos any time."
                  : "Share your experience and add photos if you want to."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openReviewEditor(currentUserReview)}
              className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white"
            >
              {currentUserReview ? "Edit review" : "Add review"}
            </button>
          </div>
        ) : null}
        {reviewMessage ? <p className="mt-3 text-[12px] text-[#57636c]">{reviewMessage}</p> : null}

        <div className="mt-4 flex flex-col gap-3 rounded-[8px] border border-black/8 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setReviewFilterStars("all")}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${reviewFilterStars === "all" ? "border-[#202020] bg-[#202020] text-white" : "border-black/10 bg-white text-[#202020]"}`}
            >
              All reviews
            </button>
            {[5, 4, 3, 2, 1].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setReviewFilterStars(star as 1 | 2 | 3 | 4 | 5)}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${reviewFilterStars === star ? "border-[#202020] bg-[#202020] text-white" : "border-black/10 bg-white text-[#202020]"}`}
              >
                {star} star
              </button>
            ))}
            <button
              type="button"
              onClick={() => setReviewFilterWithImages((current) => !current)}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${reviewFilterWithImages ? "border-[#202020] bg-[#202020] text-white" : "border-black/10 bg-white text-[#202020]"}`}
            >
              With images
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#57636c]">
            <span>Sort by</span>
            <select
              value={reviewSort}
              onChange={(event) => setReviewSort(event.target.value as "newest" | "oldest" | "highest" | "lowest")}
              className="h-10 rounded-[8px] border border-black/10 bg-white px-3 text-[12px] font-semibold text-[#202020] outline-none"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="highest">Highest rating</option>
              <option value="lowest">Lowest rating</option>
            </select>
          </label>
        </div>

        <div className="mt-5 space-y-4">
          {reviewsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-28 rounded-[8px] bg-[#f3f3f0] animate-pulse" />
              ))}
            </div>
          ) : filteredReviews.length ? (
            filteredReviews.map((review, index) => (
              <article key={`${review.userId || "review"}-${index}`} className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-[#202020]">{review.name || "Verified buyer"}</p>
                    {review.verifiedPurchase ? (
                      <span className="rounded-full bg-[rgba(26,133,83,0.12)] px-2 py-1 text-[10px] font-semibold text-[#1a8553]">
                        Verified purchase
                      </span>
                    ) : null}
                    <span className="text-[12px] text-[#cbb26b]">
                      {"★".repeat(Math.max(1, Math.min(5, Number(review.stars || 0))))}
                    </span>
                    {profile?.uid && String(review.userId || "") === profile.uid ? (
                      <button
                        type="button"
                        onClick={() => openReviewEditor(review)}
                        className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] font-semibold text-[#202020]"
                      >
                        Edit review
                      </button>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-[#8b94a3]">
                    {review.createdAt
                      ? new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" }).format(
                          new Date(review.createdAt),
                        )
                      : ""}
                  </p>
                </div>
                {review.comment ? <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">{review.comment}</p> : null}
                {Array.isArray(review.images) && review.images.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.images.map((url) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setActiveReviewImage(url)}
                        className="overflow-hidden rounded-[8px] border border-black/10 transition hover:border-[#cbb26b]"
                        aria-label="Open review image"
                      >
                        <img src={url} alt="Customer review" className="h-20 w-20 object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <p className="text-[13px] text-[#57636c]">
              {reviews.length ? "No reviews match the selected filters." : "No reviews yet."}
            </p>
          )}
        </div>
      </section>

      {reviewModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(20,24,27,0.48)] px-4">
          <div className="w-full max-w-[560px] rounded-[12px] bg-white p-6 shadow-[0_24px_80px_rgba(20,24,27,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">
                  {currentUserReview ? "Edit review" : "Add review"}
                </p>
                <h3 className="mt-2 text-[22px] font-semibold text-[#202020]">
                  {item.data?.product?.title || "Product"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="rounded-[8px] border border-black/10 px-3 py-2 text-[12px] font-semibold text-[#202020]"
              >
                Close
              </button>
            </div>

            <div className="mt-5">
              <p className="text-[12px] font-semibold text-[#202020]">Your rating</p>
              <div className="mt-2 flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewStars(star)}
                    className={star <= reviewStars ? "text-[24px] text-[#cbb26b]" : "text-[24px] text-[#d6d6d6]"}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-[12px] font-semibold text-[#202020]">Your review</span>
              <textarea
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                rows={5}
                className="w-full rounded-[8px] border border-black/10 px-3 py-3 text-[13px] outline-none focus:border-[#cbb26b]"
                placeholder="Tell other shoppers what stood out about this product."
              />
            </label>

            <div className="mt-5 rounded-[8px] border border-black/10 bg-[#fafafa] px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold text-[#202020]">Photos</p>
                  <p className="text-[12px] text-[#57636c]">Upload up to 6 images.</p>
                </div>
                <button
                  type="button"
                  onClick={() => reviewUploadRef.current?.click()}
                  disabled={reviewImagesUploading}
                  className="rounded-[8px] border border-black/10 bg-white px-3 py-2 text-[12px] font-semibold text-[#202020] disabled:opacity-50"
                >
                  {reviewImagesUploading ? "Uploading images..." : "Add images"}
                </button>
              </div>
              <input
                ref={reviewUploadRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => void uploadReviewImages(event.target.files)}
              />
              {reviewImagesUploading ? (
                <span className="mt-3 block text-[12px] text-[#57636c]">Uploading images...</span>
              ) : reviewImages.length ? (
                <span className="mt-3 block text-[12px] text-[#57636c]">
                  {reviewImages.length} image{reviewImages.length === 1 ? "" : "s"} attached
                </span>
              ) : null}
              {reviewMessage ? <p className="mt-3 text-[12px] text-[#57636c]">{reviewMessage}</p> : null}
              {reviewImages.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {reviewImages.map((url) => (
                    <div key={url} className="relative h-20 w-20 overflow-hidden rounded-[8px] border border-black/10">
                      <img src={url} alt="Review upload" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeReviewImage(url)}
                        className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[12px] font-semibold text-[#202020] shadow-[0_4px_12px_rgba(20,24,27,0.12)]"
                        aria-label="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="rounded-[8px] border border-black/10 px-4 py-2 text-[13px] font-semibold text-[#202020]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitReview()}
                disabled={reviewSubmitting || reviewImagesUploading}
                className="inline-flex h-10 items-center rounded-[8px] bg-[#202020] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {reviewSubmitting ? "Submitting..." : currentUserReview ? "Update review" : "Submit review"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeReviewImage ? (
        <button
          type="button"
          onClick={() => setActiveReviewImage(null)}
          className="fixed inset-0 z-[130] flex items-center justify-center bg-[rgba(20,24,27,0.8)] px-4"
        >
          <img
            src={activeReviewImage}
            alt="Customer review full size"
            className="max-h-[88vh] max-w-[88vw] rounded-[12px] object-contain shadow-[0_24px_80px_rgba(20,24,27,0.28)]"
          />
        </button>
      ) : null}
    </>
  );
}
