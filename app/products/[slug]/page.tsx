import { ProductsPage } from "../page";

export const dynamic = "force-dynamic";

export default async function ProductSlugPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return <ProductsPage searchParams={searchParams} />;
}
