"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, Search, Sparkles, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/components/ecommarce/CartContext";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import { useSession } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ProductCard from "@/components/ecommarce/ProductCard";

type ApiVariant = {
  id?: number;
  stock?: number | string | null;
  price?: number | string | null;
  active?: boolean | null;
  image?: string | null;
  colorImage?: string | null;
  options?: Record<string, string> | null;
};

type ApiVariantOptionValue = {
  id: number;
  value: string;
  optionId?: number;
  position?: number;
};

type ApiVariantOption = {
  id: number;
  name: string;
  position?: number;
  values?: ApiVariantOptionValue[] | null;
};

type ApiProduct = {
  id: number;
  name: string;
  slug?: string | null;
  type?: string | null;
  sku?: string | null;
  shortDesc?: string | null;
  description?: string | null;
  basePrice?: number | string | null;
  originalPrice?: number | string | null;
  currency?: string | null;
  available?: boolean | null;
  featured?: boolean | null;
  ratingAvg?: number | string | null;
  ratingCount?: number | string | null;
  image?: string | null;
  brandId?: number | null;
  brand?: { id: number; name: string; slug: string } | null;
  variants?: ApiVariant[] | null;
  variantOptions?: ApiVariantOption[] | null;
  categoryId?: number | null;
  category?: { id: number; name: string } | null;
  bundleStockLimit?: number | string | null;
  bundleItems?: Array<{
    product: {
      id: number;
      name: string;
      image?: string;
    };
    quantity: number;
  }> | null;
  bundleItemCount?: number | null;
  bundleSavings?: string | null;
};

type ProductUI = {
  id: number;
  name: string;
  slug: string;
  sku: string;
  type: string;
  shortDesc: string;
  available: boolean;
  stock: number;
  image: string;
  price: number;
  originalPrice: number;
  discountPct: number;
  ratingAvg: number;
  ratingCount: number;
  categoryId: number | null;
  brandId: number | null;
  categoryName: string;
  brandName: string;
  featured: boolean;
  variants: ApiVariant[];
  variantOptions: ApiVariantOption[];
  bundleStockLimit?: number | string | null;
  bundleItems?: Array<{
    product: {
      id: number;
      name: string;
      image?: string;
    };
    quantity: number;
  }> | null;
  bundleItemCount?: number;
  bundleSavings?: string;
};

type ReviewDTO = {
  productId: number | string;
  rating: number | string;
};

type FilterSectionKey =
  | "search"
  | "categories"
  | "brands"
  | "types"
  | "price"
  | "status";

const toNumber = (value: unknown, fallback = 0) => {
  const parsed =
    typeof value === "string" ? Number(value.replace(/,/g, "")) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatBDT = (value: number) => {
  const rounded = Math.round(value);
  return `Tk ${rounded.toLocaleString("en-US")}`;
};

function computeStockFromVariants(variants?: ApiVariant[] | null) {
  const list = Array.isArray(variants) ? variants : [];
  if (!list.length) return 0;
  return list.reduce((sum, variant) => sum + toNumber(variant?.stock), 0);
}

function normalizeReviewsPayload(data: unknown): ReviewDTO[] {
  if (Array.isArray(data)) return data as ReviewDTO[];
  if (Array.isArray((data as { reviews?: ReviewDTO[] })?.reviews)) {
    return (data as { reviews: ReviewDTO[] }).reviews;
  }
  if (Array.isArray((data as { data?: ReviewDTO[] })?.data)) {
    return (data as { data: ReviewDTO[] }).data;
  }
  return [];
}

function FilterSection({
  title,
  sectionKey,
  openSections,
  toggleSection,
  children,
}: {
  title: string;
  sectionKey: FilterSectionKey;
  openSections: Record<FilterSectionKey, boolean>;
  toggleSection: (key: FilterSectionKey) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <button
        type="button"
        onClick={() => toggleSection(sectionKey)}
        className="flex w-full items-center justify-between mb-2 group"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
          {title}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
            openSections[sectionKey] ? "rotate-180" : ""
          }`}
        />
      </button>
      {openSections[sectionKey] && <div>{children}</div>}
    </div>
  );
}

export default function ProductsPage() {
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { status } = useSession();

  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductUI[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [showCount, setShowCount] = useState(20);
  const [visibleCount, setVisibleCount] = useState(20);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<
    "default" | "price_low" | "price_high" | "name_az"
  >("default");
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(0);
  const [priceMinBound, setPriceMinBound] = useState(0);
  const [priceMaxBound, setPriceMaxBound] = useState(0);
  const [brands, setBrands] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<number>>(
    new Set(),
  );
  const [openSections, setOpenSections] = useState<
    Record<FilterSectionKey, boolean>
  >({
    search: true,
    categories: true,
    brands: true,
    types: true,
    price: true,
    status: true,
  });
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const filterScrollRef = useRef<HTMLDivElement | null>(null);
  const [filterScrolling, setFilterScrolling] = useState(false);
  const scrollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const productsRes = await fetch("/api/products?view=storefront", {
          cache: "force-cache",
        });
        if (!productsRes.ok) {
          throw new Error(
            `Failed to load products: ${productsRes.status} ${productsRes.statusText}`,
          );
        }

        const data = (await productsRes.json()) as ApiProduct[];
        const reviewsData: ReviewDTO[] = [];
        const reviewList = normalizeReviewsPayload(reviewsData);

        const reviewStats = reviewList.reduce<
          Record<string, { sum: number; count: number }>
        >((accumulator, review) => {
          const productId = String(review.productId);
          const rating = toNumber(review.rating);
          if (!accumulator[productId]) {
            accumulator[productId] = { sum: 0, count: 0 };
          }
          accumulator[productId].sum += rating;
          accumulator[productId].count += 1;
          return accumulator;
        }, {});

        const mapped = (Array.isArray(data) ? data : []).map((product) => {
          const price = toNumber(product.basePrice);
          const originalPrice = toNumber(
            product.originalPrice ?? product.basePrice,
          );
          const discountPct =
            originalPrice > 0 && price < originalPrice
              ? Math.round(((originalPrice - price) / originalPrice) * 100)
              : 0;
          const categoryId =
            typeof product.categoryId === "number"
              ? product.categoryId
              : product.category?.id ?? null;
          const brandId =
            typeof product.brandId === "number"
              ? product.brandId
              : product.brand?.id ?? null;
          const stock =
            product.type === "BUNDLE"
              ? toNumber(product.bundleStockLimit, 0)
              : computeStockFromVariants(product.variants);
          const rating = reviewStats[String(product.id)] ?? {
            sum: 0,
            count: 0,
          };

          return {
            id: Number(product.id),
            name: String(product.name ?? "Untitled Product"),
            slug: String(product.slug ?? product.id),
            sku: String(product.sku ?? ""),
            type: String(product.type ?? ""),
            shortDesc: String(product.shortDesc ?? product.description ?? ""),
            available: Boolean(product.available ?? true),
            stock,
            image: product.image ?? "/placeholder.svg",
            price,
            originalPrice,
            discountPct,
            ratingAvg: rating.count
              ? rating.sum / rating.count
              : toNumber(product.ratingAvg),
            ratingCount: rating.count || toNumber(product.ratingCount),
            categoryId,
            brandId,
            categoryName: String(product.category?.name ?? ""),
            brandName: String(product.brand?.name ?? ""),
            featured: Boolean(product.featured),
            variants: Array.isArray(product.variants) ? product.variants : [],
            variantOptions: Array.isArray(product.variantOptions)
              ? product.variantOptions
              : [],
            bundleStockLimit: product.bundleStockLimit,
            bundleItems: product.bundleItems,
            bundleItemCount: product.bundleItemCount ?? undefined,
            bundleSavings: product.bundleSavings ?? undefined,
          } satisfies ProductUI;
        });

        const prices = mapped
          .map((product) => product.price)
          .filter((value) => Number.isFinite(value) && value > 0);
        const minBound = prices.length ? Math.floor(Math.min(...prices)) : 0;
        const maxBound = prices.length ? Math.ceil(Math.max(...prices)) : 0;

        setProducts(mapped);
        setBrands(
          mapped
            .filter((product) => product.brandId && product.brandName)
            .reduce<Array<{ id: number; name: string }>>((accumulator, product) => {
              if (accumulator.some((brand) => brand.id === product.brandId)) {
                return accumulator;
              }
              accumulator.push({
                id: product.brandId as number,
                name: product.brandName,
              });
              return accumulator;
            }, [])
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        setPriceMinBound(minBound);
        setPriceMaxBound(maxBound);
        setPriceMin(minBound);
        setPriceMax(maxBound);
      } catch (fetchError) {
        console.error(fetchError);
        setError("Failed to load data.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    const el = filterScrollRef.current;
    if (!el) return;

    const onScroll = () => {
      setFilterScrolling(true);
      if (scrollTimeoutRef.current) window.clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = window.setTimeout(() => {
        setFilterScrolling(false);
        scrollTimeoutRef.current = null;
      }, 700);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (scrollTimeoutRef.current) window.clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const categories = useMemo(
    () =>
      products
        .filter((product) => product.categoryId && product.categoryName)
        .reduce<Array<{ id: number; name: string }>>((accumulator, product) => {
          if (accumulator.some((category) => category.id === product.categoryId)) {
            return accumulator;
          }
          accumulator.push({
            id: product.categoryId as number,
            name: product.categoryName,
          });
          return accumulator;
        }, [])
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );

  const productTypes = useMemo(
    () =>
      Array.from(new Set(products.map((product) => product.type).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    if (searchTerm) {
      filtered = filtered.filter(
        (product) =>
          product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.shortDesc.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.sku.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    if (inStockOnly) filtered = filtered.filter((product) => product.stock > 0);
    if (selectedCategoryId) {
      filtered = filtered.filter(
        (product) => String(product.categoryId ?? "") === selectedCategoryId,
      );
    }
    if (selectedType) filtered = filtered.filter((product) => product.type === selectedType);
    if (featuredOnly) filtered = filtered.filter((product) => product.featured);
    if (selectedBrandIds.size > 0) {
      filtered = filtered.filter(
        (product) =>
          product.brandId !== null && selectedBrandIds.has(product.brandId),
      );
    }

    filtered = filtered.filter(
      (product) => product.price >= priceMin && product.price <= priceMax,
    );

    if (sortBy === "price_low") filtered.sort((a, b) => a.price - b.price);
    if (sortBy === "price_high") filtered.sort((a, b) => b.price - a.price);
    if (sortBy === "name_az") filtered.sort((a, b) => a.name.localeCompare(b.name));

    return filtered;
  }, [
    products,
    searchTerm,
    inStockOnly,
    selectedCategoryId,
    selectedType,
    featuredOnly,
    selectedBrandIds,
    priceMin,
    priceMax,
    sortBy,
  ]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount],
  );

  const hasMoreProducts = visibleCount < filteredProducts.length;

  useEffect(() => {
    setVisibleCount(showCount);
  }, [showCount]);

  useEffect(() => {
    setVisibleCount(() => {
      if (filteredProducts.length === 0) return showCount;
      return Math.min(showCount, filteredProducts.length);
    });
  }, [
    searchTerm,
    inStockOnly,
    selectedCategoryId,
    selectedType,
    featuredOnly,
    selectedBrandIds,
    priceMin,
    priceMax,
    sortBy,
    products,
    showCount,
    filteredProducts.length,
  ]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || loading || error || !hasMoreProducts) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setVisibleCount((current) =>
          Math.min(current + showCount, filteredProducts.length),
        );
      },
      { rootMargin: "200px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredProducts.length, hasMoreProducts, loading, error, showCount]);

  const toggleWishlist = useCallback(
    async (product: ProductUI) => {
      try {
        if (status !== "authenticated") {
          setLoginModalOpen(true);
          return;
        }

        const alreadyWishlisted = isInWishlist(product.id);
        if (alreadyWishlisted) {
          const response = await fetch(`/api/wishlist?productId=${product.id}`, {
            method: "DELETE",
          });
          if (!response.ok) throw new Error("Failed to remove from wishlist");
          removeFromWishlist(product.id);
          toast.success("Removed from wishlist.");
        } else {
          const response = await fetch("/api/wishlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: product.id }),
          });
          if (!response.ok) throw new Error("Failed to add to wishlist");
          addToWishlist(product.id);
          toast.success("Added to wishlist.");
        }
      } catch (err) {
        console.error(err);
        toast.error("Wishlist update failed.");
      }
    },
    [status, isInWishlist, addToWishlist, removeFromWishlist],
  );

  const handleAddToCart = useCallback(
    (product: ProductUI) => {
      try {
        if (product.stock === 0) {
          toast.error("This product is out of stock.");
          return;
        }
        addToCart(product.id);
        toast.success(`"${product.name}" added to cart.`);
      } catch (err) {
        console.error(err);
        toast.error("Failed to add to cart.");
      }
    },
    [addToCart],
  );

  const clearAllFilters = useCallback(() => {
    setSearchTerm("");
    setInStockOnly(false);
    setSelectedCategoryId("");
    setSelectedType("");
    setFeaturedOnly(false);
    setSelectedBrandIds(new Set());
    setPriceMin(priceMinBound);
    setPriceMax(priceMaxBound);
    setSortBy("default");
  }, [priceMinBound, priceMaxBound]);

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    inStockOnly ||
    selectedCategoryId !== "" ||
    selectedType !== "" ||
    featuredOnly ||
    selectedBrandIds.size > 0 ||
    priceMin !== priceMinBound ||
    priceMax !== priceMaxBound;

  const toggleSection = useCallback((section: FilterSectionKey) => {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }, []);

  const activeFilterCount = [
    searchTerm.trim().length > 0,
    inStockOnly,
    selectedCategoryId !== "",
    selectedType !== "",
    featuredOnly,
    selectedBrandIds.size > 0,
    priceMin !== priceMinBound || priceMax !== priceMaxBound,
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container px-4 py-4 md:px-6 md:py-6">
        {/* Hero Header */}
        <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-br from-background to-muted/50 dark:from-card dark:to-muted/20">
          <div className="grid gap-4 p-4 md:grid-cols-[1.2fr_1fr] md:items-center md:p-6 lg:p-8">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary shadow-sm dark:bg-primary/20">
                <Sparkles className="h-3.5 w-3.5" />
                All Products
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground sm:text-3xl lg:text-4xl">
                  Browse all products
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
                  Explore our complete product catalog with advanced filtering,
                  sorting, and quick add to cart functionality.
                </p>
              </div>
            </div>

            <div className="relative min-h-[100px] overflow-hidden rounded-lg md:min-h-[120px]">
              <div className="absolute -right-5 top-0 h-20 w-20 rounded-[24px] bg-primary/30 md:h-24 md:w-24" />
              <div className="absolute right-10 top-6 h-16 w-16 rounded-[18px] bg-accent/40 md:right-14 md:top-7 md:h-20 md:w-20" />
              <div className="absolute bottom-2 right-20 h-12 w-12 rounded-[16px] bg-secondary/30 md:right-28 md:h-16 md:w-16" />
            </div>
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {[...Array(12)].map((_, index) => (
                <div key={index} className="animate-pulse">
                  <div className="aspect-square rounded-xl bg-muted/60" />
                  <div className="mt-3 h-4 w-3/4 rounded bg-muted/60" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-muted/60" />
                  <div className="mt-2 h-8 rounded bg-muted/60" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="text-sm text-red-500">{error}</div>
              <Button className="mt-3" onClick={() => window.location.reload()}>
                Reload
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
              {/* Mobile Overlay */}
              {mobileFilterOpen && (
                <div
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                  onClick={() => setMobileFilterOpen(false)}
                />
              )}

              {/* ── FILTER SIDEBAR ── */}
              <aside
                className={`
                  fixed left-0 top-0 h-full w-[280px] bg-background z-50 flex flex-col
                  border-r border-border shadow-xl
                  transition-transform duration-300 ease-in-out
                  lg:sticky lg:top-[88px] lg:h-[calc(100vh-88px)] lg:w-auto lg:shadow-none
                  lg:border lg:border-border lg:rounded-xl lg:translate-x-0 lg:z-auto
                  ${mobileFilterOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
                `}
              >
                {/* Sidebar Header */}
                <div className="flex items-center justify-between px-4 py-4 border-b border-border shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-1 rounded-full bg-primary" />
                    <h2 className="text-sm font-semibold text-foreground tracking-wide">Filters</h2>
                    {activeFilterCount > 0 && (
                      <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold min-w-[18px] h-[18px] px-1">
                        {activeFilterCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                      >
                        Clear all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setMobileFilterOpen(false)}
                      className="lg:hidden h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Scrollable Filter Body */}
                <div
                  ref={filterScrollRef}
                  className={`flex-1 overflow-y-auto py-2 ${
                    filterScrolling ? "" : "scrollbar-hide"
                  }`}
                  onMouseEnter={() => setFilterScrolling(true)}
                  onMouseLeave={() => setFilterScrolling(false)}
                  onTouchStart={() => setFilterScrolling(true)}
                >
                  
                  {/* Search */}
                  <div className="px-4 py-3">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search products..."
                        className="h-9 w-full rounded-lg border border-border bg-muted/40 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:bg-background transition-colors"
                      />
                    </label>
                  </div>

                  <div className="h-px bg-border mx-4" />

                  {/* Price Range */}
                  <FilterSection
                    title="Price Range"
                    sectionKey="price"
                    openSections={openSections}
                    toggleSection={toggleSection}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Min</p>
                          <input
                            type="number"
                            min={priceMinBound}
                            max={priceMax}
                            value={priceMin}
                            onChange={(e) =>
                              setPriceMin(Math.min(toNumber(e.target.value, priceMinBound), priceMax))
                            }
                            className="h-8 w-full rounded-md border border-border bg-muted/40 px-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                          />
                        </div>
                        <div className="mt-5 text-muted-foreground text-xs">—</div>
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Max</p>
                          <input
                            type="number"
                            min={priceMin}
                            max={priceMaxBound}
                            value={priceMax}
                            onChange={(e) =>
                              setPriceMax(Math.max(toNumber(e.target.value, priceMaxBound), priceMin))
                            }
                            className="h-8 w-full rounded-md border border-border bg-muted/40 px-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                          />
                        </div>
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>৳{priceMinBound.toLocaleString()}</span>
                        <span>৳{priceMaxBound.toLocaleString()}</span>
                      </div>
                    </div>
                  </FilterSection>

                  <div className="h-px bg-border mx-4" />

                  {/* Categories */}
                  <FilterSection
                    title="Category"
                    sectionKey="categories"
                    openSections={openSections}
                    toggleSection={toggleSection}
                  >
                    <div className="space-y-0.5 max-h-56 overflow-y-auto">
                      <label
                        className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
                          selectedCategoryId === ""
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <input
                          type="radio"
                          name="category-filter"
                          checked={selectedCategoryId === ""}
                          onChange={() => setSelectedCategoryId("")}
                          className="hidden"
                        />
                        <span
                          className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                            selectedCategoryId === ""
                              ? "border-primary bg-primary"
                              : "border-border"
                          }`}
                        >
                          {selectedCategoryId === "" && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                          )}
                        </span>
                        <span className="truncate">All categories</span>
                      </label>
                      {categories.map((cat) => (
                        <label
                          key={cat.id}
                          className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
                            selectedCategoryId === String(cat.id)
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted text-foreground"
                          }`}
                        >
                          <input
                            type="radio"
                            name="category-filter"
                            checked={selectedCategoryId === String(cat.id)}
                            onChange={() => setSelectedCategoryId(String(cat.id))}
                            className="hidden"
                          />
                          <span
                            className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                              selectedCategoryId === String(cat.id)
                                ? "border-primary bg-primary"
                                : "border-border"
                            }`}
                          >
                            {selectedCategoryId === String(cat.id) && (
                              <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                            )}
                          </span>
                          <span className="truncate">{cat.name}</span>
                        </label>
                      ))}
                    </div>
                  </FilterSection>

                  <div className="h-px bg-border mx-4" />

                  {/* Brands */}
                  {brands.length > 0 && (
                    <>
                      <FilterSection
                        title="Brand"
                        sectionKey="brands"
                        openSections={openSections}
                        toggleSection={toggleSection}
                      >
                        <div className="space-y-0.5 max-h-48 overflow-y-auto">
                          {brands.map((brand) => (
                            <label
                              key={brand.id}
                              className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
                                selectedBrandIds.has(brand.id)
                                  ? "bg-primary/10 text-primary"
                                  : "hover:bg-muted text-foreground"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedBrandIds.has(brand.id)}
                                onChange={(e) => {
                                  setSelectedBrandIds((curr) => {
                                    const next = new Set(curr);
                                    if (e.target.checked) {
                                      next.add(brand.id);
                                    } else {
                                      next.delete(brand.id);
                                    }
                                    return next;
                                  });
                                }}
                                className="hidden"
                              />
                              <span
                                className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                  selectedBrandIds.has(brand.id)
                                    ? "border-primary bg-primary"
                                    : "border-border"
                                }`}
                              >
                                {selectedBrandIds.has(brand.id) && (
                                  <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 10 10" fill="none">
                                    <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                              </span>
                              <span className="truncate">{brand.name}</span>
                            </label>
                          ))}
                        </div>
                      </FilterSection>
                      <div className="h-px bg-border mx-4" />
                    </>
                  )}

                  {/* Product Type */}
                  <FilterSection
                    title="Product Type"
                    sectionKey="types"
                    openSections={openSections}
                    toggleSection={toggleSection}
                  >
                    <div className="space-y-0.5">
                      <label
                        className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
                          selectedType === ""
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <input
                          type="radio"
                          name="type-filter"
                          checked={selectedType === ""}
                          onChange={() => setSelectedType("")}
                          className="hidden"
                        />
                        <span
                          className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                            selectedType === ""
                              ? "border-primary bg-primary"
                              : "border-border"
                          }`}
                        >
                          {selectedType === "" && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                          )}
                        </span>
                        <span className="capitalize">All types</span>
                      </label>
                      {productTypes.map((type) => (
                        <label
                          key={type}
                          className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
                            selectedType === type
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted text-foreground"
                          }`}
                        >
                          <input
                            type="radio"
                            name="type-filter"
                            checked={selectedType === type}
                            onChange={() => setSelectedType(type)}
                            className="hidden"
                          />
                          <span
                            className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                              selectedType === type
                                ? "border-primary bg-primary"
                                : "border-border"
                            }`}
                          >
                            {selectedType === type && (
                              <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                            )}
                          </span>
                          <span className="capitalize">{type.toLowerCase()}</span>
                        </label>
                      ))}
                    </div>
                  </FilterSection>

                  <div className="h-px bg-border mx-4" />

                  {/* Status toggles */}
                  <FilterSection
                    title="Availability"
                    sectionKey="status"
                    openSections={openSections}
                    toggleSection={toggleSection}
                  >
                    <div className="space-y-1">
                      <label className="flex items-center justify-between px-2 py-2 rounded-md cursor-pointer hover:bg-muted transition-colors group">
                        <span className="text-sm text-foreground">In stock only</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={inStockOnly}
                          onClick={() => setInStockOnly(!inStockOnly)}
                          className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${
                            inStockOnly ? "bg-primary" : "bg-border"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                              inStockOnly ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </label>
                      <label className="flex items-center justify-between px-2 py-2 rounded-md cursor-pointer hover:bg-muted transition-colors group">
                        <span className="text-sm text-foreground">Featured only</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={featuredOnly}
                          onClick={() => setFeaturedOnly(!featuredOnly)}
                          className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${
                            featuredOnly ? "bg-primary" : "bg-border"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                              featuredOnly ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </label>
                    </div>
                  </FilterSection>

                </div>
              </aside>

              {/* ── MAIN CONTENT ── */}
              <div className="min-w-0">
                
                {/* Mobile filter toggle */}
                <div className="mb-4 lg:hidden">
                  <Button
                    onClick={() => setMobileFilterOpen(true)}
                    variant="outline"
                    className="w-full gap-2 border-dashed"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters {activeFilterCount > 0 && `(${activeFilterCount} active)`}
                  </Button>
                </div>

                {/* Toolbar */}
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    Showing{" "}
                    <span className="font-semibold text-foreground">
                      {Math.min(visibleProducts.length, filteredProducts.length)}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-foreground">
                      {filteredProducts.length}
                    </span>{" "}
                    products
                  </p>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground text-xs">Show</span>
                      <select
                        value={showCount}
                        onChange={(e) => setShowCount(Number(e.target.value))}
                        className="h-8 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <option value={20}>20</option>
                        <option value={40}>40</option>
                        <option value={60}>60</option>
                        <option value={100}>100</option>
                      </select>
                    </div>

                    <div className="h-4 w-px bg-border" />

                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground text-xs">Sort</span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="h-8 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <option value="default">Default</option>
                        <option value="price_low">Price: Low → High</option>
                        <option value="price_high">Price: High → Low</option>
                        <option value="name_az">Name: A–Z</option>
                      </select>
                    </div>
                  </div>
                </div>

                {visibleProducts.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-12 text-center">
                    <p className="text-muted-foreground">No products found for your filters.</p>
                    {hasActiveFilters && (
                      <Button
                        variant="link"
                        onClick={clearAllFilters}
                        className="mt-2"
                      >
                        Clear all filters
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* 
                      Responsive Grid:
                      - Mobile: 1 card (full width)
                      - Tablet (sm): 2 cards
                      - Desktop (lg): 3 cards
                      - Large desktop (xl): 4 cards
                      - Extra large (2xl): 5 cards  
                    */}
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                      {visibleProducts.map((product) => (
                        <ProductCard
                          key={product.id}
                          product={{
                            id: product.id,
                            name: product.name,
                            href: `/ecommerce/products/${product.id}`,
                            image: product.image,
                            price: product.price,
                            originalPrice: product.originalPrice,
                            discountPct: product.discountPct,
                            sku: product.sku,
                            type: product.type,
                            shortDesc: product.shortDesc,
                            stock: product.stock,
                            variants: product.variants,
                            ratingAvg: product.ratingAvg,
                            ratingCount: product.ratingCount,
                            available: product.stock > 0,
                            totalSold: product.ratingCount > 0 ? product.ratingCount : undefined,
                            bundleStockLimit: product.bundleStockLimit ?? undefined,
                            bundleItems: product.bundleItems ?? undefined,
                            bundleItemCount: product.bundleItemCount,
                            bundleSavings: product.bundleSavings,
                          }}
                          wishlisted={isInWishlist(product.id)}
                          onWishlistClick={() => toggleWishlist(product)}
                          onAddToCart={() => handleAddToCart(product)}
                          formatPrice={formatBDT}
                          addToCartLabel="Add to Cart"
                        />
                      ))}
                    </div>

                    {hasMoreProducts && (
                      <div
                        ref={loadMoreRef}
                        className="flex justify-center py-8"
                      >
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
                          Loading more products...
                        </div>
                      </div>
                    )}

                    {!hasMoreProducts && filteredProducts.length > showCount && (
                      <div className="py-8 text-center">
                        <div className="inline-flex items-center rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
                          End of results
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <Dialog open={loginModalOpen} onOpenChange={setLoginModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                Please login first
              </DialogTitle>
              <DialogDescription>
                You need to be logged in to use wishlist.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 sm:gap-0">
              <button
                type="button"
                onClick={() => setLoginModalOpen(false)}
                className="h-10 rounded-lg border border-border bg-background px-4 font-semibold text-foreground transition hover:bg-accent"
              >
                Cancel
              </button>
              <Link
                href="/signin"
                onClick={() => setLoginModalOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Login
              </Link>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
