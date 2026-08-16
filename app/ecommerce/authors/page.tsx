"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { User, BookOpen, PenTool, ArrowRight, Users } from "lucide-react";

type Writer = {
  id: number | string;
  name: string;
  image?: string | null;
  bookCount?: number; // normalized count
  _count?: {
    products: number;
  }; // jodi API theke ase
  productCount?: number; // jodi ei name e ase
};

export default function AuthorCategoriesPage() {
  const [authors, setAuthors] = useState<Writer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;
    isMounted.current = true;

    // Add a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (isMounted.current && loading) {
        console.error('Request timeout - taking too long to fetch writers');
        setError("লোড হতে অনেক সময় লাগছে। দয়া করে পুনরায় চেষ্টা করুন।");
        setLoading(false);
      }
    }, 10000); // 10 seconds timeout

    // Memoized fetch function
    const fetchWriters = async () => {
      try {
        console.log('Fetching writers...');
        const res = await fetch("/api/writers?view=storefront", {
          cache: "force-cache",
          signal,
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`HTTP error! status: ${res.status}, message: ${errorText}`);
        }

        const data = await res.json();
        console.log('API Response:', data);
        
        if (!isMounted.current) return;
        
        if (!Array.isArray(data)) {
          throw new Error(`Expected array but got ${typeof data}`);
        }

        if (data.length === 0) {
          console.log('No writers found');
          setAuthors([]);
          setError("কোন লেখক পাওয়া যায়নি");
          return;
        }

        const normalized = data.map((w) => ({
          ...w,
          bookCount: w.bookCount ?? w.productCount ?? w._count?.products ?? 0,
        }));

        console.log('Normalized writers:', normalized);
        setAuthors(normalized);
        setError(null);
      } catch (error: any) {
        if (!isMounted.current || error.name === 'AbortError') return;
        console.error('Error in fetchWriters:', error);
        setError("লেখকদের তালিকা লোড করতে সমস্যা হয়েছে। দয়া করে পুনরায় চেষ্টা করুন।");
        setAuthors([]);
      } finally {
        clearTimeout(timeoutId);
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };

    fetchWriters();

    return () => {
      isMounted.current = false;
      abortController.abort();
      clearTimeout(timeoutId);
    };
  }, []);

  // Memoized authors data
  const memoizedAuthors = useMemo(() => {
    return authors.map((author, index) => {
      const authoredBooksCount =
        author.bookCount ??
        author.productCount ??
        author._count?.products ??
        0;

      // Generate different background colors for variety
      const colorVariants = [
        "from-[#0E4B4B] to-[#5FA3A3]",
        "from-[#5FA3A3] to-[#0E4B4B]",
        "from-[#0E4B4B] to-[#C0704D]",
        "from-[#5FA3A3] to-[#A85D3F]",
      ];
      const colorVariant = colorVariants[index % colorVariants.length];

      return {
        ...author,
        authoredBooksCount,
        colorVariant,
      };
    });
  }, [authors]);

  // ⏳ Skeleton Loader state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F4F8F7]/30 to-white py-8 md:py-12 lg:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Skeleton Header */}
          <div className="text-center mb-12 md:mb-16">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-2 h-12 bg-gradient-to-b from-[#0E4B4B] to-[#5FA3A3] rounded-full animate-pulse"></div>
              <div className="h-10 w-48 bg-gray-200 rounded-lg animate-pulse"></div>
              <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse"></div>
            </div>
            <div className="h-6 w-96 bg-gray-200 rounded-lg mx-auto animate-pulse"></div>
          </div>

          {/* Skeleton Grid */}
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
            {[...Array(8)].map((_, index) => (
              <div key={index} className="h-full border-0 bg-gradient-to-br from-white to-[#F4F8F7] shadow-lg rounded-2xl overflow-hidden">
                <div className="p-6 md:p-8 text-center flex flex-col items-center justify-center h-full">
                  {/* Skeleton Avatar */}
                  <div className="relative mb-4 md:mb-6">
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl bg-gray-200 animate-pulse"></div>
                    <div className="absolute -bottom-2 -right-2 w-8 h-6 bg-gray-200 rounded-full animate-pulse"></div>
                    <div className="absolute -top-2 -left-2 w-6 h-6 bg-gray-200 rounded-full animate-pulse"></div>
                  </div>
                  {/* Skeleton Name */}
                  <div className="h-6 w-32 bg-gray-200 rounded-lg mb-2 animate-pulse"></div>
                  {/* Skeleton Book Count */}
                  <div className="h-4 w-24 bg-gray-200 rounded-lg mb-4 animate-pulse"></div>
                  {/* Skeleton Button */}
                  <div className="h-4 w-20 bg-gray-200 rounded-lg animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ❌ Error / empty state
  if (error || authors.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F4F8F7]/30 to-white flex items-center justify-center">
        <div className="text-center">
          <Users className="h-12 w-12 text-[#5FA3A3]/30 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#0D1414] mb-2">
            কোন লেখক পাওয়া যায়নি
          </h2>
          <p className="text-[#5FA3A3] mb-2">
            {error || "বর্তমানে কোন লেখকের তথ্য পাওয়া যায়নি"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F4F8F7]/30 to-white py-8 md:py-12 lg:py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Enhanced Header */}
        <div className="text-center mb-12 md:mb-16">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-2 h-12 bg-gradient-to-b from-[#0E4B4B] to-[#5FA3A3] rounded-full"></div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-[#0D1414]">
              লেখকবৃন্দ
            </h1>
            <Users className="h-8 w-8 md:h-10 md:w-10 text-[#0E4B4B]" />
          </div>
          <p className="text-[#5FA3A3] text-lg max-w-2xl mx-auto">
            আমাদের বিশিষ্ট লেখকদের পরিচিতি এবং তাদের রচিত বইসমূহ দেখুন
          </p>
        </div>

        {/* Authors Grid */}
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
          {memoizedAuthors.map((author) => {

            return (
              <Link
                href={`/ecommerce/authors/${author.id}`}
                key={author.id}
                className="group hover:no-underline block"
              >
                <Card className="h-full border-0 bg-gradient-to-br from-white to-[#F4F8F7] shadow-lg hover:shadow-2xl transition-all duration-500 rounded-2xl overflow-hidden relative">
                  {/* Background Pattern */}
                  <div className="absolute inset-0 opacity-5">
                    <div className="absolute top-3 right-3 w-6 h-6 border border-[#0E4B4B] rounded-full"></div>
                    <div className="absolute bottom-3 left-3 w-4 h-4 bg-[#5FA3A3] rotate-45"></div>
                  </div>

                  {/* Hover Border Effect */}
                  <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-[#5FA3A3]/20 transition-all duration-500 pointer-events-none"></div>

                  <CardContent className="p-6 md:p-8 text-center flex flex-col items-center justify-center h-full relative z-10">
                    {/* Author Avatar Container */}
                    <div className="relative mb-4 md:mb-6">
                      {/* Background Gradient Ring */}
                      <div
                        className={`absolute -inset-2 bg-gradient-to-br ${author.colorVariant} rounded-full opacity-20 group-hover:opacity-30 transition-opacity duration-300`}
                      ></div>

                      {/* Main Avatar */}
                      <div className="relative bg-white p-1 rounded-2xl shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110 border-2 border-[#5FA3A3]/30">
                        <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden relative bg-gradient-to-br from-[#F4F8F7] to-[#5FA3A3]/20 flex items-center justify-center">
                          <Image
                            src={author.image || "/assets/authors/profile.png"}
                            alt={author.name}
                            width={96}
                            height={96}
                            className="object-cover transition-transform duration-700 group-hover:scale-110"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            onError={(e) => {
                              // If the image fails to load, fall back to the default profile image
                              const target = e.target as HTMLImageElement;
                              target.src = "/assets/authors/profile.png";
                            }}
                          />
                          {/* Fallback Icon */}
                          <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <User className="h-8 w-8 text-white/80" />
                          </div>
                        </div>
                      </div>

                      {/* Book Count Badge */}
                      <div
                        className={`absolute -bottom-2 -right-2 bg-gradient-to-r ${author.colorVariant} text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1`}
                      >
                        <BookOpen className="h-3 w-3" />
                        <span>{author.authoredBooksCount}</span>
                      </div>

                      {/* Pen Icon Decoration */}
                      <div className="absolute -top-2 -left-2 bg-white p-1.5 rounded-full shadow-md">
                        <PenTool className="h-3 w-3 text-[#0E4B4B]" />
                      </div>
                    </div>

                    {/* Author Name */}
                    <h3 className="text-lg md:text-xl font-bold text-[#0D1414] mb-2 group-hover:text-[#0E4B4B] transition-colors duration-300 line-clamp-2 leading-tight min-h-[3rem] flex items-center justify-center">
                      {author.name}
                    </h3>

                    {/* Book Count Text */}
                    <p className="text-sm text-[#5FA3A3] mb-4 flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-[#0E4B4B]" />
                      <span>মোট {author.authoredBooksCount} টি বই</span>
                    </p>

                    {/* CTA Button */}
                    <div className="flex items-center justify-center gap-2 text-[#0E4B4B] group-hover:text-[#5FA3A3] transition-colors duration-300 font-semibold text-sm">
                      <span>বই দেখুন</span>
                      <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform duration-300" />
                    </div>

                    {/* Hover Effect Line */}
                    <div className="w-0 group-hover:w-12 h-0.5 bg-gradient-to-r from-[#0E4B4B] to-[#5FA3A3] rounded-full transition-all duration-500 mt-2"></div>
                  </CardContent>

                  {/* Popular Author Badge */}
                  {author.authoredBooksCount >= 5 && (
                    <div className="absolute top-4 right-4 bg-gradient-to-r from-[#C0704D] to-[#A85D3F] text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg z-20">
                      জনপ্রিয়
                    </div>
                  )}

                  {/* New Author Badge */}
                  {author.authoredBooksCount <= 2 && (
                    <div className="absolute top-4 right-4 bg-gradient-to-r from-[#5FA3A3] to-[#0E4B4B] text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg z-20">
                      নতুন
                    </div>
                  )}

                  {/* Gradient Overlay on Hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[#0E4B4B]/5 to-[#5FA3A3]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none"></div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
