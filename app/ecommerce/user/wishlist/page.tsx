"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import AccountMenu from "../AccountMenu";
import AccountHeader from "../AccountHeader";
import { Home, Heart } from "lucide-react";
import { useCart } from "@/components/ecommarce/CartContext";
import ProductCard from "@/components/ecommarce/ProductCard";
import { toast } from "sonner";

type ApiWishlistItem = {
  id: number;
  userId: string;
  productId: number;
  product: {
    id: number;
    name: string;
    slug?: string | null;
    basePrice?: string | number | null;
    originalPrice?: string | number | null;
    image?: string | null;
    discount?: number | null; // maybe not present
  };
};

type WishlistProduct = {
  id: number;
  name: string;
  slug?: string | null;
  price: number;
  originalPrice: number;
  discount: number;
  image: string;
};

const toNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export default function WishlistPage() {
  const { addToCart } = useCart();

  const [items, setItems] = useState<WishlistProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // 🔹 Load wishlist from /api/route/wishlist
  useEffect(() => {
    const fetchWishlist = async () => {
      try {
        setLoading(true);

        const res = await fetch("/api/wishlist", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
          toast.error("Please login to view your wishlist.", { duration: 3500 });
          setItems([]);
          return;
        }

        if (!res.ok) {
          toast.error(data?.error || "Failed to load wishlist.", { duration: 3500 });
          setItems([]);
          return;
        }

        const mapped: WishlistProduct[] = Array.isArray(data?.items)
          ? (data.items as ApiWishlistItem[]).map((w) => {
              const p = w.product;

              const price = toNumber(p?.basePrice);
              const original = toNumber(p?.originalPrice || p?.basePrice);

              const discount =
                typeof p?.discount === "number"
                  ? p.discount
                  : original > 0 && price > 0 && original > price
                  ? Math.round(((original - price) / original) * 100)
                  : 0;

              return {
                id: p.id,
                name: p.name,
                slug: p.slug ?? null,
                price,
                originalPrice: original,
                discount,
                image: p.image || "/placeholder.svg",
              };
            })
          : [];

        setItems(mapped);
      } catch (err) {
        console.error("Error fetching wishlist:", err);
        toast.error("Failed to load wishlist.", { duration: 3500 });
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchWishlist();
  }, []);

  // 🔹 Remove from wishlist
  const handleRemoveItem = async (productId: number) => {
    try {
      const res = await fetch(`/api/wishlist?productId=${productId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data?.error || "Failed to remove item.", { duration: 3500 });
        return;
      }

      setItems((prev) => prev.filter((p) => p.id !== productId));
      toast.success("Removed from wishlist.", { duration: 2500 });
    } catch (err) {
      console.error("Error removing wishlist item:", err);
      toast.error("Failed to remove item.", { duration: 3500 });
    }
  };

  // 🔹 Add to cart
  const handleAddToCart = (product: WishlistProduct) => {
    addToCart(product.id);
    toast.success(`Added "${product.name}" to cart.`, { duration: 2500 });
  };

  const empty = useMemo(() => !loading && items.length === 0, [loading, items.length]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Breadcrumb */}
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
            <Home className="h-4 w-4" />
            <span>Home</span>
          </Link>
          <span>›</span>
          <Link href="/ecommerce/user" className="hover:text-foreground transition-colors">
            Account
          </Link>
          <span>›</span>
          <span className="text-foreground">My Wish List</span>
        </div>
      </div>

      {/* Shared header + menu */}
      <AccountHeader />
      <AccountMenu />

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-6">
          <Heart className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-2xl font-medium">My Wish List</h2>
        </div>

        {loading ? (
          <Card className="p-6 bg-card text-card-foreground border border-border rounded-2xl">
            <p className="text-sm text-muted-foreground">Loading wishlist...</p>
          </Card>
        ) : empty ? (
          <Card className="p-8 bg-card text-card-foreground border border-border rounded-2xl text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full border border-border bg-muted flex items-center justify-center">
              <Heart className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Your wishlist is empty</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Start adding items you like and they’ll appear here.
            </p>
            <Link href="/">
              <Button className="rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                Continue Shopping
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {items.map((item) => (
              <ProductCard
                key={item.id}
                product={{
                  id: item.id,
                  name: item.name,
                  href: `/ecommerce/products/${item.id}`,
                  image: item.image,
                  price: item.price,
                  originalPrice: item.originalPrice,
                  discountPct: item.discount,
                }}
                wishlistMode="remove"
                onWishlistClick={() => handleRemoveItem(item.id)}
                onAddToCart={() => handleAddToCart(item)}
                showMeta={false}
                formatPrice={(v) => `৳${v.toFixed(2)}`}
                addToCartLabel="Add to Cart"
                className="rounded-2xl"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

