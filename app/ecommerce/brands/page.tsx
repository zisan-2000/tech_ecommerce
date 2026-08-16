"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { cachedFetchJson } from "@/lib/client-cache-fetch";
import { useCart } from "@/components/ecommarce/CartContext";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import { useSession } from "@/lib/auth-client";
import ProductCard from "@/components/ecommarce/ProductCard";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SliderNavButton from "@/components/ecommarce/SliderNavButton";

type Brand = {
  id: number;
  name: string;
  slug: string;
  logo: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
};

type Product = {
  id: number;
  name: string;
  slug: string;
  image: string | null;
  basePrice: number;
  originalPrice: number | null;
  currency: string;
  brand: { id: number; name: string; slug: string } | null;
  category: { id: number; name: string; slug: string } | null;
  variants?: Array<{
    stock?: number | string | null;
    price?: number | string | null;
  }>;
  type?: string;
  bundleStockLimit?: number | string | null;
  bundleItems?: Array<{
    product: { id: number; name: string; image?: string };
    quantity: number;
  }>;
  bundleItemCount?: number;
  bundleSavings?: string;
  stock: number;
  ratingAvg?: number;
  ratingCount?: number;
};

type BrandWithProducts = { brand: Brand; products: Product[] };

function toNumber(v: any, fallback = 0) {
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function computeStockFromVariants(variants?: Product["variants"]) {
  const list = Array.isArray(variants) ? variants : [];
  if (!list.length) return 0;
  return list.reduce((sum, v) => sum + toNumber(v?.stock, 0), 0);
}

function formatBDT(n: number) {
  return `৳${Math.round(n).toLocaleString("en-US")}`;
}

function calcDiscountPercent(base: number, original: number | null) {
  if (!original || original <= base) return null;
  const p = Math.round(((original - base) / original) * 100);
  return p > 0 ? p : null;
}

// ── Brand Pill Nav ─────────────────────────────────────────────
const AVATAR_COLORS = [
  {
    bg: "bg-blue-50 dark:bg-blue-950/50",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
  },
  {
    bg: "bg-emerald-50 dark:bg-emerald-950/50",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  {
    bg: "bg-purple-50 dark:bg-purple-950/50",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-800",
  },
  {
    bg: "bg-amber-50 dark:bg-amber-950/50",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
  },
  {
    bg: "bg-rose-50 dark:bg-rose-950/50",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-800",
  },
  {
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-700",
  },
];

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function BrandAvatar({
  brand,
  idx,
  size = "sm",
}: {
  brand: Brand;
  idx: number;
  size?: "sm" | "md";
}) {
  const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
  const sizeClass = size === "sm" ? "w-5 h-5 text-[9px]" : "w-10 h-10 text-sm";

  if (brand.logo) {
    return (
      <div
        className={`${sizeClass} relative flex-shrink-0 rounded-md overflow-hidden border border-border`}
      >
        <Image
          src={brand.logo}
          alt={brand.name}
          fill
          className="object-contain p-0.5"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-${size === "sm" ? "full" : "lg"} flex items-center justify-center font-medium flex-shrink-0 ${color.bg} ${color.text} border ${color.border}`}
    >
      {getInitials(brand.name)}
    </div>
  );
}

// ── Brand Section Header ───────────────────────────────────────
function BrandSectionHeader({ brand, idx }: { brand: Brand; idx: number }) {
  const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];

  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        {brand.logo ? (
          <div className="w-10 h-10 relative rounded-xl overflow-hidden border border-border bg-muted/30">
            <Image
              src={brand.logo}
              alt={brand.name}
              fill
              className="object-contain p-1.5"
            />
          </div>
        ) : (
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-medium text-sm ${color.bg} ${color.text} border ${color.border}`}
          >
            {getInitials(brand.name)}
          </div>
        )}
        <div>
          <h2 className="text-[15px] font-medium text-foreground leading-none mb-1">
            {brand.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            {brand.productCount} products
          </p>
        </div>
      </div>
      <Link
        href={`/ecommerce/brands/${brand.slug}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-3 py-1.5 transition-colors hover:bg-muted/50"
      >
        View all
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6h8M7 3l3 3-3 3"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function BrandsPage() {
  const [allBrands, setAllBrands] = useState<Brand[]>([]);
  const [brandsWithProducts, setBrandsWithProducts] = useState<
    BrandWithProducts[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [activePill, setActivePill] = useState<number | null>(null);

  const BRANDS_PER_PAGE = 5;

  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);
  const isLoadingMore = useRef(false);

  // Navigation scroll functions
  const scrollNavLeft = useCallback(() => {
    if (navRef.current) {
      navRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  }, []);

  const scrollNavRight = useCallback(() => {
    if (navRef.current) {
      navRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  }, []);

  // ── Wishlist & cart handlers ──
  const toggleWishlist = useCallback(
    async (p: Product) => {
      if (!isAuthenticated) {
        setLoginModalOpen(true);
        return;
      }
      try {
        const already = isInWishlist(p.id);
        if (already) {
          const res = await fetch(`/api/wishlist?productId=${p.id}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error();
          removeFromWishlist(p.id);
        } else {
          const res = await fetch("/api/wishlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: p.id }),
          });
          if (!res.ok) throw new Error();
          addToWishlist(p.id);
        }
      } catch {
        /* silent */
      }
    },
    [isAuthenticated, isInWishlist, addToWishlist, removeFromWishlist],
  );

  const handleAddToCart = useCallback(
    (p: Product) => {
      try {
        addToCart(p.id);
      } catch {
        /* silent */
      }
    },
    [addToCart],
  );

  // ── Load products for a slice of brands ──
  const loadSlice = useCallback(async (brands: Brand[], start: number) => {
    const slice = brands.slice(start, start + BRANDS_PER_PAGE);
    if (!slice.length) {
      setHasMore(false);
      return;
    }

    const results: BrandWithProducts[] = await Promise.all(
      slice.map(async (brand) => {
        try {
          const products = await cachedFetchJson<Product[]>(
            `/api/products?brandSlug=${brand.slug}&view=storefront`,
            { ttlMs: 2 * 60 * 1000 },
          );
          return { brand, products: Array.isArray(products) ? products : [] };
        } catch {
          return { brand, products: [] };
        }
      }),
    );

    setBrandsWithProducts((prev) => {
      const map = new Map<number, BrandWithProducts>();

      [...prev, ...results].forEach((item) => {
        map.set(item.brand.id, item);
      });

      return Array.from(map.values());
    });
    const nextStart = start + BRANDS_PER_PAGE;
    setLoadedCount(nextStart);
    setHasMore(nextStart < brands.length);
  }, []);

  // ── Initial load ──
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const data = await cachedFetchJson<Brand[]>("/api/brands?view=storefront", {
          ttlMs: 5 * 60 * 1000,
        });
        if (!Array.isArray(data)) throw new Error("Invalid response");
        const sorted = [...data].sort(
          (a, b) => b.productCount - a.productCount,
        );
        setAllBrands(sorted);
        await loadSlice(sorted, 0);
      } catch (e: any) {
        setError(e?.message || "Failed to load brands");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [loadSlice]);

  // ── Infinite scroll observer ──
  useEffect(() => {
    if (!hasMore || !loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      async (entries) => {
        if (!entries[0]?.isIntersecting || isLoadingMore.current || !hasMore)
          return;
        isLoadingMore.current = true;
        setLoadingMore(true);
        await loadSlice(allBrands, loadedCount);
        setLoadingMore(false);
        isLoadingMore.current = false;
      },
      { threshold: 0.1, rootMargin: "200px" },
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadedCount, allBrands, loadSlice]);

  // ── Scroll to brand ──
  const scrollToBrand = useCallback(
    (brandId: number) => {
      setActivePill(brandId);
      const el = document.getElementById(`brand-section-${brandId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });

      // If brand not yet loaded, load until it appears
      const brandIdx = allBrands.findIndex((b) => b.id === brandId);
      if (brandIdx >= loadedCount) {
        // Load more until this brand is visible — trigger by scrolling to bottom
        loadMoreRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    },
    [allBrands, loadedCount],
  );

  // ── Map products ──
  const mapProducts = useCallback((products: Product[]) => {
    return products.map((p) => {
      const type = p?.type ? String(p.type) : undefined;
      const stock =
        type === "BUNDLE"
          ? toNumber(p.bundleStockLimit, 0)
          : computeStockFromVariants(p.variants);
      return { ...p, stock };
    });
  }, []);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="animate-pulse space-y-8">
          <div>
            <div className="h-3 w-24 rounded bg-muted mb-3" />
            <div className="h-6 w-40 rounded bg-muted mb-2" />
            <div className="h-3 w-64 rounded bg-muted" />
          </div>
          <div className="flex gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 w-24 rounded-full bg-muted" />
            ))}
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-muted" />
                <div>
                  <div className="h-4 w-28 rounded bg-muted mb-1.5" />
                  <div className="h-3 w-16 rounded bg-muted" />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="rounded-xl bg-muted h-52" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* ── Page header ── */}
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1.5">
          Explore by brand
        </p>
        <h1 className="text-2xl font-semibold text-foreground mb-1">
          All Brands
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse products from every brand, one section at a time
        </p>
      </div>

      {/* Sticky brand pill nav */}
      {allBrands.length > 0 && (
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border pb-3 mb-8 -mx-4 px-4 pt-3">
          <div className="group/slider relative">
            <SliderNavButton direction="left" onClick={scrollNavLeft} />
            <SliderNavButton direction="right" onClick={scrollNavRight} />
            <div
              ref={navRef}
              className="flex gap-2 overflow-x-auto no-scrollbar pb-1"
            >
              {allBrands.map((brand, idx) => (
                <button
                  key={brand.id}
                  onClick={() => scrollToBrand(brand.id)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs whitespace-nowrap flex-shrink-0 transition-all duration-150 ${
                    activePill === brand.id
                      ? "bg-foreground text-background border-foreground font-medium"
                      : "border-border bg-background text-foreground hover:bg-muted hover:border-border"
                  }`}
                >
                  <BrandAvatar brand={brand} idx={idx} size="sm" />
                  {brand.name}
                  <span
                    className={`text-[10px] ${activePill === brand.id ? "text-background/70" : "text-muted-foreground"}`}
                  >
                    {brand.productCount}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Brand sections ── */}
      <div className="space-y-0">
        {brandsWithProducts.map(({ brand, products }, sectionIdx) => {
          const mapped = mapProducts(products);
          const colorIdx = allBrands.findIndex((b) => b.id === brand.id);

          return (
            <div key={`brand-section-${brand.id}`}>
              <section
                id={`brand-section-${brand.id}`}
                className="scroll-mt-[120px] py-8"
              >
                <BrandSectionHeader brand={brand} idx={colorIdx} />

                {mapped.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      No products available for this brand yet
                    </p>
                    <Link
                      href={`/ecommerce/brands/${brand.slug}`}
                      className="text-xs text-muted-foreground underline mt-1 inline-block"
                    >
                      Check brand page
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {mapped.map((p) => {
                      const discountPct = calcDiscountPercent(
                        p.basePrice,
                        p.originalPrice,
                      );

                      return (
                        <div key={`${brand.id}-${p.id}`} className="min-w-0 h-full">
                          <ProductCard
                            product={{
                              id: p.id,
                              name: p.name,
                              href: `/ecommerce/products/${p.id}`,
                              image: p.image,
                              price: p.basePrice,
                              originalPrice: p.originalPrice,
                              stock: p.stock,
                              type: p.type,
                              bundleStockLimit: p.bundleStockLimit ?? undefined,
                              bundleItems: p.bundleItems,
                              bundleItemCount: p.bundleItemCount,
                              bundleSavings: p.bundleSavings,
                              ratingAvg: p.ratingAvg,
                              ratingCount: p.ratingCount,
                              discountPct: discountPct ?? undefined,
                            }}
                            wishlisted={isInWishlist(p.id)}
                            onWishlistClick={() => toggleWishlist(p)}
                            onAddToCart={() => handleAddToCart(p)}
                            formatPrice={formatBDT}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {sectionIdx < brandsWithProducts.length - 1 && (
                <div className="h-px bg-border" />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Infinite scroll trigger ── */}
      <div ref={loadMoreRef} className="py-8">
        {loadingMore && (
          <div className="flex justify-center">
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <div className="w-4 h-4 rounded-full border-2 border-border border-t-foreground animate-spin" />
              Loading more brands...
            </div>
          </div>
        )}
        {!hasMore && brandsWithProducts.length > 0 && (
          <div className="text-center">
            <span className="text-xs text-muted-foreground border border-dashed border-border rounded-full px-4 py-1.5">
              All {allBrands.length} brands loaded
            </span>
          </div>
        )}
      </div>

      {/* ── Login modal ── */}
      <Dialog open={loginModalOpen} onOpenChange={setLoginModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Please login first</DialogTitle>
            <DialogDescription>
              You need to be logged in to use the wishlist.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setLoginModalOpen(false)}
              className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <Link
              href="/signin"
              onClick={() => setLoginModalOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Login
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
