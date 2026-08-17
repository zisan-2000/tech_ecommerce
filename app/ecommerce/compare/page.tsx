import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import AddToCartButton from "@/components/ecommarce/AddToCartButton";
import CompareProductActions from "@/components/ecommarce/compare/CompareProductActions";
import { getProductAvailableStock } from "@/lib/product-purchase";
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

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const rawIds = Array.isArray(params.ids) ? params.ids.join(",") : params.ids || "";
  const ids = normalizeCompareProductIds(rawIds.split(","));
  const products = (
    await Promise.all(ids.map((id) => getStorefrontProductDetail(id)))
  ).filter((product): product is NonNullable<typeof product> => Boolean(product));

  if (!products.length) {
    return (
      <main className="container min-h-[60vh] px-4 py-16 text-center sm:px-6">
        <h1 className="text-3xl font-black">Compare products</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Select up to four products from the catalog or a product detail page to compare them side by side.
        </p>
        <Link href="/ecommerce/products" className="mt-6 inline-flex h-11 items-center rounded-xl bg-primary px-6 font-bold text-primary-foreground">
          Browse products
        </Link>
      </main>
    );
  }

  const attributeNames = Array.from(
    new Set(products.flatMap((product) => product.attributes.map((item) => item.attribute.name))),
  ).sort((left, right) => left.localeCompare(right));

  return (
    <main className="container px-3 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Side-by-side</p>
          <h1 className="mt-2 text-3xl font-black">Compare products</h1>
          <p className="mt-2 text-sm text-muted-foreground">Comparing {products.length} of 4 allowed products.</p>
        </div>
        <Link href="/ecommerce/products" className="rounded-xl border px-4 py-2 text-sm font-bold hover:border-primary">Add another product</Link>
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">Product comparison table</caption>
          <thead>
            <tr>
              <th scope="col" className="w-44 border-b border-r bg-muted/40 p-4 text-left align-bottom">Product</th>
              {products.map((product) => (
                <th key={product.id} scope="col" className="min-w-56 border-b border-r p-4 text-left align-top last:border-r-0">
                  <Link href={`/ecommerce/products/${product.id}`} className="group block">
                    <div className="relative mx-auto aspect-square max-w-44 overflow-hidden rounded-xl bg-background">
                      <Image src={product.image || "/placeholder.svg"} alt={product.name} fill sizes="176px" className="object-contain p-3 transition group-hover:scale-105" />
                    </div>
                    <span className="mt-3 block line-clamp-2 font-black group-hover:text-primary">{product.name}</span>
                  </Link>
                  <p className="mt-2 text-xl font-black text-primary">{money(product.basePrice, product.currency)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <AddToCartButton productId={product.id} className="h-9 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground" />
                    <CompareProductActions productId={product.id} comparedIds={products.map((item) => item.id)} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Brand", (product: (typeof products)[number]) => product.brand?.name || "—"],
              ["Category", (product: (typeof products)[number]) => product.category.name],
              ["SKU", (product: (typeof products)[number]) => product.sku || "—"],
              ["Type", (product: (typeof products)[number]) => product.type],
              ["Availability", (product: (typeof products)[number]) => getProductAvailableStock(product) > 0 ? `${getProductAvailableStock(product)} in stock` : "Out of stock"],
              ["Rating", (product: (typeof products)[number]) => `${product.ratingAvg.toFixed(1)} / 5 (${product.ratingCount})`],
              ["Options", (product: (typeof products)[number]) => product.variants.length ? `${product.variants.length} variant(s)` : "Standard"],
            ].map(([label, read]) => (
              <tr key={String(label)}>
                <th scope="row" className="border-b border-r bg-muted/40 p-4 text-left font-bold">{String(label)}</th>
                {products.map((product) => <td key={product.id} className="border-b border-r p-4 last:border-r-0">{(read as (item: (typeof products)[number]) => string)(product)}</td>)}
              </tr>
            ))}
            {attributeNames.map((name) => (
              <tr key={name}>
                <th scope="row" className="border-b border-r bg-muted/40 p-4 text-left font-bold">{name}</th>
                {products.map((product) => (
                  <td key={product.id} className="border-b border-r p-4 last:border-r-0">
                    {product.attributes.find((item) => item.attribute.name === name)?.value || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
