"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Heart,
  ShoppingCart,
  BookOpen,
  ArrowLeft,
  Star,
  User,
  PenTool,
} from "lucide-react";
import { useCart } from "@/components/ecommarce/CartContext";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import { toast } from "sonner";

type Writer = {
  id: number;
  name: string;
  image: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    products: number;
  };
};

type Book = {
  id: number;
  name: string;
  image: string | null;
  price: number;
  original_price: number;
  discount: number;
  stock: number;
  writer: {
    id: number;
    name: string;
  };
};

interface RatingInfo {
  averageRating: number;
  totalReviews: number;
}

export default function AuthorBooksPage() {
  const rawId = useParams().id;
  const authorId = parseInt(
    Array.isArray(rawId) ? rawId[0] : (rawId ?? "0"),
    10
  );

  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();

  const [author, setAuthor] = useState<Writer | null>(null);
  const [authorBooks, setAuthorBooks] = useState<Book[]>([]);
  const [ratings, setRatings] = useState<Record<string, RatingInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  // ✅ writer + তার books + rating load (OPTIMIZED)
  useEffect(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;
    isMounted.current = true;

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (isMounted.current && loading) {
        console.error('Request timeout - taking too long to fetch author data');
        setError("লোড হতে অনেক সময় লাগছে। দয়া করে পুনরায় চেষ্টা করুন।");
        setLoading(false);
      }
    }, 10000); // 10 seconds timeout

    // Memoized fetch function
    const fetchAuthorData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) writer info
        const resWriter = await fetch(`/api/writers/${authorId}?view=storefront`, {
          cache: "force-cache",
          next: { revalidate: 300 }, // Cache for 5 minutes
          signal,
        });
        if (!resWriter.ok) {
          if (resWriter.status === 404) {
            setAuthor(null);
            setAuthorBooks([]);
            setError("লেখক পাওয়া যায়নি");
            return;
          }
          throw new Error("Failed to fetch writer");
        }

        const writerData: Writer = await resWriter.json();
        setAuthor(writerData);

        // 2) সব product -> filter by writer (with caching)
        const resProducts = await fetch("/api/products?view=storefront", {
          cache: "force-cache",
          next: { revalidate: 300 }, // Cache for 5 minutes
          signal,
        });
        if (resProducts.ok) {
          const allProducts: Book[] = await resProducts.json();
          const booksOfAuthor = allProducts.filter(
            (book) => Number(book.writer.id) === writerData.id
          );
          setAuthorBooks(booksOfAuthor);

          // 3) OPTIMIZED: Load ratings using batch API
          const bookIds = Array.from(
            new Set(
              booksOfAuthor
                .map((b) => Number(b.id))
                .filter((id) => !!id && !Number.isNaN(id))
            )
          );

          if (bookIds.length > 0) {
            try {
              const batchRes = await fetch("/api/reviews/batch", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ productIds: bookIds }),
                cache: "no-store",
                signal,
              });

              if (batchRes.ok) {
                const batchData = await batchRes.json();
                if (batchData.success) {
                  setRatings(batchData.data);
                } else {
                  setRatings({});
                }
              } else {
                setRatings({});
              }
            } catch (err: any) {
              if (!isMounted.current || err.name === 'AbortError') return;
              console.error("Error fetching batch ratings:", err);
              setRatings({});
            }
          } else {
            setRatings({});
          }
        } else {
          // products না পেলেও writer show করব
          console.error("Failed to fetch products");
        }
      } catch (err: any) {
        if (!isMounted.current || err.name === 'AbortError') return;
        console.error(err);
        setError("ডাটা লোড করতে সমস্যা হচ্ছে");
      } finally {
        clearTimeout(timeoutId);
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };

    if (!Number.isNaN(authorId)) {
      fetchAuthorData();
    } else {
      setLoading(false);
      setError("ভুল লেখক আইডি");
    }

    return () => {
      isMounted.current = false;
      abortController.abort();
      clearTimeout(timeoutId);
    };
  }, [authorId, loading]);

  // Memoized toggle wishlist function
  const toggleWishlist = useCallback((bookId: number) => {
    if (isInWishlist(bookId)) {
      removeFromWishlist(bookId);
      toast.success("উইশলিস্ট থেকে সরানো হয়েছে");
    } else {
      addToWishlist(bookId);
      toast.success("উইশলিস্টে যোগ করা হয়েছে");
    }
  }, [isInWishlist, removeFromWishlist, addToWishlist]);

  // Memoized add to cart function
  const handleAddToCart = useCallback(async (book: Book) => {
    try {
      // ১) server-side cart এ যোগ করার চেষ্টা (login থাকলে OK)
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: book.id,
          quantity: 1,
        }),
      });

      // 401 মানে user লগইন না, তখন error দেখাবো না, শুধু লোকাল cart এ রাখব
      if (!res.ok && res.status !== 401) {
        const data = await res.json().catch(() => null);
        const message = data?.error || "কার্টে যোগ করতে সমস্যা হয়েছে";
        throw new Error(message);
      }

      // ২) সবসময় local cart context update (login থাকুক/না থাকুক)
      addToCart(book.id, 1);

      toast.success(`"${book.name}" কার্টে যোগ করা হয়েছে`);
    } catch (err) {
      console.error("Error adding to cart:", err);
      toast.error(
        err instanceof Error ? err.message : "কার্টে যোগ করতে সমস্যা হয়েছে"
      );
    }
  }, [addToCart]);

  // Memoized books data with computed properties
  const memoizedBooks = useMemo(() => {
    return authorBooks.map((book, index) => {
      const enhancedBook = {
        ...book,
        isBestseller: index % 3 === 0,
        isNew: index % 4 === 0,
        isWishlisted: isInWishlist(book.id),
        hasDiscount: book.discount > 0,
        isOutOfStock: book.stock === 0,
        displayPrice: `৳${book.price}`,
        displayOriginalPrice: book.original_price ? `৳${book.original_price}` : null,
      };

      const ratingInfo = ratings[String(book.id)];
      const avgRating = ratingInfo?.averageRating ?? 0;
      const reviewCount = ratingInfo?.totalReviews ?? 0;

      return {
        ...enhancedBook,
        avgRating,
        reviewCount,
      };
    });
  }, [authorBooks, ratings, isInWishlist]);

  // Memoized author info
  const authorInfo = useMemo(() => ({
    name: author?.name,
    totalBooks: authorBooks.length,
  }), [author?.name, authorBooks.length]);

  // ⏳ Enhanced Skeleton Loader state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F4F8F7]/30 to-white py-8 md:py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Skeleton Header */}
          <div className="mb-8 md:mb-12">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-6 w-24 bg-gray-200 rounded-lg animate-pulse"></div>
              <div className="w-1 h-8 bg-gradient-to-b from-[#0E4B4B] to-[#5FA3A3] rounded-full"></div>
            </div>
            <div className="bg-gradient-to-r from-[#0E4B4B] to-[#5FA3A3] rounded-2xl p-6 md:p-8 text-white">
              <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
                {/* Skeleton Author Avatar */}
                <div className="relative">
                  <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm">
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl bg-white/10 animate-pulse border-2 border-white/30"></div>
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white rounded-full animate-pulse shadow-lg"></div>
                </div>
                {/* Skeleton Author Info */}
                <div className="flex-1 text-center md:text-left">
                  <div className="h-8 w-64 bg-white/20 rounded-lg animate-pulse mb-2"></div>
                  <div className="h-4 w-48 bg-white/10 rounded-lg animate-pulse mb-4"></div>
                  <div className="flex flex-wrap gap-6 text-sm justify-center md:justify-start">
                    <div className="h-4 w-24 bg-white/10 rounded-lg animate-pulse"></div>
                    <div className="h-4 w-24 bg-white/10 rounded-lg animate-pulse"></div>
                    <div className="h-4 w-24 bg-white/10 rounded-lg animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Skeleton Books Grid */}
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, index) => (
              <div key={index} className="group overflow-hidden border-0 bg-gradient-to-br from-white to-[#F4F8F7] shadow-lg rounded-2xl">
                {/* Skeleton Badges */}
                <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
                  <div className="w-16 h-6 bg-gray-200 rounded-full animate-pulse"></div>
                  <div className="w-16 h-6 bg-gray-200 rounded-full animate-pulse"></div>
                </div>
                {/* Skeleton Wishlist Button */}
                <div className="absolute top-3 right-3 z-10">
                  <div className="w-10 h-10 bg-white/80 rounded-full animate-pulse"></div>
                </div>
                {/* Skeleton Book Image */}
                <div className="relative w-full overflow-hidden bg-white p-4">
                  <div className="relative aspect-[3/4] w-full bg-gray-200 animate-pulse"></div>
                </div>
                <div className="p-4 sm:p-5">
                  {/* Skeleton Rating */}
                  <div className="flex items-center gap-1 mb-3 min-h-[18px]">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <div key={star} className="h-3 w-3 bg-gray-200 rounded animate-pulse"></div>
                      ))}
                    </div>
                    <div className="h-3 w-20 bg-gray-200 rounded animate-pulse ml-1"></div>
                  </div>
                  {/* Skeleton Book Name */}
                  <div className="h-6 w-full bg-gray-200 rounded-lg animate-pulse mb-2"></div>
                  <div className="h-6 w-3/4 bg-gray-200 rounded-lg animate-pulse mb-3"></div>
                  {/* Skeleton Author */}
                  <div className="h-4 w-32 bg-gray-200 rounded-lg animate-pulse mb-3"></div>
                  {/* Skeleton Price */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-baseline gap-2">
                      <div className="h-6 w-16 bg-gray-200 rounded-lg animate-pulse"></div>
                      <div className="h-4 w-12 bg-gray-200 rounded-lg animate-pulse"></div>
                    </div>
                    <div className="h-6 w-20 bg-gray-200 rounded-lg animate-pulse"></div>
                  </div>
                </div>
                {/* Skeleton Button */}
                <div className="p-4 sm:p-5 pt-0">
                  <div className="w-full h-12 bg-gray-200 rounded-xl animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ❌ Error / no author / no books
  if (!author || authorInfo.totalBooks === 0 || error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F4F8F7]/30 to-white py-16 flex items-center justify-center">
        <div className="text-center">
          <User className="h-16 w-16 text-[#5FA3A3]/30 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#0D1414] mb-2">
            কোন বই পাওয়া যায়নি
          </h2>
          <p className="text-[#5FA3A3] mb-6">
            এই লেখকের কোন বই খুঁজে পাওয়া যায়নি
          </p>
          <Link href="/ecommerce/authors">
            <Button className="rounded-full bg-gradient-to-r from-[#0E4B4B] to-[#5FA3A3] hover:from-[#5FA3A3] hover:to-[#0E4B4B] text-white px-8">
              সকল লেখক দেখুন
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F4F8F7]/30 to-white py-8 md:py-12 lg:py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Enhanced Header */}
        <div className="mb-8 md:mb-12">
          <div className="flex items-center gap-4 mb-6">
            <Link
              href="/ecommerce/authors"
              className="flex items-center gap-2 text-[#0E4B4B] hover:text-[#5FA3A3] transition-colors duration-300 group"
            >
              <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
              <span>সকল লেখক</span>
            </Link>
            <div className="w-1 h-8 bg-gradient-to-b from-[#0E4B4B] to-[#5FA3A3] rounded-full"></div>
          </div>

          <div className="bg-gradient-to-r from-[#0E4B4B] to-[#5FA3A3] rounded-2xl p-6 md:p-8 text-white">
            <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
              {/* Author Avatar */}
              <div className="relative">
                <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl bg-white/10 flex items-center justify-center border-2 border-white/30 overflow-hidden">
                    {author.image ? (
                      <Image
                        src={author.image}
                        alt={author.name}
                        width={96}
                        height={96}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="h-10 w-10 md:h-12 md:w-12 text-white" />
                    )}
                  </div>
                </div>
                <div className="absolute -bottom-2 -right-2 bg-white text-[#0E4B4B] p-2 rounded-full shadow-lg">
                  <PenTool className="h-4 w-4" />
                </div>
              </div>

              {/* Author Info */}
              <div className="flex-1 text-center md:text-left">
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-2">
                  {authorInfo.name}
                </h1>
                <p className="text-white/90 opacity-90 mb-4">
                  এই লেখকের সকল বইয়ের সংগ্রহ
                </p>

                <div className="flex flex-wrap gap-6 text-sm justify-center md:justify-start">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <span>মোট {authorInfo.totalBooks} টি বই</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <span>বিভিন্ন বিভাগ</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <span>গুণগত রচনা</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Books Grid */}
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {memoizedBooks.map((book) => {

            return (
              <Card
                key={book.id}
                className="group overflow-hidden border-0 bg-gradient-to-br from-white to-[#F4F8F7] shadow-lg hover:shadow-2xl transition-all duration-500 rounded-2xl relative"
              >
                {/* Badges */}
                <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
                  {book.hasDiscount && (
                    <div className="bg-gradient-to-r from-[#0E4B4B] to-[#5FA3A3] text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                      {book.discount}% ছাড়
                    </div>
                  )}
                  {book.isBestseller && (
                    <div className="bg-gradient-to-r from-[#C0704D] to-[#A85D3F] text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                      বেস্টসেলার
                    </div>
                  )}
                  {book.isNew && (
                    <div className="bg-gradient-to-r from-[#5FA3A3] to-[#0E4B4B] text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                      নতুন
                    </div>
                  )}
                </div>

                {/* Wishlist Button */}
                <button
                  onClick={() => toggleWishlist(book.id)}
                  className={`absolute top-3 right-3 z-10 p-2 rounded-full backdrop-blur-sm transition-all duration-300 ${
                    book.isWishlisted
                      ? "bg-red-500/20 text-red-500"
                      : "bg-white/80 text-gray-500 hover:bg-red-500/20 hover:text-red-500"
                  }`}
                  aria-label={
                    book.isWishlisted ? "Remove from wishlist" : "Add to wishlist"
                  }
                >
                  <Heart
                    className={`h-5 w-5 transition-all ${
                      book.isWishlisted
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

                <CardContent className="p-4 sm:p-5">
                  {/* Rating */}
                  <div className="flex items-center gap-1 mb-3 min-h-[18px]">
                    {book.reviewCount > 0 ? (
                      <>
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-3 w-3 ${
                                star <= Math.round(book.avgRating)
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-[#5FA3A3] ml-1">
                          ({book.avgRating.toFixed(1)} · {book.reviewCount} রিভিউ)
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-[#5FA3A3]/50">
                        এখনও কোন রিভিউ নেই
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
                    {book.writer.name}
                  </p>

                  {/* Price */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-xl text-[#0E4B4B]">
                        {book.displayPrice}
                      </span>
                      {book.hasDiscount && book.displayOriginalPrice && (
                        <span className="text-sm text-[#5FA3A3]/60 line-through">
                          {book.displayOriginalPrice}
                        </span>
                      )}
                    </div>
                    {book.isOutOfStock ? (
                      <div className="text-xs font-semibold bg-rose-600 text-white px-2 py-1 rounded-full">
                        Stock Out
                      </div>
                    ) : (
                      book.hasDiscount && (
                        <div className="text-xs font-semibold bg-[#F4F8F7] text-[#0E4B4B] px-2 py-1 rounded-full border border-[#5FA3A3]/30">
                          সাশ্রয় করুন
                        </div>
                      )
                    )}
                  </div>
                </CardContent>

                <CardFooter className="p-4 sm:p-5 pt-0">
                  <Button
                    disabled={book.isOutOfStock}
                    className={`w-full rounded-xl py-3 sm:py-4 font-semibold border-0 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 group/btn ${
                      book.isOutOfStock
                        ? "bg-gray-400 cursor-not-allowed opacity-60"
                        : "bg-gradient-to-r from-[#187a7a] to-[#5b9b9b] hover:from-[#0E4B4B] hover:to-[#42a8a8] text-white"
                    }`}
                    onClick={() => handleAddToCart(book)}
                  >
                    <ShoppingCart className="mr-2 h-4 w-4 group-hover/btn:scale-110 transition-transform" />
                    {book.isOutOfStock ? "স্টক শেষ" : "কার্টে যোগ করুন"}
                  </Button>
                </CardFooter>

                {/* Hover Effect Border */}
                <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-[#5FA3A3]/20 transition-all	duration-500 pointer-events-none"></div>
              </Card>
            );
          })}
        </div>

        {/* Bottom Navigation */}
        <div className="flex justify-between items-center mt-12 pt-8 border-t border-[#5FA3A3]/30">
          <Link
            href="/ecommerce/authors"
            className="flex items-center gap-2 text-[#0E4B4B] hover:text-[#5FA3A3] transition-colors	duration-300 group"
          >
            <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
            <span>সকল লেখকের বই দেখুন</span>
          </Link>

          <div className="text-sm text-[#5FA3A3]">
            মোট{" "}
            <span className="font-semibold text-[#0E4B4B]">
              {authorInfo.totalBooks}
            </span>{" "}
            টি বই
          </div>
        </div>
      </div>
    </div>
  );
}
