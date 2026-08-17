"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import ProductCard from "@/components/ecommarce/ProductCard";
import { useCart } from "@/components/ecommarce/CartContext";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import { useSession } from "@/lib/auth-client";
import type { StorefrontCatalogProduct } from "@/lib/storefront-catalog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const formatBDT = (value: number) =>
  `৳${Math.round(value).toLocaleString("en-US")}`;

export default function CatalogProductGrid({
  products,
}: {
  products: StorefrontCatalogProduct[];
}) {
  const { status } = useSession();
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const toggleWishlist = useCallback(
    async (product: StorefrontCatalogProduct) => {
      if (status !== "authenticated") {
        setLoginModalOpen(true);
        return;
      }

      try {
        const wishlisted = isInWishlist(product.id);
        const response = await fetch(
          wishlisted ? `/api/wishlist?productId=${product.id}` : "/api/wishlist",
          wishlisted
            ? { method: "DELETE" }
            : {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId: product.id }),
              },
        );
        if (!response.ok) throw new Error("Wishlist update failed");

        if (wishlisted) {
          removeFromWishlist(product.id);
          toast.success("Removed from wishlist.");
        } else {
          addToWishlist(product.id);
          toast.success("Added to wishlist.");
        }
      } catch (error) {
        console.error(error);
        toast.error("Wishlist update failed.");
      }
    },
    [addToWishlist, isInWishlist, removeFromWishlist, status],
  );

  const addProductToCart = useCallback(
    (product: StorefrontCatalogProduct) => {
      if (product.stock <= 0) {
        toast.error("This product is out of stock.");
        return;
      }
      addToCart(product.id);
      toast.success(`“${product.name}” added to cart.`);
    },
    [addToCart],
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={{
              id: product.id,
              name: product.name,
              href: `/ecommerce/products/${product.id}`,
              image: product.image,
              price: product.price,
              originalPrice: product.originalPrice,
              stock: product.stock,
              ratingAvg: product.ratingAvg,
              ratingCount: product.ratingCount,
              discountPct: product.discountPct,
              type: product.type,
              variants: product.variants,
              available: product.available,
              totalSold: product.soldCount,
              bundleStockLimit: product.bundleStockLimit ?? undefined,
              bundleItems: product.bundleItems,
              bundleItemCount: product.bundleItems.length,
            }}
            wishlisted={isInWishlist(product.id)}
            onWishlistClick={() => toggleWishlist(product)}
            onAddToCart={() => addProductToCart(product)}
            formatPrice={formatBDT}
          />
        ))}
      </div>

      <Dialog open={loginModalOpen} onOpenChange={setLoginModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in to save products</DialogTitle>
            <DialogDescription>
              Your wishlist stays synced when you are signed in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setLoginModalOpen(false)}
              className="h-10 rounded-lg border px-4 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <Link
              href="/signin?callbackUrl=/ecommerce/products"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Sign in
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
