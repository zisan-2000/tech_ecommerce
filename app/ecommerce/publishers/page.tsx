"use client";

import { useEffect, useState, useMemo, useCallback, memo, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Building, BookOpen, ArrowRight, Globe } from "lucide-react";

interface PublisherFromApi {
  id: number;
  name: string;
  image?: string | null;
  createdAt: string;
  updatedAt: string;
  // API থেকে productCount হিসেবে আমরা বইয়ের সংখ্যা পাচ্ছি
  productCount: number;
}

const PublisherCategoriesPage = memo(function PublisherCategoriesPage() {
  const [publishers, setPublishers] = useState<PublisherFromApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 🔹 Optimized publishers fetch with caching
  useEffect(() => {
    const fetchPublishers = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/publishers?view=storefront", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "force-cache",
          next: { revalidate: 600 } // Cache for 10 minutes
        });

        if (!res.ok) {
          throw new Error("Failed to fetch publishers");
        }

        const data = await res.json();
        setPublishers(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error fetching publishers:", err);
        setError("প্রকাশক লোড করতে সমস্যা হয়েছে।");
        setPublishers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPublishers();
  }, []);

  // 🔹 Memoized publishers data
  const memoizedPublishers = useMemo(() => publishers, [publishers]);

  // UI শুরু
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F4F8F7]/30 to-white py-8 md:py-12 lg:py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12 md:mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-2 h-12 bg-gradient-to-b from-[#0E4B4B] to-[#5FA3A3] rounded-full"></div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-[#0D1414]">
              প্রকাশকবৃন্দ
            </h1>
            <Building className="h-8 w-8 md:h-10 md:w-10 text-[#0E4B4B]" />
          </div>
          <p className="text-[#5FA3A3] text-lg max-w-2xl mx-auto">
            আমাদের বিশ্বস্ত প্রকাশক প্রতিষ্ঠানসমূহ এবং তাদের প্রকাশিত বইয়ের সংগ্রহ
          </p>
        </div>

        {/* Loading / Error Handling */}
        {loading ? (
          <div className="text-center text-[#5FA3A3] py-16">
            প্রকাশকদের তালিকা লোড হচ্ছে...
          </div>
        ) : error ? (
          <div className="text-center text-[#5FA3A3] py-16">
            <p className="mb-4">{error}</p>
            <Button className="bg-gradient-to-r from-[#0E4B4B] to-[#5FA3A3] hover:from-[#5FA3A3] hover:to-[#0E4B4B] text-white" onClick={() => location.reload()}>আবার চেষ্টা করুন</Button>
          </div>
        ) : publishers.length === 0 ? (
          <div className="text-center text-[#5FA3A3] py-16">
            কোনো প্রকাশক পাওয়া যায়নি।
          </div>
        ) : (
          // Publishers Grid
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
            {publishers.map((publisher, index) => {
              const booksCount = publisher.productCount ?? 0;

              // আগের মতই ভ্যারিয়েন্ট রঙ
              const colorVariants = [
                "from-[#0E4B4B] to-[#5FA3A3]",
                "from-[#5FA3A3] to-[#0E4B4B]",
                "from-[#0E4B4B] to-[#C0704D]",
                "from-[#5FA3A3] to-[#A85D3F]",
              ];
              const colorVariant = colorVariants[index % colorVariants.length];

              return (
                <Card
                  key={publisher.id}
                  className="group h-full border-0 bg-gradient-to-br from-white to-[#F4F8F7] shadow-lg hover:shadow-2xl transition-all duration-500 rounded-2xl overflow-hidden relative"
                >
                  {/* Background Pattern */}
                  <div className="absolute inset-0 opacity-5">
                    <div className="absolute top-3 right-3 w-6 h-6 border border-[#0E4B4B] rounded-full"></div>
                    <div className="absolute bottom-3 left-3 w-4 h-4 bg-[#5FA3A3] rotate-45"></div>
                  </div>

                  {/* Hover Border Effect */}
                  <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-[#5FA3A3]/20 transition-all duration-500 pointer-events-none"></div>

                  <CardContent className="p-6 md:p-8 text-center flex flex-col items-center justify-center h-full relative z-10">
                    {/* Publisher Logo Container */}
                    <div className="relative mb-4 md:mb-6">
                      {/* Background Gradient Ring */}
                      <div
                        className={`absolute -inset-2 bg-gradient-to-br ${colorVariant} rounded-full opacity-20 group-hover:opacity-30 transition-opacity duration-300`}
                      ></div>

                      {/* Main Logo */}
                      <div className="relative bg-white p-2 rounded-2xl shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110 border-2 border-[#5FA3A3]/30">
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden relative bg-gradient-to-br from-[#F4F8F7] to-[#5FA3A3]/20 flex items-center justify-center">
                          <Image
                            src={publisher.image || "/placeholder.svg"}
                            alt={publisher.name}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-110"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            loading="lazy"
                            placeholder="blur"
                            blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = "/placeholder.svg";
                            }}
                          />
                          {/* Fallback Icon Overlay */}
                          <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <Building className="h-8 w-8 text-white/80" />
                          </div>
                        </div>
                      </div>

                      {/* Book Count Badge */}
                      <div
                        className={`absolute -bottom-2 -right-2 bg-gradient-to-r ${colorVariant} text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1`}
                      >
                        <BookOpen className="h-3 w-3" />
                        <span>{booksCount}</span>
                      </div>

                      {/* Globe Icon Decoration */}
                      <div className="absolute -top-2 -left-2 bg-white p-1.5 rounded-full shadow-md">
                        <Globe className="h-3 w-3 text-[#0E4B4B]" />
                      </div>
                    </div>

                    {/* Publisher Name */}
                    <h3 className="text-lg md:text-xl font-bold text-[#0D1414] mb-2 group-hover:text-[#0E4B4B] transition-colors duration-300 line-clamp-2 leading-tight">
                      {publisher.name}
                    </h3>

                    {/* Location */}
                    <p className="text-sm text-[#5FA3A3] mb-3 flex items-center justify-center gap-2">
                      <MapPin className="h-4 w-4 text-[#0E4B4B]" />
                      <span>অজানা স্থান</span>
                    </p>

                    {/* Description */}
                    <p className="text-sm text-[#5FA3A3]/70 mb-6 leading-relaxed">
                      এই প্রকাশকের সম্পর্কে আরও তথ্য প্রাপ্ত হয়নি।
                    </p>

                    {/* Action Buttons */}
                    <div className="w-full space-y-3">
                      <Link
                        href={`/ecommerce/publishers/${publisher.id}`}
                        className="block w-full"
                      >
                        <Button className="w-full rounded-xl bg-gradient-to-r from-[#187a7a] to-[#5b9b9b] hover:from-[#0E4B4B] hover:to-[#42a8a8] text-white font-semibold py-3 border-0 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 group/btn">
                          <BookOpen className="mr-2 h-4 w-4 group-hover/btn:scale-110 transition-transform" />
                          সকল বই দেখুন
                        </Button>
                      </Link>

                      <Button
                        variant="outline"
                        className="w-full rounded-xl border-[#5FA3A3]/30 text-[#5FA3A3] hover:bg-[#0E4B4B] hover:text-white hover:border-[#0E4B4B] transition-all duration-300 flex items-center justify-center gap-2 group/learn"
                        disabled
                      >
                        <span>আরো জানুন</span>
                        <ArrowRight className="h-4 w-4 transform group-hover/learn:translate-x-1 transition-transform" />
                      </Button>
                    </div>

                    {/* Hover Effect Line */}
                    <div className="w-0 group-hover:w-12 h-0.5 bg-gradient-to-r from-[#0E4B4B] to-[#5FA3A3] rounded-full transition-all duration-500 mt-3"></div>
                  </CardContent>

                  {/* Established Publisher Badge */}
                  {booksCount >= 10 && (
                    <div className="absolute top-4 right-4 bg-gradient-to-r from-[#C0704D] to-[#A85D3F] text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg z-20">
                      প্রতিষ্ঠিত
                    </div>
                  )}

                  {/* New Publisher Badge */}
                  {booksCount > 0 && booksCount <= 3 && (
                    <div className="absolute top-4 right-4 bg-gradient-to-r from-[#5FA3A3] to-[#0E4B4B] text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg z-20">
                      নতুন
                    </div>
                  )}

                  {/* Gradient Overlay on Hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[#0E4B4B]/5 to-[#5FA3A3]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none"></div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

PublisherCategoriesPage.displayName = 'PublisherCategoriesPage';

export default function PublishersPage() {
  return (
    <Suspense fallback={<PublishersSkeleton />}>
      <PublisherCategoriesPage />
    </Suspense>
  );
}

// Skeleton component for loading state
function PublishersSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-gray-50 py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Skeleton */}
        <div className="text-center mb-16">
          <Skeleton className="h-16 w-48 mx-auto mb-4" />
          <Skeleton className="h-6 w-96 mx-auto" />
        </div>

        {/* Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="group overflow-hidden bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500">
              <div className="relative h-48 overflow-hidden">
                <Skeleton className="h-full w-full" />
              </div>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex justify-between items-center pt-4">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-10 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
