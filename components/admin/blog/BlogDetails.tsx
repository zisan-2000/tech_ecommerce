// components/admin/blog/BlogDetails.tsx
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Calendar, Clock, User, ArrowLeft, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import RecentBlogs from "./RecentBlogs";
import TopSellingProducts from "@/components/ecommarce/TopSellingProducts";

interface Blog {
  id: number;
  slug: string;
  title: string;
  content: string;
  summary: string;
  author: string;
  date: string | Date;
  image?: string;
  ads?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

// ============= PROFESSIONAL RELATED BLOGS CARD =============
const RelatedBlogsCard = () => (
  <div className="sticky top-6 rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
    <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 border-b">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-sm">
          <BookOpen className="h-5 w-5 text-primary-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          Related Blogs
        </h3>
      </div>
    </div>
    <div className="p-5">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Explore more articles and expand your knowledge.
      </p>
    </div>
  </div>
);

// ============= UPDATED UTILITY FUNCTIONS =============

/**
 * Process and clean blog summary for professional display
 * Best sentence-safe summary generator
 */
const processBlogSummary = (text: string, maxLength: number = 400): string => {
  if (!text) return "";

  // Remove HTML tags and normalize whitespace
  let cleanText = text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleanText.length <= maxLength) return cleanText;

  // Split into sentences using lookbehind for Bengali and English punctuation
  const sentences = cleanText
    .split(/(?<=[।!?])/)
    .map((s) => s.trim())
    .filter(Boolean);

  let finalSummary = "";
  for (let sentence of sentences) {
    if ((finalSummary + " " + sentence).trim().length <= maxLength) {
      finalSummary += (finalSummary ? " " : "") + sentence;
    } else {
      break;
    }
  }

  // If no sentence fits, fallback to clean truncation
  if (!finalSummary) {
    const truncated = cleanText.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    return truncated.substring(0, lastSpace) + "...";
  }

  return finalSummary.trim();
};

/**
 * Extract key points from summary for bullet display
 * Improved key point extractor (now sentence-safe)
 */
const extractKeyPoints = (summary: string): string[] => {
  if (!summary) return [];

  const cleanText = summary
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Split into sentences using lookbehind for sentence endings
  const sentences = cleanText
    .split(/(?<=[।!?])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8); // Filter out very short fragments

  return sentences.slice(0, 3); // Return first 3 sentences as key points
};

/**
 * Calculate reading time based on word count
 */
const calculateReadingTime = (text: string): number => {
  const wordCount = text.split(/\s+/).length;
  // Average reading speed: 200 words per minute for Bengali
  return Math.ceil(wordCount / 200);
};

// ============= PROFESSIONAL SUMMARY COMPONENT =============

interface ProfessionalSummaryProps {
  summary: string;
  content?: string;
}

const ProfessionalSummary: React.FC<ProfessionalSummaryProps> = ({
  summary,
  content = "",
}) => {
  const processedSummary = processBlogSummary(summary, 400);
  const keyPoints = extractKeyPoints(summary);
  const readingTime = calculateReadingTime(content || summary);

  return (
    <div className="rounded-xl border bg-gradient-to-br from-card via-card to-primary/5 text-card-foreground shadow-lg">
      <div className="flex flex-col space-y-1.5 p-6 border-b bg-gradient-to-r from-primary/10 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary shadow-md">
            <BookOpen className="h-6 w-6 text-primary-foreground" />
          </div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent mb-3">
            Summary
          </h2>
        </div>
      </div>

      <div className="p-6 pt-5">
        <div className="relative pl-5 border-l-4 border-primary/40 bg-muted/30 rounded-r-lg py-4 pr-4">
          <p className="text-foreground/90 leading-relaxed text-base">
            {processedSummary}
          </p>
        </div>

        {keyPoints.length > 0 && (
          <div className="mt-6 space-y-4 bg-muted/30 rounded-xl p-5">
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <svg
                className="h-5 w-5 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              Key Points
            </h3>
            <ul className="space-y-3">
              {keyPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-3 group">
                  <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm group-hover:scale-110 transition-transform">
                    {index + 1}
                  </span>
                  <span className="text-sm text-foreground/80 leading-relaxed pt-0.5">
                    {point}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

const LoadingSkeleton = () => (
  <div className="space-y-8">
    <Button variant="outline" size="sm" className="mb-6">
      <ArrowLeft className="h-4 w-4 mr-2" />
      Go Back
    </Button>

    <div className="space-y-4">
      <Skeleton className="h-8 w-3/4" />
      <div className="flex items-center space-x-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  </div>
);

export default function BlogDetails() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const blogSlug = params?.slug;

  // State Hooks
  const [blog, setBlog] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blogCache, setBlogCache] = useState<Map<string, Blog>>(new Map());
  const [isImageLoading, setIsImageLoading] = useState(true);

  // Memoize the fetch function to prevent unnecessary re-creations
  const fetchBlogDetails = useCallback(
    async (slug: string) => {
      // Check cache first
      if (blogCache.has(slug)) {
        const cachedBlog = blogCache.get(slug);
        if (cachedBlog) {
          setBlog(cachedBlog);
          setLoading(false);
          return;
        }
      }

      try {
        setLoading(true);
        setError(null);

        // First try to fetch by slug
        let response = await fetch(`/api/blog/slug/${slug}`);

        // If slug-based fetch fails (404), try ID-based fetch for backward compatibility
        if (!response.ok) {
          response = await fetch(`/api/blog/${slug}`);
        }

        if (!response.ok) {
          throw new Error("Failed to fetch blog");
        }

        const data = await response.json();

        // Update cache
        setBlogCache((prev) => new Map(prev).set(slug, data));
        setBlog(data);
      } catch (err) {
        console.error("Error fetching blog details:", err);
        setError("Failed to load blog. Please try again later.");
      } finally {
        setLoading(false);
      }
    },
    [blogCache]
  );

  // Fetch blog data when slug changes
  useEffect(() => {
    if (!blogSlug) {
      setLoading(false);
      setError("Invalid blog slug");
      return;
    }

    fetchBlogDetails(blogSlug);
  }, [blogSlug, fetchBlogDetails]);

  // Loading and Error States (Enhanced)
  if (error) {
    return (
      <div className="container max-w-5xl px-4 py-8 mx-auto">
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <svg
              className="h-6 w-6 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">
            Failed to load page
          </h2>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <div className="mt-6">
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container max-w-5xl px-4 py-8 mx-auto">
        <LoadingSkeleton />
      </div>
    );
  }

  // Early return if blog is null
  if (!blog) {
    return (
      <div className="container max-w-5xl px-4 py-8 mx-auto">
        <div className="text-center py-12">
          <p className="text-muted-foreground">No blog post found.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
            className="mt-4 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Blogs
          </Button>
        </div>
      </div>
    );
  }

  // Main Layout
  return (
    <div className="w-full">
      {/* ======== Desktop Layout (3 Columns) ======== */}
      <div className="hidden lg:block">
        <div className="grid grid-cols-12 gap-6">
          {/* Left side: blog-specific image ad or popular products */}
          <div className="col-span-2 space-y-6 sticky top-56 mt-24 pl-10 h-fit">
            {blog?.ads ? (
              <div className="w-full h-96 border rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                <img
                  src={blog.ads}
                  alt="Blog Advertisement"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <TopSellingProducts />
            )}
          </div>

          {/* Middle: Blog Content */}
          <div className="col-span-7">
            <div className="container max-w-5xl px-4 py-8 mx-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.back()}
                className="mb-8 gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Go Back to Blogs
              </Button>

              <article className="space-y-8">
                <header className="space-y-6">
                  <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
                      {blog.title}
                    </h1>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>{blog.author}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <time dateTime={new Date(blog.date).toISOString()}>
                          {format(new Date(blog.date), "MMMM d, yyyy")}
                        </time>
                      </div>
                    </div>
                  </div>

                  {blog.image && (
                    <div className="relative aspect-video overflow-hidden rounded-xl border bg-muted">
                      {isImageLoading && (
                        <Skeleton className="absolute inset-0 w-full h-full" />
                      )}

                      <img
                        src={blog.image}
                        alt={blog.title}
                        className={`w-full h-full object-cover transition-opacity duration-300 ${
                          isImageLoading ? "opacity-0" : "opacity-100"
                        }`}
                        onLoad={() => setIsImageLoading(false)}
                        onError={() => setIsImageLoading(false)}
                      />

                      {!isImageLoading && (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                      )}
                    </div>
                  )}
                </header>

                <div className="grid gap-8">
                  <div className="space-y-8">
                    <ProfessionalSummary
                      summary={blog.summary}
                      content={blog.content || ""}
                    />

                    {blog.content && (
                      <div
                        className="prose prose-slate max-w-none dark:prose-invert
                        prose-headings:font-semibold
                        prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-8 prose-h2:mb-4
                        prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3
                        prose-p:text-foreground/90 prose-p:leading-relaxed
                        prose-a:text-primary hover:prose-a:underline
                        prose-ul:list-disc prose-ol:list-decimal
                        prose-li:marker:text-primary prose-li:my-1"
                        dangerouslySetInnerHTML={{ __html: blog.content }}
                      />
                    )}
                  </div>
                </div>
              </article>
            </div>
          </div>

          {/* Right Side: Related + Recent Blogs */}
          <div className="col-span-3 space-y-6 sticky top-6 mt-60 h-fit">
            <RelatedBlogsCard />
            <div className="mt-6">
              <RecentBlogs />
            </div>
          </div>
        </div>
      </div>

      {/* ======== Mobile Layout ======== */}
      <div className="lg:hidden">
        <div className="container max-w-5xl px-4 py-8 mx-auto">
          {/* 1. Blog Content (Top) */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
            className="mb-8 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back to Blogs
          </Button>

          <article className="space-y-8">
            <header className="space-y-6">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {blog.title}
                </h1>

                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span>{blog.author}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <time dateTime={new Date(blog.date).toISOString()}>
                      {format(new Date(blog.date), "MMMM d, yyyy")}
                    </time>
                  </div>
                </div>
              </div>

              {blog.image && (
                <div className="relative aspect-video overflow-hidden rounded-xl border bg-muted">
                  {isImageLoading && (
                    <Skeleton className="absolute inset-0 w-full h-full" />
                  )}

                  <img
                    src={blog.image}
                    alt={blog.title}
                    className={`w-full h-full object-cover transition-opacity duration-300 ${
                      isImageLoading ? "opacity-0" : "opacity-100"
                    }`}
                    onLoad={() => setIsImageLoading(false)}
                    onError={() => setIsImageLoading(false)}
                  />

                  {!isImageLoading && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  )}
                </div>
              )}
            </header>

            <div className="grid gap-8">
              <div className="space-y-8">
                <ProfessionalSummary
                  summary={blog.summary}
                  content={blog.content || ""}
                />

                {blog.content && (
                  <div
                    className="prose prose-slate max-w-none dark:prose-invert
                    prose-headings:font-semibold
                    prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-8 prose-h2:mb-4
                    prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3
                    prose-p:text-foreground/90 prose-p:leading-relaxed
                    prose-a:text-primary hover:prose-a:underline
                    prose-ul:list-disc prose-ol:list-decimal
                    prose-li:marker:text-primary prose-li:my-1"
                    dangerouslySetInnerHTML={{ __html: blog.content }}
                  />
                )}
              </div>
            </div>
          </article>

          {/* 2. Recent Blogs (Below Content) */}
          <div className="mt-10">
            <h2 className="text-2xl font-bold mb-6">Recent Blogs</h2>
            <RecentBlogs />
          </div>

          {/* 3. Mobile: blog-specific image ad or popular products */}
          <div className="mt-10 space-y-6">
            {blog?.ads ? (
              <div className="w-full h-56 border rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                <img
                  src={blog.ads}
                  alt="ব্লগ বিজ্ঞাপন"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <TopSellingProducts />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
