"use client";

import Image from "next/image";
import { FolderSearch2, Loader2, Search, Tag } from "lucide-react";
import type {
  SearchSuggestionLink,
  SearchSuggestionProduct,
  SearchSuggestionResponse,
} from "@/lib/search/core";

type Props = {
  id: string;
  data: SearchSuggestionResponse | null;
  loading: boolean;
  error: string | null;
  activeIndex: number;
  onProductSelect: (product: SearchSuggestionProduct, position: number) => void;
  onQuerySelect: (query: string) => void;
  onBrandSelect: (brand: SearchSuggestionLink) => void;
  onCategorySelect: (category: SearchSuggestionLink) => void;
};

const formatPrice = (value: number, currency: string) =>
  `${currency === "BDT" ? "৳" : `${currency} `}${Math.round(value).toLocaleString("en-US")}`;

export default function SearchSuggestionPanel({
  id,
  data,
  loading,
  error,
  activeIndex,
  onProductSelect,
  onQuerySelect,
  onBrandSelect,
  onCategorySelect,
}: Props) {
  const products = data?.products ?? [];
  const relatedLinks = Boolean(
    data?.brands.length || data?.categories.length || data?.suggestedQueries.length,
  );

  return (
    <div
      id={id}
      role="listbox"
      aria-label="Search suggestions"
      className="max-h-[min(70vh,34rem)] overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
    >
      {loading && !data ? (
        <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Searching products…
        </div>
      ) : error ? (
        <div className="px-4 py-5 text-sm text-destructive">{error}</div>
      ) : products.length === 0 && !relatedLinks ? (
        <div className="px-4 py-5">
          <p className="font-semibold">No matching product found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check the spelling or search by brand, model, SKU, or category.
          </p>
        </div>
      ) : (
        <>
          {products.length > 0 ? (
            <section aria-label="Products">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Products
                </span>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              </div>
              {products.map((product, index) => {
                const optionId = `${id}-product-${product.id}`;
                return (
                  <button
                    id={optionId}
                    key={product.id}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onProductSelect(product, index + 1)}
                    className={`flex w-full items-center gap-3 border-b border-border/70 px-4 py-3 text-left transition last:border-b-0 hover:bg-muted ${
                      activeIndex === index ? "bg-muted" : ""
                    }`}
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-white">
                      <Image
                        src={product.image || "/placeholder.svg"}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-contain p-1"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-semibold leading-5">
                        {product.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {[product.brand, product.category, product.matchedVariantSku]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold text-primary">
                        {formatPrice(product.price, product.currency)}
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          product.stock > 0 ? "text-emerald-600" : "text-destructive"
                        }`}
                      >
                        {product.stock > 0 ? "In stock" : "Out of stock"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </section>
          ) : null}

          {relatedLinks ? (
            <section className="grid gap-3 border-t border-border bg-muted/35 p-3 sm:grid-cols-2">
              {data?.categories.length ? (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <FolderSearch2 className="h-3.5 w-3.5" /> Categories
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.categories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onCategorySelect(category)}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary"
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {data?.brands.length ? (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <Tag className="h-3.5 w-3.5" /> Brands
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.brands.map((brand) => (
                      <button
                        key={brand.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onBrandSelect(brand)}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary"
                      >
                        {brand.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {data?.suggestedQueries.length ? (
                <div className="sm:col-span-2">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <Search className="h-3.5 w-3.5" /> Popular searches
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.suggestedQueries.map((query) => (
                      <button
                        key={query}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onQuerySelect(query)}
                        className="rounded-md bg-background px-2 py-1 text-xs hover:text-primary"
                      >
                        {query}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}
      {data?.query && !loading ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onQuerySelect(data.query)}
          className="flex w-full items-center justify-center gap-2 border-t border-border px-4 py-3 text-sm font-bold text-primary hover:bg-muted"
        >
          <Search className="h-4 w-4" /> View all results for “{data.query}”
        </button>
      ) : null}
    </div>
  );
}
