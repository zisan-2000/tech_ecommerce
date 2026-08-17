"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import { FaRobot } from "react-icons/fa";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import { useCart } from "@/components/ecommarce/CartContext";
import { cachedFetchJson } from "@/lib/client-cache-fetch";
import {
  normalizeStorefrontCategories,
  normalizeStorefrontProducts,
  normalizeStorefrontReviews,
} from "@/lib/storefront-client-data";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import ProductCardCompact from "./ProductCard";
import GradientBorder from "@/components/ui/GradientBorder";
import SliderNavButton from "./SliderNavButton";

type Category = {
  id: number | string;
  name: string;
  slug?: string;
};

type ApiVariant = {
  stock?: number | string | null;
  price?: number | string | null;
  options?: Record<string, string | number | null | undefined> | null;
  colorImage?: string | null;
};

type ProductDTO = {
  id: number | string;
  name: string;
  slug: string;
  image: string | null;
  categoryId: string;
  basePrice: number;
  originalPrice: number | null;
  currency: string;
  createdAt: string;
  ratingAvg: number;
  ratingCount: number;
  variants?: ApiVariant[] | null;
  type?: string;
  bundleStockLimit?: number | string | null;
  bundleItems?: Array<{
    product: {
      id: number;
      name: string;
      image?: string;
    };
    quantity: number;
  }>;
  bundleItemCount?: number;
  bundleSavings?: string;
  stock: number;
};

type ReviewDTO = {
  id?: number | string;
  productId: number | string;
  rating: number | string;
  comment?: string | null;
  createdAt?: string;
};

function normalizeReviewsPayload(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.reviews)) return data.reviews;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function toNumber(v: any, fallback = 0) {
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function computeStockFromVariants(variants?: ApiVariant[] | null) {
  const list = Array.isArray(variants) ? variants : [];
  if (!list.length) return 0;
  return list.reduce((sum, v) => sum + toNumber(v?.stock, 0), 0);
}

function formatBDT(n: number) {
  return `${Math.round(n).toLocaleString("en-US")}৳`;
}

function calcDiscountPercent(base: number, original: number | null) {
  if (!original || original <= base) return null;
  const p = Math.round(((original - base) / original) * 100);
  return p > 0 ? p : null;
}

export default function NewArrivals({
  title = "New Arrivals",
  subtitle = "Check Our Latest Products",
  limit = 20,
  productsData,
  categoriesData,
  reviewsData,
  isAuthenticated = false,
}: {
  title?: string;
  subtitle?: string;
  limit?: number;
  productsData?: any[];
  categoriesData?: any[];
  reviewsData?: any[];
  isAuthenticated?: boolean;
}) {
  const hasPreloadedData =
    productsData !== undefined &&
    categoriesData !== undefined &&
    reviewsData !== undefined;
  const [loading, setLoading] = useState(!hasPreloadedData);
  const [items, setItems] = useState<ProductDTO[]>(() =>
    productsData ? normalizeStorefrontProducts(productsData) : [],
  );
  const [categories, setCategories] = useState<Category[]>(() =>
    categoriesData ? normalizeStorefrontCategories(categoriesData) : [],
  );
  const [reviews, setReviews] = useState<ReviewDTO[]>(() =>
    reviewsData ? normalizeStorefrontReviews(reviewsData) : [],
  );
  const [error, setError] = useState<string | null>(null);

  const [active, setActive] = useState<"ALL" | string>("ALL");
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [canScrollCategoriesLeft, setCanScrollCategoriesLeft] = useState(false);
  const [canScrollCategoriesRight, setCanScrollCategoriesRight] =
    useState(false);
  const [showCategoryScrollbar, setShowCategoryScrollbar] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const categoryScrollerRef = useRef<HTMLDivElement | null>(null);
  const categoryScrollbarTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();

  const toggleWishlist = useCallback(
    async (p: ProductDTO) => {
      try {
        if (!isAuthenticated) {
          setLoginModalOpen(true);
          return;
        }

        const already = isInWishlist(p.id);

        if (already) {
          const res = await fetch(`/api/wishlist?productId=${p.id}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error("Failed to remove from wishlist");
          removeFromWishlist(p.id);
        } else {
          const res = await fetch("/api/wishlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: p.id }),
          });
          if (!res.ok) throw new Error("Failed to add to wishlist");
          addToWishlist(p.id);
        }
      } catch (err) {
        console.error(err);
      }
    },
    [isAuthenticated, isInWishlist, addToWishlist, removeFromWishlist],
  );

  const handleAddToCart = useCallback(
    (p: ProductDTO) => {
      try {
        addToCart(p.id);
      } catch (err) {
        console.error(err);
      }
    },
    [addToCart],
  );

  useEffect(() => {
    if (hasPreloadedData) return;

    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const pData =
          productsData ??
          (await cachedFetchJson<any>("/api/products?view=storefront", {
            ttlMs: 2 * 60 * 1000,
          }));
        const cData =
          categoriesData ??
          (await cachedFetchJson<any>("/api/categories?view=storefront", {
            ttlMs: 5 * 60 * 1000,
          }));
        const rData =
          reviewsData ??
          (await cachedFetchJson<any>("/api/reviews?view=storefront", { ttlMs: 60 * 1000 }));

        if (!mounted) return;

        const pList: any[] = Array.isArray(pData) ? pData : (pData?.data ?? []);
        const cList: any[] = Array.isArray(cData) ? cData : (cData?.data ?? []);
        const rList = normalizeReviewsPayload(rData);

        const mappedCats: Category[] = cList.map((c) => ({
          id: c.id,
          name: String(c.name ?? ""),
          slug: c.slug ? String(c.slug) : undefined,
        }));

        const storefrontProducts = pList.filter(
          (p) => p?.available !== false && p?.deleted !== true,
        );
        const mappedProducts: ProductDTO[] = storefrontProducts.map((p) => {
          const variants = Array.isArray(p?.variants) ? p.variants : [];
          const type = p?.type ? String(p.type) : undefined;
          const bundleStockLimit =
            p?.bundleStockLimit !== null && p?.bundleStockLimit !== undefined
              ? p.bundleStockLimit
              : null;

          const stock =
            type === "BUNDLE"
              ? toNumber(bundleStockLimit, 0)
              : computeStockFromVariants(variants);

          const basePrice = toNumber(p?.basePrice, 0);
          const originalPrice =
            p?.originalPrice !== null && p?.originalPrice !== undefined
              ? toNumber(p.originalPrice, 0)
              : null;

          return {
            id: p.id,
            name: String(p.name ?? ""),
            slug: String(p.slug ?? ""),
            image: p.image ?? null,
            categoryId: String(p?.categoryId ?? ""),
            basePrice,
            originalPrice,
            currency: String(p.currency ?? "BDT"),
            createdAt: String(p.createdAt ?? ""),
            ratingAvg: toNumber(p.ratingAvg, 0),
            ratingCount: toNumber(p.ratingCount, 0),
            variants,
            type,
            bundleStockLimit,
            bundleItems: p.bundleItems,
            bundleItemCount: p.bundleItemCount,
            bundleSavings: p.bundleSavings,
            stock,
          };
        });

        const mappedReviews: ReviewDTO[] = rList.map((r) => ({
          id: r.id,
          productId: r.productId,
          rating: r.rating,
          comment: r.comment ?? null,
          createdAt: r.createdAt,
        }));

        setCategories(mappedCats);
        setItems(mappedProducts);
        setReviews(mappedReviews);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Something went wrong");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [productsData, categoriesData, reviewsData, hasPreloadedData]);

  const reviewStats = useMemo(() => {
    const map: Record<string, { count: number; sum: number; avg: number }> = {};

    for (const r of reviews) {
      const pid = String(r.productId);
      const rating = toNumber(r.rating, 0);
      if (!map[pid]) map[pid] = { count: 0, sum: 0, avg: 0 };
      map[pid].count += 1;
      map[pid].sum += rating;
    }

    Object.keys(map).forEach((pid) => {
      map[pid].avg = map[pid].count ? map[pid].sum / map[pid].count : 0;
    });

    return map;
  }, [reviews]);

  const allTabs = useMemo(() => {
    const categoryIdsWithProducts = new Set(
      items.map((item) => item.categoryId),
    );
    const sorted = categories
      .filter((category) => categoryIdsWithProducts.has(String(category.id)))
      .sort((a, b) =>
        String(a.name).localeCompare(String(b.name), "en", {
          sensitivity: "base",
        }),
      );
    return sorted;
  }, [categories, items]);

  const latestSorted = useMemo(() => {
    const list = [...items];
    list.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return list;
  }, [items]);

  const filtered = useMemo(() => {
    if (active === "ALL") return latestSorted;
    return latestSorted.filter((p) => p.categoryId === active);
  }, [latestSorted, active]);

  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  const syncCategoryScrollState = useCallback(() => {
    const el = categoryScrollerRef.current;
    if (!el) {
      setCanScrollCategoriesLeft(false);
      setCanScrollCategoriesRight(false);
      return;
    }

    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollCategoriesLeft(el.scrollLeft > 8);
    setCanScrollCategoriesRight(maxScrollLeft - el.scrollLeft > 8);
  }, []);

  const revealCategoryScrollbar = useCallback(() => {
    setShowCategoryScrollbar(true);

    if (categoryScrollbarTimeoutRef.current) {
      clearTimeout(categoryScrollbarTimeoutRef.current);
    }

    categoryScrollbarTimeoutRef.current = setTimeout(() => {
      setShowCategoryScrollbar(false);
    }, 900);
  }, []);

  const handleCategoryWheel = useCallback(
    (event: globalThis.WheelEvent) => {
      const el = categoryScrollerRef.current;
      if (!el) return;

      const hasHorizontalOverflow = el.scrollWidth > el.clientWidth;
      if (!hasHorizontalOverflow) return;

      const delta =
        Math.abs(event.deltaY) > Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;

      if (delta === 0) return;

      event.preventDefault();
      revealCategoryScrollbar();
      el.scrollBy({
        left: delta,
        behavior: "smooth",
      });
    },
    [revealCategoryScrollbar],
  );

  useEffect(() => {
    const el = categoryScrollerRef.current;
    if (!el) return;

    el.addEventListener("wheel", handleCategoryWheel, { passive: false });

    return () => {
      el.removeEventListener("wheel", handleCategoryWheel);
    };
  }, [handleCategoryWheel]);

  const scrollByCards = (dir: "left" | "right") => {
    const el = scrollerRef.current;
    if (!el) return;

    const card = el.querySelector<HTMLElement>("[data-card='1']");
    const cardW = card ? card.offsetWidth : 240;

    el.scrollBy({
      left: dir === "left" ? -cardW * 1.2 : cardW * 1.2,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    scrollerRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [active]);

  useEffect(() => {
    if (active === "ALL") return;
    const hasActiveTab = allTabs.some(
      (category) => String(category.id) === active,
    );
    if (!hasActiveTab) {
      setActive("ALL");
    }
  }, [active, allTabs]);

  useEffect(() => {
    syncCategoryScrollState();

    const el = categoryScrollerRef.current;
    if (!el) return;

    const handleScroll = () => {
      syncCategoryScrollState();
      revealCategoryScrollbar();
    };
    const handleResize = () => syncCategoryScrollState();

    el.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [allTabs, revealCategoryScrollbar, syncCategoryScrollState]);

  useEffect(() => {
    return () => {
      if (categoryScrollbarTimeoutRef.current) {
        clearTimeout(categoryScrollbarTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const activeTab = categoryScrollerRef.current?.querySelector<HTMLElement>(
      `[data-category-tab="${active}"]`,
    );

    activeTab?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [active]);

  return (
    <section className="w-full bg-background">
      <div className="w-full px-5 py-5 sm:px-5 sm:py-5 lg:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground sm:text-2xl">
              {title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {subtitle}
            </p>
          </div>
          <div className="flex w-full min-w-0 items-center gap-2 xl:w-auto xl:max-w-[min(62vw,920px)]">
            <button
              type="button"
              onClick={() => setActive("ALL")}
              className={`flex-shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs uppercase tracking-wide transition-colors sm:px-3.5 sm:text-sm ${
                active === "ALL"
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              All
            </button>

            <div className="relative flex-1 min-w-0">
              <div
                ref={categoryScrollerRef}
                onMouseEnter={revealCategoryScrollbar}
                className={`flex items-center gap-1.5 overflow-x-auto scroll-smooth snap-x snap-proximity pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
              >
                {allTabs.map((c) => (
                  <button
                    key={String(c.id)}
                    type="button"
                    data-category-tab={String(c.id)}
                    onClick={() => setActive(String(c.id))}
                    className={`snap-start flex-shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs capitalize transition-colors sm:px-3.5 sm:text-sm ${
                      active === String(c.id)
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {String(c.name).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                console.log("Ask AI clicked");
              }}
              className="group relative flex flex-shrink-0 items-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-full bg-primary transition-all duration-200 hover:bg-secondary/90 active:scale-95 sm:hover:scale-100
    /* Mobile: smaller padding and hide text */
    px-2 py-2 sm:px-3 sm:py-2 lg:px-4 lg:py-2"
            >
              <div className="relative">
                <FaRobot className="h-3.5 w-3.5 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 text-primary-foreground transition-transform duration-200 group-hover:scale-110" />
                <div className="absolute -right-1 -top-1 h-1.5 w-1.5 sm:h-2 sm:w-2 animate-pulse rounded-full border border-background bg-primary" />
              </div>

              {/* Mobile: hidden, Tablet/Desktop: visible */}
              <span className="hidden sm:inline text-xs sm:text-sm font-medium text-primary-foreground">
                Ask AI
              </span>
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-border bg-background p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="group/slider relative mt-5 overflow-visible sm:mt-6">
          {visible.length >= 4 && (
            <SliderNavButton
              direction="left"
              onClick={() => scrollByCards("left")}
            />
          )}

          <div
            ref={scrollerRef}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-4 sm:gap-6"
            style={{ scrollbarWidth: "none" }}
          >
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="snap-start min-w-[220px] max-w-[220px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:min-w-[240px] sm:max-w-[240px]"
                  >
                    <div className="h-[160px] animate-pulse bg-muted sm:h-[170px]" />
                    <div className="p-4">
                      <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                      <div className="mt-3 h-4 rounded bg-muted animate-pulse" />
                      <div className="mt-3 h-4 w-2/3 rounded bg-muted animate-pulse" />
                      <div className="mt-5 h-8 rounded bg-muted animate-pulse" />
                    </div>
                  </div>
                ))
              : visible.map((p) => {
                  const discountPct = calcDiscountPercent(
                    p.basePrice,
                    p.originalPrice,
                  );

                  const stats = reviewStats[String(p.id)] ?? {
                    avg: p.ratingAvg,
                    count: p.ratingCount,
                  };

                  const isWishlisted = isInWishlist(p.id);

                  return (
                    <div
                      key={String(p.id)}
                      data-card="1"
                      className="snap-start shrink-0 w-[210px] xs:w-[220px] sm:w-[240px] md:w-[250px] lg:w-[260px]"
                    >
                      <ProductCardCompact
                        product={{
                          id: p.id,
                          name: p.name,
                          href: `/ecommerce/products/${p.id}`,
                          image: p.image,
                          price: p.basePrice,
                          originalPrice: p.originalPrice,
                          stock: p.stock,
                          variants: p.variants,
                          type: p.type,
                          bundleStockLimit: p.bundleStockLimit ?? undefined,
                          bundleItems: p.bundleItems,
                          bundleItemCount: p.bundleItemCount,
                          bundleSavings: p.bundleSavings,
                          ratingAvg: stats.avg,
                          ratingCount: stats.count,
                          discountPct: discountPct ?? undefined,
                        }}
                        wishlisted={isWishlisted}
                        onWishlistClick={() => toggleWishlist(p)}
                        onAddToCart={() => handleAddToCart(p)}
                        formatPrice={formatBDT}
                      />
                    </div>
                  );
                })}
          </div>

          {visible.length >= 4 && (
            <SliderNavButton
              direction="right"
              onClick={() => scrollByCards("right")}
            />
          )}
        </div>

        <div className="mt-4 h-px w-full bg-border" />
      </div>

      <Dialog open={loginModalOpen} onOpenChange={setLoginModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Please login first
            </DialogTitle>
            <DialogDescription>
              You need to be logged in to use the wishlist.
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
              className="btn-primary inline-flex h-10 items-center justify-center rounded-lg px-4 font-semibold transition"
            >
              Login
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
