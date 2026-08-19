import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Filter, PackageSearch, Search } from "lucide-react";
import CatalogFilterForm from "@/components/ecommarce/catalog/CatalogFilterForm";
import CatalogProductGrid from "@/components/ecommarce/catalog/CatalogProductGrid";
import {
  CATALOG_MAX_PRICE,
  catalogCanonicalUrl,
  catalogUrl,
  getStorefrontCatalog,
  isIndexableCatalogView,
  parseCatalogFilters,
  type CatalogSearchParams,
  type CatalogSort,
} from "@/lib/storefront-catalog";
import { getSiteUrl } from "@/lib/seo";

type ProductsPageProps = {
  searchParams: Promise<CatalogSearchParams>;
};

const SORT_LABELS: Array<{ value: CatalogSort; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Popular" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A–Z" },
];

export async function generateMetadata({
  searchParams,
}: ProductsPageProps): Promise<Metadata> {
  const filters = parseCatalogFilters(await searchParams);
  const qualifier = filters.q
    ? `Search results for “${filters.q}”`
    : filters.category
      ? `${filters.category.replaceAll("-", " ")} products`
      : "All Products";

  return {
    title: `${qualifier} — Tech Ecommerce`,
    description:
      "Browse computers, components, accessories and gadgets with category, brand, price and stock filters.",
    alternates: {
      canonical: catalogCanonicalUrl(filters),
    },
    robots: isIndexableCatalogView(filters)
      ? undefined
      : { index: false, follow: true },
  };
}

function paginationPages(page: number, totalPages: number) {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  return Array.from(pages)
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((left, right) => left - right);
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const parsedFilters = parseCatalogFilters(await searchParams);
  const data = await getStorefrontCatalog(parsedFilters);
  const { filters, products, facets, pagination } = data;
  if (catalogUrl(parsedFilters) !== catalogUrl(filters)) {
    redirect(catalogUrl(filters));
  }
  if (pagination.page > pagination.totalPages) {
    redirect(catalogUrl(filters, { page: pagination.totalPages }));
  }
  const selectedCategory = facets.categories.find(
    (category) =>
      category.slug === filters.category ||
      String(category.id) === filters.category,
  );
  const selectedBrandNames = facets.brands
    .filter((brand) => filters.brands.includes(brand.slug))
    .map((brand) => brand.name);
  const activeFilterCount = [
    Boolean(filters.q),
    Boolean(filters.category),
    filters.brands.length > 0,
    Boolean(filters.type),
    filters.minPrice !== null || filters.maxPrice !== null,
    filters.inStock,
    filters.featured,
  ].filter(Boolean).length;
  const activeFilterLinks: Array<{ key: string; label: string; href: string }> = [];
  if (filters.q) {
    activeFilterLinks.push({
      key: "search",
      label: `Search: ${filters.q}`,
      href: catalogUrl(filters, { q: "", page: 1 }),
    });
  }
  if (selectedCategory) {
    activeFilterLinks.push({
      key: "category",
      label: selectedCategory.name,
      href: catalogUrl(filters, { category: "", page: 1 }),
    });
  }
  for (const brand of facets.brands.filter((item) =>
    filters.brands.includes(item.slug),
  )) {
    activeFilterLinks.push({
      key: `brand-${brand.slug}`,
      label: brand.name,
      href: catalogUrl(filters, {
        brands: filters.brands.filter((slug) => slug !== brand.slug),
        page: 1,
      }),
    });
  }
  if (filters.type) {
    activeFilterLinks.push({
      key: "type",
      label: filters.type.charAt(0) + filters.type.slice(1).toLowerCase(),
      href: catalogUrl(filters, { type: "", page: 1 }),
    });
  }
  if (filters.minPrice !== null || filters.maxPrice !== null) {
    activeFilterLinks.push({
      key: "price",
      label: `Price: ${filters.minPrice ?? 0}–${filters.maxPrice ?? "Any"}`,
      href: catalogUrl(filters, { minPrice: null, maxPrice: null, page: 1 }),
    });
  }
  if (filters.inStock) {
    activeFilterLinks.push({
      key: "stock",
      label: "In stock",
      href: catalogUrl(filters, { inStock: false, page: 1 }),
    });
  }
  if (filters.featured) {
    activeFilterLinks.push({
      key: "featured",
      label: "Featured",
      href: catalogUrl(filters, { featured: false, page: 1 }),
    });
  }
  const pages = paginationPages(pagination.page, pagination.totalPages);
  const firstResult = pagination.total
    ? (pagination.page - 1) * pagination.perPage + 1
    : 0;
  const lastResult = Math.min(
    pagination.page * pagination.perPage,
    pagination.total,
  );

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Tech Ecommerce product catalog",
    numberOfItems: pagination.total,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: products.map((product, index) => ({
        "@type": "ListItem",
        position: firstResult + index,
        url: `${getSiteUrl()}/ecommerce/products/${product.id}`,
        name: product.name,
      })),
    },
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <div className="container px-3 py-5 sm:px-6 lg:py-8">
        <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-accent/10 px-5 py-7 sm:px-8 sm:py-10">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              <PackageSearch className="h-4 w-4" aria-hidden="true" />
              Product catalog
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
              Find the right tech for you
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Search the complete catalog, compare current prices and narrow the
              results by category, brand, product type or availability.
            </p>
          </div>
        </section>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-2xl border bg-card shadow-sm lg:sticky lg:top-24">
            <input
              id="catalog-filter-toggle"
              type="checkbox"
              className="peer sr-only"
            />
            <label
              htmlFor="catalog-filter-toggle"
              className="flex cursor-pointer items-center justify-between px-4 py-4 lg:hidden"
            >
              <span className="flex items-center gap-2 font-bold">
                <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
                Filters
                {activeFilterCount ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </span>
              <span className="text-xs font-semibold text-primary">Show / hide</span>
            </label>

            <div className="hidden items-center justify-between border-b px-4 py-4 lg:flex">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
                <h2 className="font-bold">Filters</h2>
                {activeFilterCount ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </div>
              {activeFilterCount ? (
                <Link
                  href="/ecommerce/products"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Clear
                </Link>
              ) : null}
            </div>

            <CatalogFilterForm
              key={catalogUrl(filters)}
              className="hidden space-y-5 border-t p-4 peer-checked:block lg:block lg:border-t-0"
            >
              {activeFilterCount ? (
                <div className="flex justify-end lg:hidden">
                  <Link
                    href="/ecommerce/products"
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Clear all filters
                  </Link>
                </div>
              ) : null}
              <label className="block space-y-2 text-sm font-semibold">
                Search
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    name="q"
                    defaultValue={filters.q}
                    placeholder="Name, SKU or brand"
                    maxLength={100}
                    className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm font-normal outline-none focus:border-primary"
                  />
                </span>
              </label>

              <label className="block space-y-2 text-sm font-semibold">
                Category
                <select
                  name="category"
                  defaultValue={filters.category}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-normal"
                >
                  <option value="">All categories</option>
                  {facets.categories.map((category) => (
                    <option key={category.id} value={category.slug}>
                      {"— ".repeat(Math.min(category.depth, 3))}
                      {category.name} ({category.productCount})
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Brands</legend>
                <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                  {facets.brands
                    .filter((brand) => brand.productCount > 0)
                    .map((brand) => (
                      <label
                        key={brand.id}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <input
                            type="checkbox"
                            name="brand"
                            value={brand.slug}
                            defaultChecked={filters.brands.includes(brand.slug)}
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                          <span className="truncate">{brand.name}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {brand.productCount}
                        </span>
                      </label>
                    ))}
                </div>
              </fieldset>

              <label className="block space-y-2 text-sm font-semibold">
                Product type
                <select
                  name="type"
                  defaultValue={filters.type}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-normal"
                >
                  <option value="">All types</option>
                  {facets.productTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.charAt(0) + type.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Price range</legend>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    name="minPrice"
                    min="0"
                    max={CATALOG_MAX_PRICE}
                    step="0.01"
                    defaultValue={filters.minPrice ?? ""}
                    placeholder={`Min ${facets.priceRange.min}`}
                    aria-label="Minimum price"
                    className="h-10 rounded-lg border bg-background px-3 text-sm"
                  />
                  <input
                    type="number"
                    name="maxPrice"
                    min="0"
                    max={CATALOG_MAX_PRICE}
                    step="0.01"
                    defaultValue={filters.maxPrice ?? ""}
                    placeholder={`Max ${facets.priceRange.max}`}
                    aria-label="Maximum price"
                    className="h-10 rounded-lg border bg-background px-3 text-sm"
                  />
                </div>
              </fieldset>

              <div className="space-y-2 text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    name="inStock"
                    value="1"
                    defaultChecked={filters.inStock}
                    className="h-4 w-4 accent-primary"
                  />
                  In stock only
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    name="featured"
                    value="1"
                    defaultChecked={filters.featured}
                    className="h-4 w-4 accent-primary"
                  />
                  Featured products
                </label>
              </div>

              <label className="block space-y-2 text-sm font-semibold">
                Sort by
                <select
                  name="sort"
                  defaultValue={filters.sort}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-normal"
                >
                  {SORT_LABELS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2 text-sm font-semibold">
                Products per page
                <select
                  name="perPage"
                  defaultValue={String(filters.perPage)}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm font-normal"
                >
                  <option value="12">12</option>
                  <option value="24">24</option>
                  <option value="36">36</option>
                </select>
              </label>

            </CatalogFilterForm>
          </aside>

          <main className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 rounded-2xl border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold">
                  {filters.q
                    ? `Results for “${filters.q}”`
                    : selectedCategory?.name ?? "All products"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Showing {firstResult}–{lastResult} of {pagination.total} products
                  {selectedBrandNames.length
                    ? ` · ${selectedBrandNames.join(", ")}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SORT_LABELS.slice(0, 4).map((option) => (
                  <Link
                    key={option.value}
                    href={catalogUrl(filters, { sort: option.value, page: 1 })}
                    aria-current={filters.sort === option.value ? "page" : undefined}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      filters.sort === option.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:border-primary hover:text-primary"
                    }`}
                  >
                    {option.label}
                  </Link>
                ))}
              </div>
            </div>

            {activeFilterLinks.length ? (
              <div
                className="mb-4 flex flex-wrap items-center gap-2"
                aria-label="Active product filters"
              >
                <span className="text-xs font-semibold text-muted-foreground">
                  Active:
                </span>
                {activeFilterLinks.map((filter) => (
                  <Link
                    key={filter.key}
                    href={filter.href}
                    aria-label={`Remove ${filter.label} filter`}
                    className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold transition hover:border-primary hover:text-primary"
                  >
                    {filter.label}
                    <span aria-hidden="true">×</span>
                  </Link>
                ))}
                <Link
                  href="/ecommerce/products"
                  className="px-2 py-1 text-xs font-semibold text-primary hover:underline"
                >
                  Clear all
                </Link>
              </div>
            ) : null}

            {products.length ? (
              <CatalogProductGrid products={products} />
            ) : (
              <div className="rounded-3xl border border-dashed bg-muted/20 px-6 py-16 text-center">
                <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground" />
                <h2 className="mt-4 text-xl font-bold">No products found</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Try a broader search or remove one or more filters.
                </p>
                <Link
                  href="/ecommerce/products"
                  className="mt-5 inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
                >
                  View all products
                </Link>
              </div>
            )}

            {pagination.totalPages > 1 ? (
              <nav
                className="mt-8 flex flex-wrap items-center justify-center gap-2"
                aria-label="Product catalog pagination"
              >
                <Link
                  href={catalogUrl(filters, {
                    page: Math.max(1, pagination.page - 1),
                  })}
                  aria-disabled={pagination.page <= 1}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                    pagination.page <= 1
                      ? "pointer-events-none opacity-40"
                      : "hover:border-primary hover:text-primary"
                  }`}
                >
                  Previous
                </Link>
                {pages.map((page, index) => {
                  const previous = pages[index - 1];
                  return (
                    <span key={page} className="contents">
                      {previous && page - previous > 1 ? (
                        <span className="px-1 text-muted-foreground">…</span>
                      ) : null}
                      <Link
                        href={catalogUrl(filters, { page })}
                        aria-current={pagination.page === page ? "page" : undefined}
                        className={`inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-bold ${
                          pagination.page === page
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:border-primary hover:text-primary"
                        }`}
                      >
                        {page}
                      </Link>
                    </span>
                  );
                })}
                <Link
                  href={catalogUrl(filters, {
                    page: Math.min(pagination.totalPages, pagination.page + 1),
                  })}
                  aria-disabled={pagination.page >= pagination.totalPages}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                    pagination.page >= pagination.totalPages
                      ? "pointer-events-none opacity-40"
                      : "hover:border-primary hover:text-primary"
                  }`}
                >
                  Next
                </Link>
              </nav>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
