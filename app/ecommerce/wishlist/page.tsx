// app/ecommerce/user/wishlist/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, ShoppingCart, Heart, ArrowLeft } from "lucide-react";
import { useCart } from "@/components/ecommarce/CartContext";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import { toast } from "sonner";

interface WishlistApiItem {
  id: number; // wishlist row id
  productId: number;
  product: {
    id: number;
    name: string;
    slug?: string | null;
    image?: string | null;

    // ✅ your real API fields
    basePrice?: number | string | null;
    originalPrice?: number | string | null;
    currency?: string | null;

    // optional / future-proof
    price?: number | string | null;
    original_price?: number | string | null;
    discount?: number | null;

    // optional specs
    type?: string | null;
    sku?: string | null;
    available?: boolean | null;
    stock?: number | string | null;
  };
}

interface WishlistProduct {
  wishlistId: number;
  productId: number;
  name: string;
  price: number;
  originalPrice: number;
  discount: number;
  image: string;
  type: string | null;
  available: boolean;
  stock: number;
  isPurchasable: boolean;
  specs: Array<{ label: string; value: string }>;
}

const toNumber = (v: unknown, fallback = 0) => {
  if (v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const money = (v: number) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  })
    .format(v)
    .replace("BDT", "৳")
    .trim();

// ✅ Skeleton Card (UI same vibe, just placeholder)
function WishlistCardSkeleton() {
  return (
    <Card className="card-theme overflow-hidden rounded-2xl shadow-sm">
      <div className="relative bg-white dark:bg-card">
        <div className="relative h-56 w-full animate-pulse">
          <div className="absolute inset-0 p-6">
            <div className="h-full w-full rounded-xl bg-muted" />
          </div>
        </div>

        <div className="absolute left-2 top-2">
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground animate-pulse">
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          </span>
        </div>

        <div className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/90 border border-border">
          <div className="h-4 w-4 rounded bg-muted animate-pulse" />
        </div>
      </div>

      <CardContent className="p-4">
        <div className="space-y-2 animate-pulse">
          <div className="h-4 w-4/5 rounded bg-muted" />
          <div className="h-4 w-3/5 rounded bg-muted" />
        </div>

        <ul className="mt-3 space-y-2 text-xs">
          <li className="flex gap-2 animate-pulse">
            <span className="mt-[7px] h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span className="h-3 w-4/5 rounded bg-muted" />
          </li>
          <li className="flex gap-2 animate-pulse">
            <span className="mt-[7px] h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span className="h-3 w-3/5 rounded bg-muted" />
          </li>
        </ul>

        <div className="my-4 h-px bg-border" />

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 space-y-2 animate-pulse">
            <div className="h-5 w-24 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted" />
          </div>

          <div className="h-10 w-28 rounded-xl bg-muted animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function WishlistPage() {
  const { addToCart } = useCart();
  const { removeFromWishlist } = useWishlist();

  const [wishlistProducts, setWishlistProducts] = useState<WishlistProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // 1) session check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/session", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (!res.ok) {
          setIsAuthenticated(false);
          return;
        }

        const data = await res.json().catch(() => null);
        setIsAuthenticated(Boolean(data?.user));
      } catch (err) {
        console.error("Error checking auth session:", err);
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, []);

  // 2) load wishlist
  useEffect(() => {
    if (isAuthenticated === null) return;

    if (!isAuthenticated) {
      setLoading(false);
      setError("Please login to view your wishlist.");
      setWishlistProducts([]);
      return;
    }

    const fetchWishlist = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/wishlist", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (res.status === 401) {
          setError("Please login to view your wishlist.");
          setWishlistProducts([]);
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          console.error("Failed to fetch wishlist:", data || res.statusText);
          setError("Failed to load wishlist.");
          setWishlistProducts([]);
          return;
        }

        const data = await res.json();
        const itemsRaw = Array.isArray(data.items) ? (data.items as WishlistApiItem[]) : [];

        const mapped: WishlistProduct[] = itemsRaw.map((w) => {
          // ✅ FIX: use basePrice + originalPrice from your API
          const price = toNumber(w.product?.basePrice, NaN) ?? toNumber(w.product?.price, NaN);

          const finalPrice = Number.isFinite(price) ? price : toNumber(w.product?.price, 0);

          const original = toNumber(w.product?.originalPrice, NaN) ?? toNumber(w.product?.original_price, NaN);

          const finalOriginal = Number.isFinite(original) ? original : Number.isFinite(finalPrice) ? finalPrice : 0;

          // discount: if API sends it, use it; else compute from original/base
          const apiDiscount = toNumber(w.product?.discount, NaN);
          const computedDiscount =
            finalOriginal > 0 && finalOriginal > finalPrice
              ? Math.round(((finalOriginal - finalPrice) / finalOriginal) * 100)
              : 0;

          const discount = Number.isFinite(apiDiscount) ? apiDiscount : computedDiscount;
          const type = w.product?.type ? String(w.product.type) : null;
          const stock = toNumber(w.product?.stock, 0);
          const available = w.product?.available !== false;
          const isStockTracked = !type || type === "PHYSICAL" || type === "BUNDLE";
          const isPurchasable = available && (!isStockTracked || stock > 0);

          const specs: Array<{ label: string; value: string }> = [];
          if (w.product?.sku) specs.push({ label: "SKU", value: String(w.product.sku) });
          if (type) specs.push({ label: "Type", value: type });
          specs.push({
            label: "Availability",
            value: isPurchasable ? "In stock" : "Out of stock",
          });

          return {
            wishlistId: w.id,
            productId: w.product?.id ?? w.productId,
            name: w.product?.name ?? "Untitled Product",
            price: toNumber(finalPrice, 0),
            originalPrice: toNumber(finalOriginal, toNumber(finalPrice, 0)),
            discount: toNumber(discount, 0),
            image: w.product?.image ?? "/placeholder.svg",
            type,
            available,
            stock,
            isPurchasable,
            specs: specs.slice(0, 6),
          };
        });

        setWishlistProducts(mapped);
      } catch (err) {
        console.error("Error fetching wishlist:", err);
        setError("Failed to load wishlist.");
        setWishlistProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchWishlist();
  }, [isAuthenticated]);

  const handleRemoveItem = async (productId: number) => {
    if (!isAuthenticated) {
      toast.info("Please login to manage your wishlist.");
      return;
    }

    try {
      const res = await fetch(`/api/wishlist?productId=${productId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("Failed to remove wishlist item:", data || res.statusText);
        toast.error("Failed to remove item from wishlist.");
        return;
      }

      setWishlistProducts((prev) => prev.filter((p) => p.productId !== productId));
      removeFromWishlist(productId);
      toast.success("Removed from wishlist.");
    } catch (err) {
      console.error("Error removing wishlist item:", err);
      toast.error("Failed to remove item from wishlist.");
    }
  };

  const handleAddToCart = async (product: WishlistProduct) => {
    if (!isAuthenticated) {
      toast.info("Please login to add items to cart.");
      return;
    }
    if (!product.isPurchasable) {
      toast.error("This product is out of stock.");
      return;
    }

    const added = await addToCart(product.productId);
    if (added) toast.success(`Added to cart: ${product.name}`);
    else toast.error("This product could not be added to cart.");
  };

  const title = useMemo(() => `Wishlist (${wishlistProducts.length})`, [wishlistProducts.length]);

  if (isAuthenticated === null) {
  return (
    <div className="min-h-screen bg-background text-foreground py-8 md:py-10">
      <div className="container mx-auto px-4">
        {/* Top bar */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="h-5 w-40 rounded bg-muted animate-pulse" />
          <div className="hidden sm:block h-5 w-28 rounded bg-muted animate-pulse" />
        </div>

        {/* Header skeleton */}
        <div className="mb-8">
          <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl bg-muted border border-border animate-pulse" />
              <div className="min-w-0 flex-1">
                <div className="h-7 w-56 rounded bg-muted animate-pulse" />
                <div className="mt-3 h-4 w-96 max-w-full rounded bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <WishlistCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

  return (
    <div className="min-h-screen bg-background text-foreground py-8 md:py-10">
      <div className="container mx-auto px-4">
        {/* Top bar */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Continue shopping
          </Link>

          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Saved products
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl bg-muted border border-border flex items-center justify-center">
                <Heart className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manage your saved items and quickly move them to your cart.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* States */}
        {loading ? (
          <>
            {/* ✅ Skeleton grid loader */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <WishlistCardSkeleton key={i} />
              ))}
            </div>
          </>
        ) : error ? (
          <div className="text-center py-14 rounded-2xl border border-border bg-card">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <div className="flex justify-center gap-3">
              <Link href="/signin">
                <Button className="btn-primary rounded-xl px-6">Login</Button>
              </Link>
              <Link href="/">
                <Button variant="outline" className="rounded-xl px-6">
                  Back to home
                </Button>
              </Link>
            </div>
          </div>
        ) : wishlistProducts.length === 0 ? (
          <div className="text-center py-14 rounded-2xl border border-border bg-card">
            <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
              <Heart className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold mb-3">Your wishlist is empty</h2>
            <p className="text-muted-foreground mb-6">Save products to your wishlist so you can find them later.</p>
            <Link href="/">
              <Button className="btn-primary rounded-xl px-8">Continue shopping</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {wishlistProducts.map((item) => {
                const hasDiscount = item.originalPrice > item.price;

                return (
                  <Card
                    key={item.wishlistId}
                    className="card-theme overflow-hidden rounded-2xl shadow-sm hover:shadow-lg transition"
                  >
                    <div className="relative bg-white dark:bg-card">
                      <Link href={`/ecommerce/products/${item.productId}`}>
                        <div className="relative h-56 w-full">
                          <Image
                            src={item.image || "/placeholder.svg"}
                            alt={item.name}
                            fill
                            className="object-contain p-6 transition-transform duration-300 hover:scale-[1.02]"
                          />
                        </div>
                      </Link>

                      {item.discount > 0 && (
                        <div className="absolute left-2 top-2">
                          <span className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-2.5 py-1 text-xs font-semibold">
                            Save {item.discount}%
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.productId)}
                        className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/90 border border-border hover:bg-muted transition"
                        aria-label="Remove from wishlist"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <CardContent className="p-4">
                      <Link href={`/ecommerce/products/${item.productId}`}>
                        <h3 className="font-semibold text-base leading-snug line-clamp-2 hover:underline">
                          {item.name}
                        </h3>
                      </Link>

                      {item.specs.length > 0 && (
                        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                          {item.specs.map((s) => (
                            <li key={s.label} className="flex gap-2">
                              <span className="mt-[7px] h-1 w-1 rounded-full bg-muted-foreground/60" />
                              <span className="min-w-0">
                                <span className="font-medium text-foreground/80">{s.label}:</span> {s.value}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="my-4 h-px bg-border" />

                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-lg font-bold text-destructive">{money(item.price)}</div>
                          {hasDiscount && (
                            <div className="text-xs text-muted-foreground line-through">
                              {money(item.originalPrice)}
                            </div>
                          )}
                        </div>

                        {item.isPurchasable ? (
                          <Button onClick={() => void handleAddToCart(item)} className="btn-primary rounded-xl h-10 px-4">
                            <ShoppingCart className="h-4 w-4 mr-2" />
                            Add to Cart
                          </Button>
                        ) : (
                          <Button disabled variant="outline" className="rounded-xl h-10 px-4">
                            Out of Stock
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
