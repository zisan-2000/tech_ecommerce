import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CatalogProductGrid from "@/components/ecommarce/catalog/CatalogProductGrid";
import ProductDetailTabs from "@/components/ecommarce/product-detail/ProductDetailTabs";
import ProductPurchasePanel from "@/components/ecommarce/product-detail/ProductPurchasePanel";
import ProductQuestions from "@/components/ecommarce/product-detail/ProductQuestions";
import RelatedProductRail from "@/components/ecommarce/product-detail/RelatedProductRail";
import {
  getStorefrontCatalog,
  parseCatalogFilters,
} from "@/lib/storefront-catalog";
import type { StorefrontCatalogProduct } from "@/lib/storefront-catalog";
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

  const categoryData = await getStorefrontCatalog(
    parseCatalogFilters({
      category: product.category.slug,
      sort: "popular",
      perPage: "12",
    }),
  );
  const recommendations = new Map<number, StorefrontCatalogProduct>();
  const addRecommendations = (products: StorefrontCatalogProduct[]) => {
    for (const candidate of products) {
      if (candidate.id === product.id || recommendations.has(candidate.id)) {
        continue;
      }
      recommendations.set(candidate.id, candidate);
      if (recommendations.size === 8) break;
    }
  };

  addRecommendations(categoryData.products);

  // A sparse category must not leave the desktop page with an empty rail.
  // Prefer the same brand, then fill the remaining slots with popular items.
  if (recommendations.size < 8 && product.brand) {
    const brandData = await getStorefrontCatalog(
      parseCatalogFilters({
        brand: product.brand.slug,
        sort: "popular",
        perPage: "12",
      }),
    );
    addRecommendations(brandData.products);
  }
  if (recommendations.size < 8) {
    const popularData = await getStorefrontCatalog(
      parseCatalogFilters({ sort: "popular", perPage: "12" }),
    );
    addRecommendations(popularData.products);
  }

  const relatedProducts = [...recommendations.values()].slice(0, 8);
  const hasRelatedProducts = relatedProducts.length > 0;
  const description = stripHtml(product.description);
  const dimensions =
    product.dimensions && typeof product.dimensions === "object"
      ? Object.entries(product.dimensions as Record<string, unknown>)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(" · ")
      : "";
  const stock = getProductAvailableStock(product);
  const purchaseProduct = toProductPurchaseData(product);
  const categoryHref = `/ecommerce/products?category=${encodeURIComponent(product.category.slug)}`;
  const productInformation: Array<{ label: string; value: string }> = [
    { label: "Product ID", value: String(product.id) },
    { label: "Category", value: product.category.name },
    ...(product.brand ? [{ label: "Brand", value: product.brand.name }] : []),
    { label: "Type", value: product.type },
    ...(product.weight ? [{ label: "Weight", value: String(product.weight) }] : []),
    ...(dimensions ? [{ label: "Dimensions", value: dimensions }] : []),
  ];
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
    <div className="product-detail-light min-h-screen bg-[#f5f6f8] text-slate-900 [color-scheme:light]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div className="container px-3 py-4 sm:px-6 lg:py-5">
        <nav className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-[#174a92]">Home</Link>
          <span aria-hidden="true">›</span>
          <Link href="/ecommerce/products" className="hover:text-[#174a92]">Products</Link>
          <span aria-hidden="true">›</span>
          <Link href={categoryHref} className="hover:text-[#174a92]">
            {product.category.name}
          </Link>
          <span aria-hidden="true">›</span>
          <span className="max-w-72 truncate font-medium text-slate-800">{product.name}</span>
        </nav>

        <div
          className={`grid items-start gap-4 ${
            hasRelatedProducts
              ? "xl:grid-cols-[286px_minmax(0,1fr)]"
              : "grid-cols-1"
          }`}
        >
          {hasRelatedProducts ? (
            <div className="hidden xl:sticky xl:top-[143px] xl:block xl:h-[calc(100dvh-159px)] xl:self-start">
              <RelatedProductRail
                products={relatedProducts}
                categoryHref={categoryHref}
              />
            </div>
          ) : null}

          <main className="min-w-0 space-y-4">
            <ProductPurchasePanel
              product={purchaseProduct}
              details={{
                brandName: product.brand?.name,
                categoryName: product.category.name,
                contactNumber: categoryData.facets.siteSettings.contactNumber,
                contactEmail: categoryData.facets.siteSettings.contactEmail,
                attributes: product.attributes,
              }}
            />

            <ProductDetailTabs
              productId={product.id}
              description={description || stripHtml(product.shortDesc ?? "")}
              attributes={product.attributes}
              information={productInformation}
              reviewCount={product.ratingCount}
            />

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <ProductQuestions productId={product.id} />
            </section>
          </main>
        </div>

        {hasRelatedProducts ? (
          <section className="mt-8 xl:mt-10">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#174a92]">You may also like</p><h2 className="mt-1.5 text-xl font-bold text-slate-900">Recommended products</h2></div>
              <Link href={categoryHref} className="text-[12px] font-bold text-[#174a92] hover:underline">View category</Link>
            </div>
            <CatalogProductGrid products={relatedProducts} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
