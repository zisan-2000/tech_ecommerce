import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CatalogProductGrid from "@/components/ecommarce/catalog/CatalogProductGrid";
import ProductPurchasePanel from "@/components/ecommarce/product-detail/ProductPurchasePanel";
import ProductQuestions from "@/components/ecommarce/product-detail/ProductQuestions";
import ProductReviews from "@/components/ecommarce/ProductReviews";
import {
  getStorefrontCatalog,
  parseCatalogFilters,
} from "@/lib/storefront-catalog";
import {
  getProductAvailableStock,
  parseStorefrontProductId,
  toProductPurchaseData,
} from "@/lib/product-purchase";
import { getStorefrontProductDetail } from "@/lib/storefront-product-detail";
import { getSiteUrl, stripHtml, toAbsoluteUrl, truncateText } from "@/lib/seo";

type ProductPageProps = { params: Promise<{ id: string }> };
const getProduct = cache(getStorefrontProductDetail);

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = parseStorefrontProductId(rawId);
  if (!id) return { title: "Product not found" };
  const product = await getProduct(id);
  if (!product) return { title: "Product not found" };
  const description = truncateText(
    stripHtml(product.shortDesc || product.description) ||
      `Buy ${product.name} online in Bangladesh.`,
  );
  const canonical = `/ecommerce/products/${product.id}`;
  const image = toAbsoluteUrl(product.image || "/placeholder.svg");

  return {
    title: `${product.name} — Tech Ecommerce`,
    description,
    alternates: { canonical },
    openGraph: {
      title: product.name,
      description,
      url: canonical,
      type: "website",
      images: [{ url: image, alt: product.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      images: [image],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id: rawId } = await params;
  const id = parseStorefrontProductId(rawId);
  if (!id) notFound();
  const product = await getProduct(id);
  if (!product) notFound();

  const relatedData = await getStorefrontCatalog(
    parseCatalogFilters({
      category: product.category.slug,
      sort: "popular",
      perPage: "12",
    }),
  );
  const relatedProducts = relatedData.products
    .filter((related) => related.id !== product.id)
    .slice(0, 8);
  const description = stripHtml(product.description);
  const dimensions =
    product.dimensions && typeof product.dimensions === "object"
      ? Object.entries(product.dimensions as Record<string, unknown>)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(" · ")
      : "";
  const stock = getProductAvailableStock(product);
  const purchaseProduct = toProductPurchaseData(product);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: [product.image, ...product.gallery]
      .filter(Boolean)
      .map((image) => toAbsoluteUrl(image)),
    description: truncateText(description, 500),
    sku: product.sku ?? String(product.id),
    brand: product.brand
      ? { "@type": "Brand", name: product.brand.name }
      : undefined,
    aggregateRating:
      product.ratingCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: product.ratingAvg,
            reviewCount: product.ratingCount,
          }
        : undefined,
    offers: {
      "@type": "Offer",
      url: `${getSiteUrl()}/ecommerce/products/${product.id}`,
      priceCurrency: product.currency,
      price: product.basePrice,
      availability:
        stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div className="container px-3 py-5 sm:px-6 lg:py-8">
        <nav className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-primary">Home</Link>
          <span>/</span>
          <Link href="/ecommerce/products" className="hover:text-primary">Products</Link>
          <span>/</span>
          <Link href={`/ecommerce/products?category=${encodeURIComponent(product.category.slug)}`} className="hover:text-primary">
            {product.category.name}
          </Link>
          <span>/</span>
          <span className="max-w-56 truncate text-foreground">{product.name}</span>
        </nav>

        <ProductPurchasePanel product={purchaseProduct} />

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-3xl border bg-card p-5 sm:p-7">
            <h2 className="text-2xl font-black">Description</h2>
            <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground sm:text-base">
              {description || product.shortDesc || "Product description will be available soon."}
            </p>
          </section>

          <aside className="rounded-3xl border bg-card p-5 sm:p-6">
            <h2 className="text-xl font-black">Product information</h2>
            <dl className="mt-4 divide-y text-sm">
              <div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Product ID</dt><dd className="font-semibold">{product.id}</dd></div>
              <div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Category</dt><dd className="text-right font-semibold">{product.category.name}</dd></div>
              {product.brand ? <div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Brand</dt><dd className="font-semibold"><Link href={`/ecommerce/products?brand=${encodeURIComponent(product.brand.slug)}`} className="hover:text-primary">{product.brand.name}</Link></dd></div> : null}
              <div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Type</dt><dd className="font-semibold">{product.type}</dd></div>
              {product.weight ? <div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Weight</dt><dd className="font-semibold">{product.weight}</dd></div> : null}
              {dimensions ? <div className="py-3"><dt className="text-muted-foreground">Dimensions</dt><dd className="mt-1 font-semibold">{dimensions}</dd></div> : null}
            </dl>
          </aside>
        </div>

        {product.attributes.length ? (
          <section className="mt-6 rounded-3xl border bg-card p-5 sm:p-7">
            <h2 className="text-2xl font-black">Specifications</h2>
            <dl className="mt-5 grid gap-x-8 md:grid-cols-2">
              {product.attributes.map((attribute) => (
                <div key={attribute.id} className="grid grid-cols-[minmax(120px,.7fr)_1fr] gap-4 border-b py-3 text-sm">
                  <dt className="text-muted-foreground">{attribute.attribute.name}</dt>
                  <dd className="font-semibold">{attribute.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section className="mt-6 rounded-3xl border bg-card p-5 sm:p-7">
          <ProductReviews productId={product.id} />
        </section>

        <section className="mt-6 rounded-3xl border bg-card p-5 sm:p-7">
          <ProductQuestions productId={product.id} />
        </section>

        {relatedProducts.length ? (
          <section className="mt-10">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">You may also like</p><h2 className="mt-2 text-2xl font-black">Related products</h2></div>
              <Link href={`/ecommerce/products?category=${encodeURIComponent(product.category.slug)}`} className="text-sm font-bold text-primary hover:underline">View category</Link>
            </div>
            <CatalogProductGrid products={relatedProducts} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
