import type { Metadata } from "next";
import CompareWorkspace from "@/components/ecommarce/compare/CompareWorkspace";
import { normalizeCompareProductIds } from "@/lib/product-compare";
import { getStorefrontProductDetail } from "@/lib/storefront-product-detail";

export const metadata: Metadata = {
  title: "Compare products",
  description: "Compare product pricing, stock and specifications side by side.",
  robots: { index: false, follow: true },
};

type ComparePageProps = {
  searchParams: Promise<{ ids?: string | string[] }>;
};

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const rawIds = Array.isArray(params.ids) ? params.ids.join(",") : params.ids || "";
  const ids = normalizeCompareProductIds(rawIds.split(","));
  const products = (
    await Promise.all(ids.map((id) => getStorefrontProductDetail(id)))
  ).filter((product): product is NonNullable<typeof product> => Boolean(product));

  return <CompareWorkspace products={products} />;
}
