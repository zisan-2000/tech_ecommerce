"use client";

import Link from "next/link";
import ProductCard from "./ProductCard";
import { Product } from "@/types/product";

type RelatedProductsProps = {
  products: Product[];
  currentProductId: number | string;
  categoryId?: number | null;
};

function moneyBDT(n: number) {
  return `${Math.round(n).toLocaleString("en-US")}৳`;
}

function isDiscounted(p: Product) {
  return !!p.originalPrice && p.originalPrice > p.basePrice;
}

function calculateDiscount(p: Product) {
  if (!p.originalPrice || p.originalPrice <= p.basePrice) return 0;
  const diff = p.originalPrice - p.basePrice;
  return Math.round((diff / p.originalPrice) * 100);
}

function calculateStock(p: Product): number {
  const variants = Array.isArray(p.variants) ? p.variants : [];
  if (variants.length) {
    return variants.reduce((sum, v) => {
      const s = typeof v?.stock === "number" ? v.stock : Number(v?.stock);
      return sum + (Number.isFinite(s) ? s : 0);
    }, 0);
  }
  return p.available ? 10 : 0;
}

export default function RelatedProducts({
  products,
  currentProductId,
  categoryId,
}: RelatedProductsProps) {
  if (products.length === 0) return null;

  const formatPrice = (value: number) => moneyBDT(value);

  const handleAddToCart = (product: Product) => {
    // This would typically integrate with your cart context
    console.log("Add to cart:", product.name);
  };

  const handleWishlist = (product: Product) => {
    // This would typically integrate with your wishlist context
    console.log("Toggle wishlist:", product.name);
  };

  const isInWishlist = (productId: number | string) => {
    // This would typically check your wishlist state
    return false;
  };

  return (
    <div className="card-theme rounded-xl overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-border flex flex-col md:flex-row md:justify-between">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Related Products
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Discover similar products in same category
            </p>
          </div>
        </div>

        {/* View Category Button */}
        <div className="mt-8 flex">
          <Link
            href={`/ecommerce/products?category=${categoryId}`}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-muted"
          >
            View Category
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* Mobile: Single column scrollable */}
        <div className="lg:hidden">
          <div className="space-y-4">
            {products.slice(0, 5).map((product) => (
              <Link
                key={product.id}
                href={`/ecommerce/products/${product.id}`}
                className="flex gap-4 rounded-xl border border-border p-4 hover:bg-accent transition"
              >
                <div className="relative h-20 w-20 rounded-lg overflow-hidden bg-card border border-border shrink-0">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="object-contain p-2 w-full h-full"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                      No Image
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground line-clamp-2 mb-2">
                    {product.name}
                  </div>

                  <div className="flex items-end gap-2 mb-2">
                    <div className="text-lg font-bold text-primary">
                      {moneyBDT(product.basePrice ?? 0)}
                    </div>
                    {isDiscounted(product) && (
                      <div className="text-sm text-muted-foreground line-through">
                        {moneyBDT(product.originalPrice!)}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {product.featured && (
                      <span className="px-2 py-1 text-[10px] font-medium rounded bg-primary/10 text-primary">
                        Featured
                      </span>
                    )}
                    {product.category?.name && (
                      <span className="px-2 py-1 text-[10px] font-medium rounded bg-muted text-muted-foreground">
                        {product.category.name}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Desktop: Grid layout using ProductCard */}
        <div className="hidden lg:grid md:grid-cols-4 lg:grid-cols-5 gap-6">
          {products.slice(0, 5).map((product) => (
            <ProductCard
              key={product.id}
              product={{
                id: product.id,
                name: product.name,
                href: `/ecommerce/products/${product.id}`,
                image: product.image,
                price: product.basePrice,
                originalPrice: product.originalPrice,
                discountPct: calculateDiscount(product),
                sku: product.sku || undefined,
                type: product.category?.name || undefined,
                shortDesc: product.shortDesc || undefined,
                specifications: product.attributes?.slice(0, 4).map((item) => ({
                  label: item.attribute.name,
                  value: item.value,
                })),
                stock: calculateStock(product),
                available: calculateStock(product) > 0,
                ratingAvg: product.ratingAvg,
                ratingCount: product.ratingCount,
              }}
              wishlisted={isInWishlist(product.id)}
              onWishlistClick={() => handleWishlist(product)}
              onAddToCart={() => handleAddToCart(product)}
              formatPrice={formatPrice}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
