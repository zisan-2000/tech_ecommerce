"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { cachedFetchJson } from "@/lib/client-cache-fetch";
import { useCart } from "@/components/ecommarce/CartContext";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import { useSession } from "@/lib/auth-client";
import ProductCardCompact from "@/components/ecommarce/ProductCard";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  brand: {
    id: number;
    name: string;
    slug: string;
  } | null;
  category: {
    id: number;
    name: string;
    slug: string;
  } | null;
  variants?: Array<{
    stock?: number | string | null;
    price?: number | string | null;
    options?: Record<string, string | number | null | undefined> | null;
    colorImage?: string | null;
  }>;
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
  ratingAvg?: number;
  ratingCount?: number;
};

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
  return `${Math.round(n).toLocaleString("en-US")}  `;
}

function calcDiscountPercent(base: number, original: number | null) {
  if (!original || original <= base) return null;
  const p = Math.round(((original - base) / original) * 100);
  return p > 0 ? p : null;
}

export default function BrandPage() {
  const params = useParams();
  const brandSlug = params.slug as string;
  
  const [brand, setBrand] = useState<Brand | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();

  const toggleWishlist = useCallback(
    async (p: Product) => {
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
    (p: Product) => {
      try {
        addToCart(p.id);
      } catch (err) {
        console.error(err);
      }
    },
    [addToCart],
  );

  useEffect(() => {
    let mounted = true;

    const loadBrandAndProducts = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load brand info
        const brandData = await cachedFetchJson<Brand[]>(`/api/brands?view=storefront`, {
          ttlMs: 5 * 60 * 1000,
        });
        
        const foundBrand = Array.isArray(brandData) 
          ? brandData.find(b => b.slug === brandSlug)
          : null;

        if (!foundBrand) {
          setError("Brand not found");
          return;
        }

        // Load products for this brand
        const productsData = await cachedFetchJson<Product[]>(`/api/products?brandSlug=${brandSlug}&view=storefront`, {
          ttlMs: 2 * 60 * 1000,
        });

        if (!mounted) return;

        setBrand(foundBrand);
        setProducts(Array.isArray(productsData) ? productsData : []);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Failed to load brand data");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadBrandAndProducts();
    return () => {
      mounted = false;
    };
  }, [brandSlug]);

  const mappedProducts = useMemo(() => {
    return products.map((p) => {
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

      return {
        ...p,
        stock,
      };
    });
  }, [products]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 w-48 rounded bg-muted mb-4" />
          <div className="h-4 w-64 rounded bg-muted mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card shadow-sm">
                <div className="h-[160px] bg-muted animate-pulse" />
                <div className="p-4">
                  <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                  <div className="mt-3 h-4 rounded bg-muted animate-pulse" />
                  <div className="mt-3 h-4 w-2/3 rounded bg-muted animate-pulse" />
                  <div className="mt-5 h-8 rounded bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !brand) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Brand Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The brand you're looking for doesn't exist or has been removed.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Brand Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row items-center gap-6 mb-6">
          {brand.logo && (
            <div className="flex-shrink-0">
              <Image
                src={brand.logo}
                alt={brand.name}
                width={120}
                height={120}
                className="h-20 w-20 object-contain"
              />
            </div>
          )}
          <div className="text-center sm:text-left">
            <h1 className="text-3xl font-bold text-foreground mb-2">{brand.name}</h1>
            <p className="text-muted-foreground">
              {brand.productCount} products available
            </p>
          </div>
        </div>
        
        <div className="h-px w-full bg-border" />
      </div>

      {/* Products Grid */}
      {mappedProducts.length === 0 ? (
        <div className="text-center py-12">
          <h3 className="text-xl font-semibold text-foreground mb-2">No Products Found</h3>
          <p className="text-muted-foreground mb-6">
            This brand doesn't have any products yet.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            Browse Other Brands
          </Link>
        </div>
      ) : (
       <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {mappedProducts.map((p) => {
            const discountPct = calcDiscountPercent(p.basePrice, p.originalPrice);
            const isWishlisted = isInWishlist(p.id);

            return (
              <ProductCardCompact
                key={p.id}
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
                  ratingAvg: p.ratingAvg,
                  ratingCount: p.ratingCount,
                  discountPct: discountPct ?? undefined,
                }}
                wishlisted={isWishlisted}
                onWishlistClick={() => toggleWishlist(p)}
                onAddToCart={() => handleAddToCart(p)}
                formatPrice={formatBDT}
              />
            );
          })}
        </div>
      )}

      {/* Login Modal */}
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
    </div>
  );
}
