"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWishlist } from "@/components/ecommarce/WishlistContext";
import { cachedFetchJson } from "@/lib/client-cache-fetch";
import {
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
import { FaRobot } from "react-icons/fa";

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
  shortDesc?: string | null;
  specifications?: Array<{ label: string; value: string }>;
  basePrice: number;
  originalPrice: number | null;
  currency: string;
  createdAt?: string;
  ratingAvg: number;
  ratingCount: number;
  totalSold?: number | null;
  rank?: number | null;
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
  rating: number | string;
  comment?: string | null;
  productId: number | string;
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

export default function BestSelling({
  title = "Best Selling",
  subtitle = "Top selling products right now",
  limit = 20,
  topSellingData,
  reviewsData,
  isAuthenticated = false,
}: {
  title?: string;
  subtitle?: string;
  limit?: number;
  topSellingData?: any[];
  reviewsData?: any[];
  isAuthenticated?: boolean;
}) {
  const hasPreloadedData =
    topSellingData !== undefined && reviewsData !== undefined;
  const [loading, setLoading] = useState(!hasPreloadedData);
  const [items, setItems] = useState<ProductDTO[]>(() =>
    topSellingData
      ? normalizeStorefrontProducts(topSellingData, { requireSold: true })
      : [],
  );
  const [reviews, setReviews] = useState<ReviewDTO[]>(() =>
    reviewsData ? normalizeStorefrontReviews(reviewsData) : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (hasPreloadedData) return;

    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const pData =
          topSellingData ??
          (await cachedFetchJson<any>("/api/products/top-selling", {
            ttlMs: 2 * 60 * 1000,
          }));
        const rData =
          reviewsData ??
          (await cachedFetchJson<any>("/api/reviews?view=storefront", { ttlMs: 60 * 1000 }));

        if (!mounted) return;

        const pList: any[] = Array.isArray(pData) ? pData : (pData?.data ?? []);
        const rList = normalizeReviewsPayload(rData);

        const storefrontProducts = pList.filter(
          (p) =>
            p?.available !== false &&
            p?.deleted !== true &&
            toNumber(p?.totalSold ?? p?.soldCount, 0) > 0,
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
            basePrice,
            originalPrice,
            currency: String(p.currency ?? "BDT"),
            createdAt: p.createdAt ? String(p.createdAt) : undefined,
            ratingAvg: toNumber(p.ratingAvg, 0),
            ratingCount: toNumber(p.ratingCount, 0),
            totalSold: p.totalSold ?? p.soldCount ?? null,
            rank: p.rank ?? null,
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
          rating: r.rating,
          comment: r.comment ?? null,
          productId: r.productId,
          createdAt: r.createdAt,
        }));

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
  }, [topSellingData, reviewsData, hasPreloadedData]);

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

  const visible = useMemo(() => items.slice(0, limit), [items, limit]);

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

  return (
    <section className="w-full bg-background">
      <div className="w-full px-5 py-5 sm:px-5 sm:py-5 lg:px-5">
        <div className="flex gap-3 justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground sm:text-xl">
              {title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {subtitle}
            </p>
          </div>

          <div className="flex-shrink-0">
            <button
              onClick={() => {
                console.log("Ask AI clicked");
              }}
              className="group relative flex w-full items-center gap-2 rounded-full bg-primary px-4 py-2 transition-all duration-200 hover:bg-secondary/90"
            >
              <div className="relative">
                <FaRobot className="h-4 w-4 text-primary-foreground transition-transform group-hover:scale-110" />
                <div className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full border border-background bg-primary" />
              </div>

              <span className="text-sm font-medium text-primary-foreground transition-colors group-hover:text-primary-foreground">
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
                          shortDesc: p.shortDesc ?? undefined,
                          specifications: p.specifications,
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
                          totalSold: p.totalSold,
                          rank: p.rank,
                        }}
                        wishlisted={isWishlisted}
                        onWishlistClick={() => toggleWishlist(p)}
                        primaryAction="view-details"
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

        {!loading && visible.length === 0 ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            No best selling products found.
          </div>
        ) : null}
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
