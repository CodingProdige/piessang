import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlurhashImage } from "@/components/shared/blurhash-image";
import { ProductsResults } from "@/components/products/products-results";
import { findSellerOwnerByIdentifier } from "@/lib/seller/team-admin";
import {
  getSellerUnavailableReason,
  isSellerAccountUnavailable,
} from "@/lib/seller/account-status";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;
type SearchParamsInput = Record<string, SearchParamValue> | Promise<Record<string, SearchParamValue>>;

type VendorBranding = {
  bannerImageUrl?: string | null;
  bannerBlurHashUrl?: string | null;
  bannerAltText?: string | null;
  bannerObjectPosition?: string | null;
  logoImageUrl?: string | null;
  logoBlurHashUrl?: string | null;
  logoAltText?: string | null;
  logoObjectPosition?: string | null;
};

type VendorPayload = {
  seller?: {
    sellerSlug?: string | null;
    sellerCode?: string | null;
    vendorName?: string | null;
    vendorDescription?: string | null;
    branding?: VendorBranding | null;
    media?: VendorBranding | null;
  };
  items?: Array<{ id?: string; data?: Record<string, any> }>;
  total?: number;
};

function currentParam(searchParams: Record<string, SearchParamValue>, key: string) {
  const value = searchParams[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

async function fetchVendorProducts(vendorName: string, sellerSlug: string, origin: string) {
  const params = new URLSearchParams();
  params.set("vendorName", vendorName);
  params.set("sellerCode", sellerSlug);
  params.set("isActive", "true");
  params.set("limit", "all");
  const response = await fetch(new URL(`/api/catalogue/v1/products/product/get?${params.toString()}`, origin), {
    cache: "no-store",
  });
  return (await response.json()) as VendorPayload;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sellerSlug: string }>;
}): Promise<Metadata> {
  const { sellerSlug } = await params;
  const owner = await findSellerOwnerByIdentifier(sellerSlug);
  const seller = owner?.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
  const vendorName = String(seller?.vendorName || seller?.groupVendorName || sellerSlug).trim() || sellerSlug;
  const sellerCode = String(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode || sellerSlug).trim() || sellerSlug;
  const unavailable = owner ? isSellerAccountUnavailable(owner.data) : false;

  return {
    title: unavailable ? `${vendorName} is no longer open on Piessang` : `${vendorName} | Piessang vendor`,
    robots: unavailable ? { index: false, follow: false } : { index: true, follow: true },
  };
}

export default async function VendorPage({
  params,
  searchParams,
}: {
  params: Promise<{ sellerSlug: string }>;
  searchParams: SearchParamsInput;
}) {
  const { sellerSlug } = await params;
  const resolvedSearchParams = await searchParams;
  const owner = await findSellerOwnerByIdentifier(sellerSlug);
  if (!owner) notFound();
  const unavailable = isSellerAccountUnavailable(owner.data);

  const seller = owner.data?.seller && typeof owner.data.seller === "object" ? owner.data.seller : {};
  const vendorName = String(seller?.vendorName || seller?.groupVendorName || sellerSlug).trim() || sellerSlug;
  const vendorDescription = String(seller?.vendorDescription || seller?.description || "").trim();
  const sellerCode = String(seller?.sellerCode || seller?.activeSellerCode || seller?.groupSellerCode || sellerSlug).trim() || sellerSlug;
  const branding = (seller?.branding && typeof seller.branding === "object" ? seller.branding : seller?.media) || {};
  const unavailableReason = getSellerUnavailableReason(owner.data);

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") || "http://localhost:3000";
  const payload = unavailable ? null : await fetchVendorProducts(vendorName, sellerCode, origin);
  const products = Array.isArray(payload?.items) ? payload.items : [];
  const totalCount = products.length;

  return (
    <main className="mx-auto max-w-[1400px] px-3 py-4 lg:px-4 lg:py-6">
      <section className="overflow-hidden rounded-[8px] bg-white shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <div className="relative">
          <div className="relative h-[220px] w-full bg-[#fff]">
            {branding.bannerImageUrl ? (
              <BlurhashImage
                src={branding.bannerImageUrl}
                blurHash={branding.bannerBlurHashUrl ?? ""}
                alt={branding.bannerAltText || `${vendorName} banner`}
                className="h-full w-full"
                imageClassName="object-cover"
                imageStyle={{ objectPosition: branding.bannerObjectPosition || "center center" }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#faf6ea,#f5f5f5)] text-center">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Vendor</p>
                  <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-[#202020]">
                    {vendorName}
                  </h1>
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/18 via-black/6 to-transparent" />
          </div>

          <div className="-mt-10 px-4 pb-4 lg:px-5">
            <div className="flex flex-col gap-4 rounded-[8px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(20,24,27,0.07)] lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[8px] border border-black/10 bg-white">
                  {branding.logoImageUrl ? (
                    <BlurhashImage
                      src={branding.logoImageUrl}
                      blurHash={branding.logoBlurHashUrl ?? ""}
                      alt={branding.logoAltText || `${vendorName} logo`}
                      className="h-full w-full"
                      imageClassName="object-contain"
                      imageStyle={{ objectPosition: branding.logoObjectPosition || "center center" }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b94a3]">
                      Logo
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Vendor page</p>
                  <h2 className="mt-1 text-[24px] font-semibold text-[#202020]">{vendorName}</h2>
                  <p className="mt-1 max-w-[62ch] text-[13px] leading-[1.6] text-[#57636c]">
                    {vendorDescription || "Browse this vendor's live products and see their branding in one place."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {unavailable ? (
                  <span className="rounded-full bg-[rgba(220,38,38,0.08)] px-3 py-1.5 text-[12px] font-semibold text-[#b91c1c]">
                    Closed
                  </span>
                ) : (
                  <>
                    <span className="rounded-full bg-[rgba(203,178,107,0.12)] px-3 py-1.5 text-[12px] font-semibold text-[#907d4c]">
                      {totalCount} products
                    </span>
                    <Link
                      href={`/products?vendor=${encodeURIComponent(sellerCode)}`}
                      className="inline-flex h-10 items-center rounded-[8px] border border-black/10 bg-white px-4 text-[13px] font-semibold text-[#202020] transition-colors hover:border-[#cbb26b] hover:text-[#cbb26b]"
                    >
                      View in catalogue
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {unavailable ? (
        <section className="mt-4 rounded-[8px] bg-white p-6 text-center shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b91c1c]">Seller unavailable</p>
          <h2 className="mt-2 text-[24px] font-semibold text-[#202020]">
            This seller is no longer open for business on our marketplace.
          </h2>
          <p className="mt-2 text-[13px] leading-[1.7] text-[#57636c]">
            {unavailableReason.reasonMessage ||
              "Their products and vendor page are no longer visible on Piessang."}
          </p>
        </section>
      ) : (
        <div className="mt-4">
          <ProductsResults
            initialItems={products}
            currentSort={currentParam(resolvedSearchParams, "sort") || "featured"}
            currentView="grid"
            openInNewTab={false}
            searchParams={{ vendor: sellerCode }}
            totalCount={totalCount}
          />
        </div>
      )}
    </main>
  );
}
