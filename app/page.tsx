import type { Metadata } from "next";
import { LandingPageRenderer } from "@/components/cms/landing-page-renderer";
import { PageBody } from "@/components/layout/page-body";
import { getLandingPageState, getPublishedLandingPage } from "@/lib/cms/landing-page";
import { getServerAuthBootstrap } from "@/lib/auth/server";
import { buildSeoMetadata, getSeoPageOverride } from "@/lib/seo/page-overrides";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedLandingPage();
  const override = await getSeoPageOverride("home");
  return buildSeoMetadata(
    "home",
    {
      title: override?.title || page.seo.title || "Home",
      description:
        override?.description ||
        page.seo.description ||
        "Shop Piessang for curated products from trusted sellers, with secure checkout, delivery support, and account tools built for repeat buying.",
    },
    {
      path: "/",
      image: "/backgrounds/monkey-on-beach-wide.png",
    },
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const preview = typeof params.preview === "string" ? params.preview : "";
  const wantsDraftPreview = preview === "draft";
  let isAdmin = false;

  if (wantsDraftPreview) {
    const auth = await getServerAuthBootstrap();
    isAdmin = String(auth?.profile?.systemAccessType || "").trim().toLowerCase() === "admin";
  }

  const page = wantsDraftPreview && isAdmin ? await getLandingPageState() : await getPublishedLandingPage();
  const sections = preview === "draft" && isAdmin ? page.draftSections : page.publishedSections;

  return (
    <PageBody className="py-8">
      {preview === "draft" && isAdmin ? (
        <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#cbb26b]/30 bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(255,255,255,0.96))] px-4 py-3 text-[13px] text-[#5f5326] shadow-[0_10px_24px_rgba(20,24,27,0.04)]">
          <div>
            <p className="font-semibold text-[#202020]">Draft preview</p>
            <p className="mt-1">You’re viewing the unpublished homepage draft. Shoppers still see the published version.</p>
          </div>
          <a
            href="/seller/dashboard?section=admin-landing-builder"
            className="inline-flex h-10 items-center rounded-[12px] border border-black/10 bg-white px-4 font-semibold text-[#202020]"
          >
            Back to builder
          </a>
        </section>
      ) : null}
      <LandingPageRenderer sections={sections} />
    </PageBody>
  );
}
