import Link from "next/link";
import type { Metadata } from "next";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

type CategoryItem = {
  slug?: string | null;
  title?: string | null;
};

type SubCategoryItem = {
  slug?: string | null;
  title?: string | null;
  kind?: string | null;
};

type ProductItem = {
  data?: {
    grouping?: {
      category?: string | null;
      subCategory?: string | null;
    };
  };
};

type CategoryCard = {
  slug: string;
  title: string;
  productCount: number;
};

export const metadata: Metadata = {
  title: "Browse Categories | Piessang",
  description: "Explore Piessang categories and jump straight into the products you want to shop.",
};

async function loadCategoryData() {
  const db = getAdminDb();
  if (!db) return [];

  const [categorySnapshot, productSnapshot] = await Promise.all([
    db.collection("categories").where("placement.isActive", "==", true).get(),
    db.collection("products_v2").where("placement.isActive", "==", true).get(),
  ]);

  const categories = categorySnapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      return {
        slug: String(data?.category?.slug || "").trim(),
        title: String(data?.category?.title || "").trim(),
      };
    })
    .filter((item) => item.slug && item.title);

  const allProducts = productSnapshot.docs.map((doc) => ({ data: doc.data() || {} })) as ProductItem[];

  const cards = await Promise.all(
    categories.map(async (category) => {
      const subSnapshot = await db
        .collection("sub_categories")
        .where("placement.isActive", "==", true)
        .where("grouping.category", "==", category.slug)
        .get()
        .catch(() => null);

      const categoryProducts = allProducts.filter(
        (item) => String(item?.data?.grouping?.category || "").trim() === category.slug,
      );

      const subcategories = (subSnapshot?.docs || [])
        .map((item) => {
          const data = item.data() || {};
          const slug = String(data?.subCategory?.slug || "").trim();
          const title = String(data?.subCategory?.title || "").trim();
          if (!slug || !title) return null;
          const productCount = categoryProducts.filter(
            (product) => String(product?.data?.grouping?.subCategory || "").trim() === slug,
          ).length;
          return { slug, title, productCount };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .filter((item) => item.productCount > 0)
        .sort((a, b) => b.productCount - a.productCount);

      return {
        ...category,
        productCount: categoryProducts.length,
      };
    }),
  );

  return cards.filter((item) => item.productCount > 0).sort((a, b) => b.productCount - a.productCount);
}

function categoryHref(categorySlug: string, subCategorySlug?: string) {
  const params = new URLSearchParams({ category: categorySlug });
  if (subCategorySlug) params.set("subCategory", subCategorySlug);
  return `/products?${params.toString()}`;
}

function CategoryIcon({ slug }: { slug: string }) {
  const iconClass = "h-6 w-6";
  return (
    <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
    </svg>
  );
}

export default async function CategoriesPage() {
  const categories = await loadCategoryData();

  return (
    <main className="mx-auto max-w-[1180px] px-3 py-6 lg:px-4 lg:py-8">
      <section className="rounded-[8px] bg-white p-6 shadow-[0_8px_24px_rgba(20,24,27,0.07)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907d4c]">Browse Categories</p>
        <h1 className="mt-2 text-[30px] font-semibold text-[#202020]">Shop by category</h1>
        <p className="mt-3 max-w-[760px] text-[14px] leading-[1.7] text-[#57636c]">
          Explore every live category on Piessang and jump directly into the products and subcategories that currently have stock available.
        </p>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <div
            key={category.slug}
            className="rounded-[8px] bg-white p-5 shadow-[0_8px_24px_rgba(20,24,27,0.06)] transition-shadow hover:shadow-[0_14px_30px_rgba(20,24,27,0.10)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-black/5 bg-[#f6f2e8] text-[#4a4545] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                  <CategoryIcon slug={category.slug} />
                </span>
                <div>
                <Link href={categoryHref(category.slug)} className="text-[20px] font-semibold text-[#202020]">
                  {category.title}
                </Link>
                <p className="mt-2 text-[13px] text-[#57636c]">
                  {category.productCount} {category.productCount === 1 ? "product" : "products"} live
                </p>
                </div>
              </div>
              <span className="inline-flex rounded-full bg-[rgba(227,197,47,0.16)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#907d4c]">
                Category
              </span>
            </div>

            <Link
              href={categoryHref(category.slug)}
              className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-[#4a4545] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2f343b]"
            >
              View category
            </Link>
          </div>
        ))}
      </section>
    </main>
  );
}
