import { ProductsPage, generateMetadata as generateProductsMetadata } from "../page";

export const dynamic = "force-dynamic";

export const generateMetadata = generateProductsMetadata;

export default async function ProductSlugPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return <ProductsPage searchParams={searchParams} />;
}
