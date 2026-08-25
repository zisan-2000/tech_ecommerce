"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  GitCompareArrows,
  Loader2,
  Plus,
  Printer,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import AddToCartButton from "@/components/ecommarce/AddToCartButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProductCompare } from "@/hooks/use-product-compare";
import { PRODUCT_COMPARE_LIMIT, productCompareHref } from "@/lib/product-compare";
import { getProductAvailableStock } from "@/lib/product-purchase";
import type { StorefrontProductDetail } from "@/lib/storefront-product-detail";

type CompareProduct = StorefrontProductDetail;

type SearchProduct = {
  id: number;
  name: string;
  slug: string;
  image: string | null;
  basePrice: number;
  currency: string;
  category: { id: number; name: string; slug: string };
  brand: { name: string } | null;
};

const SECTION_ORDER = [
  "Processor",
  "Display",
  "Memory",
  "Storage",
  "Graphics",
  "Connectivity",
  "Physical specifications",
  "Other specifications",
] as const;

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

function attributeSection(name: string): (typeof SECTION_ORDER)[number] {
  const value = name.toLowerCase();
  if (/processor|cpu|chipset|core|thread|cache/.test(value)) return "Processor";
  if (/display|screen|resolution|refresh|panel|brightness/.test(value)) return "Display";
  if (/memory|ram/.test(value)) return "Memory";
  if (/storage|ssd|hdd|capacity|interface/.test(value)) return "Storage";
  if (/graphic|gpu|video/.test(value)) return "Graphics";
  if (/wifi|lan|bluetooth|port|usb|hdmi|network|connect/.test(value)) return "Connectivity";
  if (/weight|dimension|color|size|height|width|length/.test(value)) {
    return "Physical specifications";
  }
  return "Other specifications";
}

function plainSummary(product: CompareProduct) {
  return String(product.shortDesc || product.description || "—")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 360);
}

export default function CompareWorkspace({ products }: { products: CompareProduct[] }) {
  const router = useRouter();
  const compare = useProductCompare();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetIndex, setTargetIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const selectedIds = useMemo(() => products.map((product) => product.id), [products]);
  const pickerCategory = products[targetIndex]?.category ?? products[0]?.category ?? null;
  const columnCount = Math.min(
    PRODUCT_COMPARE_LIMIT,
    Math.max(2, products.length + (products.length < PRODUCT_COMPARE_LIMIT ? 1 : 0)),
  );

  const specificationSections = useMemo(() => {
    const names = Array.from(
      new Set(
        products.flatMap((product) =>
          product.attributes.map((item) => item.attribute.name),
        ),
      ),
    );
    return SECTION_ORDER.map((section) => ({
      section,
      names: names
        .filter((name) => attributeSection(name) === section)
        .sort((left, right) => left.localeCompare(right)),
    })).filter((group) => group.names.length > 0);
  }, [products]);

  useEffect(() => {
    if (!pickerOpen) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams();
        if (pickerCategory?.id) params.set("categoryId", String(pickerCategory.id));
        if (query.trim()) params.set("q", query.trim());
        const response = await fetch(`/api/compare/products?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Products could not be loaded.");
        setResults(Array.isArray(payload?.items) ? payload.items : []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchError(error instanceof Error ? error.message : "Products could not be loaded.");
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query.trim() ? 250 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [pickerCategory?.id, pickerOpen, query]);

  const openPicker = (index: number) => {
    setTargetIndex(index);
    setQuery("");
    setResults([]);
    setSearchError(null);
    setPickerOpen(true);
  };

  const selectProduct = (productId: number) => {
    if (selectedIds.includes(productId) && selectedIds[targetIndex] !== productId) {
      toast.info("This product is already in the comparison.");
      return;
    }
    const nextIds = [...selectedIds];
    if (targetIndex < nextIds.length) nextIds[targetIndex] = productId;
    else nextIds.push(productId);
    const normalized = compare.replace(nextIds);
    setPickerOpen(false);
    router.replace(productCompareHref(normalized), { scroll: false });
  };

  const removeProduct = (productId: number) => {
    const nextIds = selectedIds.filter((id) => id !== productId);
    compare.replace(nextIds);
    router.replace(productCompareHref(nextIds), { scroll: false });
  };

  const renderCells = (read: (product: CompareProduct) => React.ReactNode) =>
    Array.from({ length: columnCount }, (_, index) => {
      const product = products[index];
      return (
        <td key={product?.id ?? `empty-${index}`} className="border-b border-r p-3 align-top last:border-r-0 sm:p-4">
          {product ? read(product) : <span className="text-muted-foreground">—</span>}
        </td>
      );
    });

  return (
    <main className="min-h-screen bg-[#f5f6f8] py-6 dark:bg-background sm:py-8">
      <div className="container max-w-7xl px-3 sm:px-6">
        <div className="border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-4 sm:px-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Product comparison</p>
              <h1 className="mt-1 text-2xl font-black">Find the right product</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {products.length
                  ? `${products.length} of ${PRODUCT_COMPARE_LIMIT} products selected${products[0]?.category ? ` · ${products[0].category.name}` : ""}`
                  : "Choose a product, then compare it with alternatives from the same category."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {products.length < PRODUCT_COMPARE_LIMIT ? (
                <button type="button" onClick={() => openPicker(products.length)} className="inline-flex h-10 items-center gap-2 rounded bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> Add product
                </button>
              ) : null}
              <button type="button" onClick={() => window.print()} disabled={!products.length} className="inline-flex h-10 items-center gap-2 rounded border px-4 text-sm font-bold hover:border-primary hover:text-primary disabled:opacity-40">
                <Printer className="h-4 w-4" /> Print
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <caption className="sr-only">Side-by-side product comparison</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 w-44 min-w-44 border-b border-r bg-slate-100 p-4 text-left align-bottom dark:bg-slate-900">Product</th>
                  {Array.from({ length: columnCount }, (_, index) => {
                    const product = products[index];
                    return (
                      <th key={product?.id ?? `picker-${index}`} scope="col" className="min-w-64 border-b border-r bg-card p-4 text-left align-top last:border-r-0">
                        {product ? (
                          <div>
                            <button type="button" onClick={() => openPicker(index)} className="mb-3 flex h-9 w-full items-center justify-between rounded border bg-background px-3 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary">
                              <span className="truncate">Search and select product</span><Search className="h-3.5 w-3.5" />
                            </button>
                            <Link href={`/ecommerce/products/${product.slug || product.id}`} className="group block text-center">
                              <div className="relative mx-auto h-40 w-40 overflow-hidden bg-white">
                                <Image src={product.image || "/placeholder.svg"} alt="" fill sizes="160px" className="object-contain p-3 transition group-hover:scale-105" />
                              </div>
                              <span className="mt-3 block line-clamp-2 min-h-10 font-bold group-hover:text-primary">{product.name}</span>
                            </Link>
                            <p className="mt-2 text-center text-xl font-black text-primary">{money(product.basePrice, product.currency)}</p>
                            <div className="mt-3 flex items-center justify-center gap-2">
                              <AddToCartButton productId={product.id} className="h-9 rounded bg-primary px-3 text-xs font-bold text-primary-foreground" />
                              <button type="button" onClick={() => removeProduct(product.id)} className="inline-flex h-9 items-center gap-1 rounded border px-3 text-xs font-bold text-muted-foreground hover:border-destructive hover:text-destructive"><X className="h-3.5 w-3.5" /> Remove</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => openPicker(index)} className="flex min-h-64 w-full flex-col items-center justify-center rounded border-2 border-dashed bg-muted/20 p-6 text-center transition hover:border-primary hover:bg-primary/5">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Plus className="h-6 w-6" /></span>
                            <span className="mt-3 font-bold">Select a product</span>
                            <span className="mt-1 text-xs text-muted-foreground">Search without leaving comparison</span>
                          </button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr><th colSpan={columnCount + 1} className="border-b bg-slate-600 px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-white">General information</th></tr>
                {[
                  ["Model", (product: CompareProduct) => product.name],
                  ["Brand", (product: CompareProduct) => product.brand?.name || "—"],
                  ["Category", (product: CompareProduct) => product.category.name],
                  ["SKU", (product: CompareProduct) => product.sku || "—"],
                  ["Availability", (product: CompareProduct) => getProductAvailableStock(product) > 0 ? `${getProductAvailableStock(product)} in stock` : "Out of stock"],
                  ["Rating", (product: CompareProduct) => `${product.ratingAvg.toFixed(1)} / 5 (${product.ratingCount})`],
                  ["Summary", (product: CompareProduct) => plainSummary(product)],
                ].map(([label, read]) => (
                  <tr key={String(label)}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-r bg-slate-50 p-3 text-left font-semibold dark:bg-slate-950 sm:p-4">{String(label)}</th>
                    {renderCells(read as (product: CompareProduct) => React.ReactNode)}
                  </tr>
                ))}
                {specificationSections.map(({ section, names }) => (
                  <FragmentSection key={section} section={section} names={names} products={products} columnCount={columnCount} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="flex max-h-[88vh] w-[calc(100vw-24px)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2"><GitCompareArrows className="h-5 w-5 text-primary" /> Select comparison product</DialogTitle>
            <DialogDescription>
              {pickerCategory ? `Showing only ${pickerCategory.name} products for an accurate comparison.` : "Choose the first product; later choices will stay in the same category."}
            </DialogDescription>
          </DialogHeader>
          <div className="border-b p-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <span className="sr-only">Search comparison products</span>
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value.slice(0, 80))} placeholder="Search by product, model, SKU or brand" className="h-11 w-full rounded-lg border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">{query.trim() ? "Live search suggestions" : "Suggested products"}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loading ? <div className="flex items-center justify-center py-16 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching products...</div> : searchError ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{searchError}</div> : results.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {results.map((product) => {
                  const selected = selectedIds.includes(product.id);
                  return <button key={product.id} type="button" onClick={() => selectProduct(product.id)} disabled={selected && selectedIds[targetIndex] !== product.id} className="flex items-center gap-3 rounded-lg border p-3 text-left transition hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-white"><Image src={product.image || "/placeholder.svg"} alt="" fill sizes="64px" className="object-contain p-1" /></div>
                    <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{product.brand?.name || product.category.name}</p><p className="mt-1 line-clamp-2 text-sm font-bold">{product.name}</p><p className="mt-1 font-black text-primary">{money(product.basePrice, product.currency)}</p></div>
                    {selected ? <Check className="h-5 w-5 shrink-0 text-emerald-600" /> : <Plus className="h-5 w-5 shrink-0 text-primary" />}
                  </button>;
                })}
              </div>
            ) : <div className="py-16 text-center"><Search className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-bold">No matching products</p><p className="mt-1 text-sm text-muted-foreground">Try another product name, model, SKU or brand.</p></div>}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function FragmentSection({ section, names, products, columnCount }: { section: string; names: string[]; products: CompareProduct[]; columnCount: number }) {
  return (
    <>
      <tr><th colSpan={columnCount + 1} className="border-b bg-slate-600 px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-white">{section}</th></tr>
      {names.map((name) => (
        <tr key={name}>
          <th scope="row" className="sticky left-0 z-10 border-b border-r bg-slate-50 p-3 text-left font-semibold dark:bg-slate-950 sm:p-4">{name}</th>
          {Array.from({ length: columnCount }, (_, index) => {
            const product = products[index];
            return <td key={product?.id ?? `empty-${index}`} className="border-b border-r p-3 last:border-r-0 sm:p-4">{product?.attributes.find((item) => item.attribute.name === name)?.value || "—"}</td>;
          })}
        </tr>
      ))}
    </>
  );
}
