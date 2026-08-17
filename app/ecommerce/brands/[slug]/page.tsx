import { redirect } from "next/navigation";

export default async function LegacyBrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/ecommerce/products?brand=${encodeURIComponent(slug)}`);
}
