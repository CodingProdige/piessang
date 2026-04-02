import Link from "next/link";
import { notFound } from "next/navigation";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import { listSellerRatings } from "@/lib/social/seller-ratings";

type SellerReview = {
  docId?: string;
  userId?: string;
  customerName?: string;
  verifiedPurchase?: boolean;
  stars?: number;
  comment?: string;
  images?: string[];
  createdAt?: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export const dynamic = "force-dynamic";

export default async function VendorReviewsPage({ params }: { params: Promise<{ sellerSlug: string }> }) {
  const { sellerSlug } = await params;
  const owner = await findSellerOwnerByIdentifier(sellerSlug);
  if (!owner) notFound();

  const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
  const vendorName = String(seller?.vendorName || seller?.groupVendorName || sellerSlug).trim() || sellerSlug;
  const sellerCode = String(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode || sellerSlug).trim() || sellerSlug;
  const { reviews, summary } = await listSellerRatings({ sellerCode, sellerSlug });
  const safeReviews = reviews as SellerReview[];

  return (
    <main className="mx-auto max-w-[1160px] px-3 py-4 lg:px-4 lg:py-6">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#57636c]">
        <Link href={`/vendors/${encodeURIComponent(sellerSlug)}`} className="font-semibold text-[#0f80c3]">Seller profile</Link>
        <span>/</span>
        <span className="text-[#202020]">Seller ratings</span>
      </div>

      <section className="mt-4 rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Seller ratings</p>
            <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.03em] text-[#202020]">{vendorName}</h1>
          </div>
          <div className="text-right">
            <p className="text-[32px] font-semibold tracking-[-0.04em] text-[#202020]">{summary.average ? summary.average.toFixed(1) : "0.0"}</p>
            <p className="mt-1 text-[12px] font-semibold text-[#cbb26b]">{"★".repeat(Math.max(1, Math.round(summary.average || 0)))} <span className="ml-2 text-[#57636c]">{summary.count} total</span></p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 rounded-[8px] border border-black/8 bg-[#fafafa] p-4 lg:grid-cols-[220px_1fr]">
          <div>
            <p className="text-[32px] font-semibold tracking-[-0.04em] text-[#202020]">{summary.average ? summary.average.toFixed(1) : "0.0"}</p>
            <p className="mt-1 text-[12px] font-semibold text-[#cbb26b]">{"★".repeat(Math.max(1, Math.round(summary.average || 0)))}<span className="ml-2 text-[#57636c]">{summary.count} total</span></p>
            <p className="mt-2 text-[12px] text-[#57636c]">Average customer rating for this seller.</p>
          </div>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary.counts?.[star as 1 | 2 | 3 | 4 | 5] || 0;
              const width = summary.count ? (count / summary.count) * 100 : 0;
              return (
                <div key={star} className="grid grid-cols-[52px_1fr_42px] items-center gap-3 text-[12px] text-[#57636c]">
                  <span className="font-semibold">{star} star</span>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-[#cbb26b]" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {safeReviews.length ? (
            safeReviews.map((review, index) => (
              <article key={review.docId || `${review.userId || "review"}-${index}`} className="rounded-[8px] border border-black/5 bg-[#fafafa] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-[#202020]">{review.customerName || "Verified buyer"}</p>
                    {review.verifiedPurchase ? <span className="rounded-full bg-[rgba(26,133,83,0.12)] px-2 py-1 text-[10px] font-semibold text-[#1a8553]">Verified purchase</span> : null}
                    <span className="text-[12px] text-[#cbb26b]">{"★".repeat(Math.max(1, Math.min(5, Number(review.stars || 0))))}</span>
                  </div>
                  <p className="text-[11px] text-[#8b94a3]">{formatDate(review.createdAt)}</p>
                </div>
                {review.comment ? <p className="mt-2 text-[13px] leading-[1.6] text-[#57636c]">{review.comment}</p> : null}
                {Array.isArray(review.images) && review.images.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.images.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-[8px] border border-black/10 transition hover:border-[#cbb26b]">
                        <img src={url} alt="Seller review" className="h-20 w-20 object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <p className="text-[13px] text-[#57636c]">No seller ratings yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
