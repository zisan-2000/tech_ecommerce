"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Heart, ShoppingCart, Star, Zap, BookOpen } from "lucide-react";
import { useCart } from "@/components/ecommarce/CartContext";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import { toast } from "sonner";

// Skeleton Loader Component
const BookCardSkeleton = () => (
  <div className="border-0 shadow-sm bg-gradient-to-br from-white to-[#F4F8F7] rounded-2xl overflow-hidden">
    {/* Skeleton Image */}
    <div className="relative h-72 w-full bg-gray-200 animate-pulse">
      <div className="absolute inset-0 bg-gradient-to-t from-gray-300/20 to-transparent"></div>
    </div>

    {/* Skeleton Content */}
    <div className="p-5">
      {/* Skeleton Rating */}
      <div className="flex items-center gap-1 mb-3">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <div
              key={star}
              className="h-3 w-3 bg-gray-200 rounded animate-pulse"
            />
          ))}
        </div>
        <div className="h-3 w-16 bg-gray-200 rounded animate-pulse ml-1" />
      </div>

      {/* Skeleton Title */}
      <div className="space-y-2 mb-3">
        <div className="h-6 bg-gray-200 rounded animate-pulse" />
        <div className="h-6 bg-gray-200 rounded w-3/4 animate-pulse" />
      </div>

      {/* Skeleton Author */}
      <div className="flex items-center mb-3">
        <div className="w-1 h-1 bg-gray-300 rounded-full mr-2"></div>
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Skeleton Price */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <div className="h-6 w-12 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="h-5 w-16 bg-gray-200 rounded-full animate-pulse" />
      </div>
    </div>

    {/* Skeleton Button */}
    <div className="p-5 pt-0">
      <div className="w-full h-12 bg-gray-200 rounded-xl animate-pulse" />
    </div>
  </div>
);

const CategoryHeaderSkeleton = () => (
  <div className="flex justify-between items-center mb-8">
    <div className="flex items-center gap-4">
      <div className="w-1 h-8 bg-gray-200 rounded-full animate-pulse"></div>
      <div>
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mb-2"></div>
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
      </div>
    </div>
    <div className="h-10 w-24 bg-gray-200 rounded-full animate-pulse"></div>
  </div>
);

interface Category {
  id: string | number;
  name: string;
}

interface Product {
  id: string | number;
  name: string;
  category: { id: string | number } | null;
  price: number;
  original_price: number | null;
  discount: number;
  writer: { id: string | number; name: string } | null;
  publisher: { id: string | number; name: string } | null;
  image: string;
  stock?: number;
  available?: boolean;
  deleted?: boolean;
}

interface RatingInfo {
  averageRating: number;
  totalReviews: number;
}

export default function CategoryBooks({
  category,
  allProducts,
  ratings,
  isAuthenticated = false,
}: {
  category: Category;
  allProducts?: Product[];
  ratings?: Record<string, RatingInfo>;
  isAuthenticated?: boolean;
}) {
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();

  // Use shared data if provided, otherwise fall back to local fetching
  const [localProducts, setLocalProducts] = useState<Product[]>([]);
  const [localRatings, setLocalRatings] = useState<Record<string, RatingInfo>>(
    {}
  );
  const [loadingProducts, setLoadingProducts] = useState(!allProducts);

  // ðŸ”¹ Use shared products or fetch locally if not provided
  const products = allProducts || localProducts;
  const reviewRatings = ratings || localRatings;

  // ðŸ”¹ Only fetch locally if shared data is not provided
  useEffect(() => {
    if (allProducts) {
      setLoadingProducts(false);
      return;
    }

    const fetchProducts = async () => {
      try {
        setLoadingProducts(true);

        const res = await fetch("/api/products?view=storefront", {
          cache: "force-cache",
          next: { revalidate: 300 }, // Cache for 5 minutes
        });
        if (!res.ok) {
          console.error(
            "Failed to fetch products for CategoryBooks:",
            res.statusText
          );
          setLocalProducts([]);
          return;
        }

        const data = await res.json();

        if (!Array.isArray(data)) {
          console.error("Invalid products response for CategoryBooks:", data);
          setLocalProducts([]);
          return;
        }

        const mapped = data.map((p: any) => ({
          id: Number(p.id),
          name: p.name,
          category: {
            id: Number(p.category?.id ?? 0),
            name: p.category?.name ?? "Uncategorized",
          },
          price: Number(p.price ?? 0),
          original_price: Number(p.original_price ?? p.price ?? 0),
          discount: Number(p.discount ?? 0),
          stock: Number(p.stock ?? 0),
          writer: {
            id: Number(p.writer?.id ?? 0),
            name: p.writer?.name ?? "à¦…à¦œà§à¦žà¦¾à¦¤ à¦²à§‡à¦–à¦•",
          },
          publisher: {
            id: Number(p.publisher?.id ?? 0),
            name: p.publisher?.name ?? "à¦…à¦œà§à¦žà¦¾à¦¤ à¦ªà§à¦°à¦•à¦¾à¦¶à¦•",
          },
          image: p.image ?? "/placeholder.svg",
        }));

        setLocalProducts(mapped);
      } catch (err) {
        console.error("Error fetching products for CategoryBooks:", err);
        setLocalProducts([]);
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchProducts();
  }, [allProducts]);

  // ðŸ”¹ Only fetch ratings locally if shared data is not provided
  useEffect(() => {
    if (ratings) {
      return;
    }

    const fetchRatings = async () => {
      try {
        const categoryBooks =
          category.id === "all"
            ? products
            : products.filter(
                (product: Product) =>
                  product.category &&
                  String(product.category.id) === String(category.id)
              );

        const displayBooks = categoryBooks.slice(0, 8);

        const ids = Array.from(
          new Set(
            displayBooks
              .map((b) => Number(b.id))
              .filter((id) => !!id && !Number.isNaN(id))
          )
        );

        if (ids.length === 0) {
          setLocalRatings({});
          return;
        }

        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              const res = await fetch(
                `/api/reviews?view=storefront&productId=${id}&page=1&limit=1`,
                { cache: "force-cache" }
              );

              if (!res.ok) {
                return { id, avg: 0, total: 0 };
              }

              const data = await res.json();
              return {
                id,
                avg: Number(data.averageRating ?? 0),
                total: Number(data.pagination?.total ?? 0),
              };
            } catch (err) {
              console.error("Error fetching rating for product:", id, err);
              return { id, avg: 0, total: 0 };
            }
          })
        );

        const map: Record<string, RatingInfo> = {};
        for (const r of results) {
          map[String(r.id)] = {
            averageRating: r.avg,
            totalReviews: r.total,
          };
        }
        setLocalRatings(map);
      } catch (error) {
        console.error(error);
      }
    };

    fetchRatings();
  }, [products, category.id, ratings]);

  // ðŸ”¹ Filter products based on category and ensure all required relations exist
  const categoryBooks = products.filter((product: Product) => {
    // Skip products that are marked as deleted or not available
    if (product.deleted || product.available === false) {
      return false;
    }

    // If we're not filtering by a specific category, just check for required relations
    if (category.id === "all") {
      return (
        product.category !== null &&
        product.writer !== null &&
        product.publisher !== null
      );
    }

    // If filtering by a specific category, check category match and required relations
    return (
      product.category !== null &&
      String(product.category.id) === String(category.id) &&
      product.writer !== null &&
      product.publisher !== null
    );
  });

  const displayBooks = categoryBooks.slice(0, 8);

  // ðŸ”¹ Wishlist toggle (with API) - à¦¶à§à¦§à§ wishlist-à¦ login required
  const toggleWishlist = async (product: Product) => {
    try {
      if (!isAuthenticated) {
        toast.error("à¦‰à¦‡à¦¶à¦²à¦¿à¦¸à§à¦Ÿ à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° à¦•à¦°à¦¤à§‡ à¦†à¦—à§‡ à¦²à¦—à¦‡à¦¨ à¦•à¦°à§à¦¨");
        return;
      }

      const numericId = Number(product.id);
      if (!numericId || Number.isNaN(numericId)) {
        console.error("Invalid product id for wishlist:", product.id);
        toast.error("à¦ªà¦£à§à¦¯à§‡à¦° à¦¤à¦¥à§à¦¯ à¦¸à¦ à¦¿à¦• à¦¨à¦¯à¦¼");
        return;
      }

      const alreadyInWishlist = isInWishlist(product.id);

      if (alreadyInWishlist) {
        // âœ… Remove from wishlist (DELETE)
        const res = await fetch(`/api/wishlist?productId=${numericId}`, {
          method: "DELETE",
        });

        if (res.status === 401) {
          toast.error("à¦‰à¦‡à¦¶à¦²à¦¿à¦¸à§à¦Ÿ à¦¥à§‡à¦•à§‡ à¦¸à¦°à¦¾à¦¤à§‡ à¦†à¦—à§‡ à¦²à¦—à¦‡à¦¨ à¦•à¦°à§à¦¨");
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          console.error("Remove from wishlist failed:", data || res.statusText);
          toast.error("à¦‰à¦‡à¦¶à¦²à¦¿à¦¸à§à¦Ÿ à¦¥à§‡à¦•à§‡ à¦¸à¦°à¦¾à¦¨à§‹ à¦¯à¦¾à¦¯à¦¼à¦¨à¦¿");
          return;
        }

        removeFromWishlist(product.id);
        toast.success("à¦‰à¦‡à¦¶à¦²à¦¿à¦¸à§à¦Ÿ à¦¥à§‡à¦•à§‡ à¦¸à¦°à¦¾à¦¨à§‹ à¦¹à¦¯à¦¼à§‡à¦›à§‡");
      } else {
        // âœ… Add to wishlist (POST)
        const res = await fetch("/api/wishlist", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ productId: numericId }),
        });

        if (res.status === 401) {
          toast.error("à¦‰à¦‡à¦¶à¦²à¦¿à¦¸à§à¦Ÿà§‡ à¦¯à§‹à¦— à¦•à¦°à¦¤à§‡ à¦†à¦—à§‡ à¦²à¦—à¦‡à¦¨ à¦•à¦°à§à¦¨");
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          console.error("Add to wishlist failed:", data || res.statusText);
          toast.error("à¦‰à¦‡à¦¶à¦²à¦¿à¦¸à§à¦Ÿà§‡ à¦¯à§‹à¦— à¦•à¦°à¦¾ à¦¯à¦¾à¦¯à¦¼à¦¨à¦¿");
          return;
        }

        addToWishlist(product.id);
        toast.success("à¦‰à¦‡à¦¶à¦²à¦¿à¦¸à§à¦Ÿà§‡ à¦¯à§‹à¦— à¦•à¦°à¦¾ à¦¹à¦¯à¦¼à§‡à¦›à§‡");
      }
    } catch (error) {
      console.error("Error toggling wishlist:", error);
      toast.error("à¦‰à¦‡à¦¶à¦²à¦¿à¦¸à§à¦Ÿ à¦¹à¦¾à¦²à¦¨à¦¾à¦—à¦¾à¦¦ à¦•à¦°à¦¤à§‡ à¦¸à¦®à¦¸à§à¦¯à¦¾ à¦¹à¦¯à¦¼à§‡à¦›à§‡");
    }
  };

  // ðŸ”¹ Cart-à¦ add à¦•à¦°à¦¤à§‡ login à¦à¦° requirement à¦¨à§‡à¦‡ - localStorage/cart context à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦°
  const handleAddToCart = (book: Product) => {
    try {
      addToCart(book.id);
      toast.success(`"${book.name}" à¦•à¦¾à¦°à§à¦Ÿà§‡ à¦¯à§‹à¦— à¦•à¦°à¦¾ à¦¹à¦¯à¦¼à§‡à¦›à§‡`);

      // Optional: logged-in à¦…à¦¬à¦¸à§à¦¥à¦¾à§Ÿ backend sync
      if (isAuthenticated) {
        fetch("/api/cart", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productId: Number(book.id),
            quantity: 1,
          }),
        }).catch((error) => {
          console.error("Failed to sync cart with backend:", error);
        });
      }
    } catch (error) {
      console.error("Error adding to cart:", error);
      toast.error("à¦•à¦¾à¦°à§à¦Ÿà§‡ à¦¯à§‹à¦— à¦•à¦°à¦¤à§‡ à¦¸à¦®à¦¸à§à¦¯à¦¾ à¦¹à¦¯à¦¼à§‡à¦›à§‡");
    }
  };

  // â›” à¦à¦‡ à¦•à§à¦¯à¦¾à¦Ÿà¦¾à¦—à¦°à¦¿à¦¤à§‡ à¦¯à¦¦à¦¿ à¦•à§‹à¦¨à§‹ à¦ªà§à¦°à§‹à¦¡à¦¾à¦•à§à¦Ÿ à¦¨à¦¾ à¦¥à¦¾à¦•à§‡, à¦¤à¦¾à¦¹à¦²à§‡ à¦•à¦¿à¦›à§à¦‡ à¦¦à§‡à¦–à¦¾à¦¬ à¦¨à¦¾
  if (!loadingProducts && categoryBooks.length === 0) {
    return null;
  }

  // Show skeleton loader when loading
  if (loadingProducts) {
    return (
      <div className="mb-16">
        {/* Skeleton Header */}
        <CategoryHeaderSkeleton />

        {/* Skeleton Books Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
            <BookCardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-16">
      {/* Enhanced Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <div className="w-1 h-8 bg-gradient-to-b from-[#0E4B4B] to-[#5FA3A3] rounded-full"></div>
          <div>
            <h3 className="text-3xl font-bold text-[#0D1414]">
              {category.name}
            </h3>
            <p className="text-[#5FA3A3] mt-1">
              {categoryBooks.length}à¦Ÿà¦¿ à¦¬à¦‡ à¦ªà¦¾à¦“à¦¯à¦¼à¦¾ à¦¯à¦¾à¦šà§à¦›à§‡
            </p>
          </div>
        </div>
        {categoryBooks.length > 8 && (
          <Link href={`/ecommerce/products?category=${category.id}`}>
            <Button
              variant="outline"
              className="rounded-full border-[#5FA3A3] text-[#5FA3A3] hover:bg-[#5FA3A3] hover:text-white transition-all duration-300 px-6 group"
            >
              à¦¸à¦¬ à¦¦à§‡à¦–à§à¦¨
              <Zap className="ml-2 h-4 w-4 group-hover:rotate-12 transition-transform" />
            </Button>
          </Link>
        )}
      </div>

      {/* Books Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {displayBooks.map((book: Product, index) => {
          const ratingInfo = reviewRatings[String(book.id)];
          const avgRating = ratingInfo?.averageRating ?? 0;
          const reviewCount = ratingInfo?.totalReviews ?? 0;

          const isBestseller = index % 3 === 0;
          const isNew = index % 4 === 0;
          const isWishlisted = isInWishlist(book.id);

          return (
            <Card
              key={book.id}
              className="group overflow-hidden border-0 shadow-sm hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-white to-[#F4F8F7] rounded-2xl relative"
            >
              {/* Badges */}
              <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
                {book.discount > 0 && (
                  <div className="bg-gradient-to-r from-[#C0704D] to-[#A85D3F] text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                    {book.discount}% à¦›à¦¾à¦¡à¦¼
                  </div>
                )}
                {isBestseller && (
                  <div className="bg-gradient-to-r from-[#C0704D] to-[#A85D3F] text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                    à¦¬à§‡à¦¸à§à¦Ÿà¦¸à§‡à¦²à¦¾à¦°
                  </div>
                )}
                {isNew && (
                  <div className="bg-gradient-to-r from-[#5FA3A3] to-[#0E4B4B] text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                    à¦¨à¦¤à§à¦¨
                  </div>
                )}
              </div>

              {/* Wishlist Button */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  void toggleWishlist(book);
                }}
                className={`absolute top-3 right-3 z-10 p-2 rounded-full backdrop-blur-sm transition-all duration-300 ${
                  isWishlisted
                    ? "bg-red-500/20 text-red-500"
                    : "bg-white/80 text-[#5FA3A3] hover:bg-red-500/20 hover:text-red-500"
                }`}
                aria-label={
                  isWishlisted ? "Remove from wishlist" : "Add to wishlist"
                }
              >
                <Heart
                  className={`h-5 w-5 transition-all ${
                    isWishlisted
                      ? "scale-110 fill-current"
                      : "group-hover:scale-110"
                  }`}
                />
              </button>

              {/* Book Image */}
              <Link href={`/ecommerce/books/${book.id}`}>
                <div className="relative w-full overflow-hidden bg-white p-4">
                  <div className="relative aspect-[3/4] w-full">
                    <Image
                      src={book.image || "/placeholder.svg"}
                      alt={book.name}
                      fill
                      className="object-contain transition-transform duration-700 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                    />
                  </div>
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {/* Quick View */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <div className="bg-white/90 backdrop-blur-sm rounded-full p-3 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                      <BookOpen className="h-6 w-6 text-[#0E4B4B]" />
                    </div>
                  </div>
                </div>
              </Link>
              
              <CardContent className="p-5">
                {/* Rating */}
                <div className="flex items-center gap-1 mb-3 min-h-[20px]">
                  {reviewCount > 0 ? (
                    <>
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-3 w-3 ${
                              star <= Math.round(avgRating)
                                ? "fill-[#C0704D] text-[#C0704D]"
                                : "text-gray-300"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-[#5FA3A3] ml-1">
                        ({avgRating.toFixed(1)} Â· {reviewCount} à¦°à¦¿à¦­à¦¿à¦‰)
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-[#5FA3A3]">
                      à¦à¦–à¦¨à¦“ à¦•à§‹à¦¨ à¦°à¦¿à¦­à¦¿à¦‰ à¦¨à§‡à¦‡
                    </span>
                  )}
                </div>

                {/* Book Title */}
                <Link href={`/ecommerce/books/${book.id}`}>
                  <h4 className="font-bold text-lg mb-2 text-[#0D1414] hover:text-[#0E4B4B] duration-300 line-clamp-2 leading-tight group-hover:translate-x-1 transition-transform">
                    {book.name}
                  </h4>
                </Link>

                {/* Author */}
                <p className="text-sm text-[#5FA3A3] mb-3 flex items-center">
                  <span className="w-1 h-1 bg-[#0E4B4B] rounded-full mr-2"></span>
                  {book.writer?.name || "Unknown Author"}
                </p>

                {/* Price */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-xl text-[#0E4B4B]">
                      à§³{book.price}
                    </span>
                    {book.discount > 0 && (
                      <span className="text-sm text-[#5FA3A3] line-through">
                        à§³{book.original_price}
                      </span>
                    )}
                  </div>
                  {book.stock === 0 ? (
                    <div className="text-xs font-semibold bg-rose-600 text-white px-2 py-1 rounded-full">
                      Stock Out
                    </div>
                  ) : (
                    book.discount > 0 && (
                      <div className="text-xs font-semibold bg-[#C0704D] text-white px-2 py-1 rounded-full">
                        à¦¸à¦¾à¦¶à§à¦°à¦¯à¦¼ à¦•à¦°à§à¦¨
                      </div>
                    )
                  )}
                </div>
              </CardContent>

              <CardFooter className="p-5 pt-0">
                <Button
                  disabled={book.stock === 0}
                  className={`w-full rounded-xl py-6 text-white font-semibold border-0 shadow-md transition-all duration-300
              =${
                book.stock === 0
                  ? "bg-gray-400 cursor-not-allowed opacity-60"
                  : "bg-gradient-to-r from-[#C0704D] to-[#A85D3F] hover:from-[#0E4B4B] hover:to-[#5FA3A3] hover:shadow-lg hover:scale-105 group/btn"
              }`}
                  onClick={(e) => {
                    e.preventDefault();
                    if (book.stock !== 0) {
                      handleAddToCart(book);
                    }
                  }}
                >
                  <ShoppingCart className="mr-2 h-4 w-4 group-hover/btn:scale-110 transition-transform" />
                  {book.stock === 0 ? "à¦¸à§à¦Ÿà¦• à¦¶à§‡à¦·" : "à¦•à¦¾à¦°à§à¦Ÿà§‡ à¦¯à§‹à¦— à¦•à¦°à§à¦¨"}
                </Button>
              </CardFooter>

              {/* Hover Effect Border */}
              <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-[#0E4B4B]/20 transition-all duration-500 pointer-events-none"></div>
            </Card>
          );
        })}
      </div>

      {/* View All Bottom CTA */}
      {categoryBooks.length > 8 && (
        <div className="text-center mt-10">
          <Link href={`/ecommerce/products?category=${category.id}`}>
            <Button
              variant="ghost"
              className="rounded-full bg-[#F4F8F7] hover:bg-[#C0704D] text-[#0D1414] hover:text-white transition-all duration-300 px-8 py-6 group"
            >
              <span className="mr-2">
                {categoryBooks.length - 8}+ à¦†à¦°à¦“ à¦¬à¦‡ à¦¦à§‡à¦–à§à¦¨
              </span>
              <Zap className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}


