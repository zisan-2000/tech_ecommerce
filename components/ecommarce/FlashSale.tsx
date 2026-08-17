"use client";

import { useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { useCart } from "@/components/ecommarce/CartContext";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import ProductCardCompact from "@/components/ecommarce/ProductCard";
import type { StorefrontHomeData } from "@/lib/storefront-home";

type FlashSaleProduct = StorefrontHomeData["flashSaleProducts"][number];

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stockFromVariants(variants: FlashSaleProduct["variants"]) {
  return (Array.isArray(variants) ? variants : []).reduce(
    (total, variant) => total + toNumber(variant?.stock),
    0,
  );
}

function discountPercent(basePrice: number, originalPrice: number | null) {
  if (!originalPrice || originalPrice <= basePrice) return 0;
  return Math.round(((originalPrice - basePrice) / originalPrice) * 100);
}

const formatPrice = (value: number) =>
  `৳${Math.round(value).toLocaleString("en-US")}`;

function normalizeVariantOptions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return Object.fromEntries(
    Object.entries(value).filter((entry) => {
      const optionValue = entry[1];
      return (
        optionValue === null ||
        typeof optionValue === "string" ||
        typeof optionValue === "number"
      );
    }),
  );
}

export default function FlashSale({
  productsData,
  isAuthenticated,
}: {
  productsData: FlashSaleProduct[];
  isAuthenticated: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();

  const products = useMemo(
    () =>
      productsData.slice(0, 20).map((product) => {
        const basePrice = toNumber(product.basePrice);
        const originalPrice = product.originalPrice
          ? toNumber(product.originalPrice)
          : null;
        return {
          ...product,
          basePrice,
          originalPrice,
          stock:
            product.type === "BUNDLE"
              ? toNumber(product.bundleStockLimit)
              : stockFromVariants(product.variants),
          discountPct: discountPercent(basePrice, originalPrice),
        };
      }),
    [productsData],
  );

  const toggleWishlist = useCallback(
    async (product: (typeof products)[number]) => {
      if (!isAuthenticated) {
        router.push("/signin?callbackUrl=/");
        return;
      }

      if (isInWishlist(product.id)) {
        const response = await fetch(`/api/wishlist?productId=${product.id}`, {
          method: "DELETE",
        });
        if (response.ok) removeFromWishlist(product.id);
        return;
      }

      const response = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      if (response.ok) addToWishlist(product.id);
    },
    [addToWishlist, isAuthenticated, isInWishlist, removeFromWishlist, router],
  );

  const scroll = (direction: "left" | "right") => {
    scrollerRef.current?.scrollBy({
      left: direction === "left" ? -720 : 720,
      behavior: "smooth",
    });
  };

  if (products.length === 0) return null;

  return (
    <section className="px-3 py-8 sm:px-6 lg:py-12" aria-labelledby="flash-sale-title">
      <div className="overflow-hidden rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-background to-red-50 shadow-sm dark:border-orange-950 dark:from-orange-950/30 dark:to-red-950/20">
        <div className="flex flex-col gap-4 border-b border-orange-200 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-orange-950">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/20">
              <Flame className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 id="flash-sale-title" className="text-xl font-bold text-foreground sm:text-2xl">
                Flash Sale
              </h2>
              <p className="text-sm text-muted-foreground">
                Live discounts selected from the current catalog
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <span className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
              Limited stock
            </span>
            <button
              type="button"
              onClick={() => scroll("left")}
              className="rounded-full border bg-background p-2 text-foreground transition hover:border-orange-400 hover:text-orange-600"
              aria-label="Scroll flash sale products left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scroll("right")}
              className="rounded-full border bg-background p-2 text-foreground transition hover:border-orange-400 hover:text-orange-600"
              aria-label="Scroll flash sale products right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <Link
              href="/ecommerce/products"
              className="ml-1 text-sm font-semibold text-orange-700 hover:text-orange-800 dark:text-orange-300"
            >
              View all
            </Link>
          </div>
        </div>

        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 py-6 sm:gap-6 sm:px-6"
          style={{ scrollbarWidth: "none" }}
        >
          {products.map((product) => (
            <div
              key={String(product.id)}
              className="w-[210px] shrink-0 snap-start sm:w-[240px] lg:w-[260px]"
            >
              <ProductCardCompact
                product={{
                  id: product.id,
                  name: String(product.name),
                  href: `/ecommerce/products/${product.id}`,
                  image: product.image,
                  price: product.basePrice,
                  originalPrice: product.originalPrice,
                  stock: product.stock,
                  variants: product.variants.map((variant) => ({
                    ...variant,
                    options: normalizeVariantOptions(variant.options),
                  })),
                  type: product.type,
                  bundleStockLimit: product.bundleStockLimit ?? undefined,
                  bundleItems: product.bundleItems.map((item) => ({
                    quantity: item.quantity,
                    product: {
                      id: item.product.id,
                      name: item.product.name,
                      image: item.product.image ?? undefined,
                    },
                  })),
                  bundleItemCount: product.bundleItems?.length,
                  ratingAvg: toNumber(product.ratingAvg),
                  ratingCount: toNumber(product.ratingCount),
                  discountPct: product.discountPct,
                }}
                wishlisted={isInWishlist(product.id)}
                onWishlistClick={() => toggleWishlist(product)}
                onAddToCart={() => addToCart(product.id)}
                formatPrice={formatPrice}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
