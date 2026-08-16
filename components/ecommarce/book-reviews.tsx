"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

interface ApiReview {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string | null;
  };
}

interface UiReview {
  id: number;
  name: string;
  rating: number;
  date: string;
  comment: string;
  avatar: string;
}

// Define TypeScript props type
interface BookReviewsProps {
  bookId?: string | number; // এখন আসল productId এখানে আসবে
}

export default function BookReviews({ bookId }: BookReviewsProps) {
  const { data: session } = useSession();

  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState<string>("");

  const [reviews, setReviews] = useState<UiReview[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // ⭐ Rating handlers
  const handleRatingClick = (value: number) => {
    setRating(value);
  };

  const handleRatingHover = (value: number) => {
    setHoverRating(value);
  };

  const handleRatingLeave = () => {
    setHoverRating(0);
  };

  // ✅ API থেকে রিভিউ লোড
  const fetchReviews = async () => {
    if (!bookId) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/reviews?view=storefront&productId=${bookId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        console.error("Failed to fetch reviews:", await res.text());
        return;
      }

      const data = await res.json();
      const apiReviews: ApiReview[] = Array.isArray(data.reviews)
        ? data.reviews
        : [];

      const mapped: UiReview[] = apiReviews.map((r) => ({
        id: r.id,
        name: r.user?.name || "অজ্ঞাত ব্যবহারকারী",
        rating: r.rating,
        date: new Date(r.createdAt).toLocaleDateString("bn-BD", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        comment: r.comment || "",
        avatar: "/assets/authors/profile.png",
      }));

      setReviews(mapped);
    } catch (error) {
      console.error("Error fetching reviews:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
      void fetchReviews();
    }, [bookId]);

  // ✅ রিভিউ সাবমিট → API POST
  const handleSubmitReview = async () => {
    if (!bookId) {
      toast.error("প্রডাক্ট আইডি পাওয়া যায়নি");
      return;
    }

    if (!session?.user) {
      toast.error("রিভিউ দিতে আগে লগইন করুন");
      return;
    }

    if (rating === 0 || !comment.trim()) {
      toast.error("রেটিং দিন এবং মন্তব্য লিখুন");
      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId:
            typeof bookId === "string" ? Number.parseInt(bookId, 10) : bookId,
          rating,
          comment,
        }),
      });

      if (res.status === 401) {
        toast.error("রিভিউ দিতে আগে লগইন করুন");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.error("Review submit failed:", data || res.statusText);
        toast.error(data?.error || "রিভিউ সেভ করা যায়নি, আবার চেষ্টা করুন");
        return;
      }

      // const saved = await res.json(); // চাইলে ব্যবহার করতে পারো

      toast.success("রিভিউ সফলভাবে জমা হয়েছে");
      setRating(0);
      setComment("");

      // ✅ সফল হলে আবার রিভিউ লিস্ট রিফ্রেশ
      await fetchReviews();
    } catch (error) {
      console.error("Error submitting review:", error);
      toast.error("রিভিউ দিতে সমস্যা হয়েছে");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h3 className="text-xl font-bold mb-4">রিভিউ লিখুন</h3>

      {/* যদি bookId না থাকে, simple guard */}
      {!bookId && (
        <p className="text-sm text-muted-foreground mb-4">
          (প্রডাক্ট আইডি না থাকায় রিভিউ দেওয়া যাচ্ছে না)
        </p>
      )}

      <div className="mb-4">
        <div className="flex items-center mb-2">
          <span className="mr-2">রেটিং:</span>
          <div className="flex" onMouseLeave={handleRatingLeave}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Star
                key={value}
                className={`h-6 w-6 cursor-pointer ${
                  (hoverRating || rating) >= value
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-gray-300"
                }`}
                onClick={() => handleRatingClick(value)}
                onMouseEnter={() => handleRatingHover(value)}
              />
            ))}
          </div>
        </div>
        <Textarea
          placeholder="আপনার মতামত লিখুন..."
          className="mb-2"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <Button
          onClick={handleSubmitReview}
          disabled={submitting || !bookId}
        >
          {submitting ? "জমা হচ্ছে..." : "রিভিউ জমা দিন"}
        </Button>
      </div>

      <div className="border-t pt-6 mt-6">
        <h3 className="text-xl font-bold mb-4">গ্রাহকদের রিভিউ</h3>

        {loading ? (
          <p className="text-muted-foreground">রিভিউ লোড হচ্ছে...</p>
        ) : reviews.length === 0 ? (
          <p className="text-muted-foreground">এখনও কোন রিভিউ নেই।</p>
        ) : (
          <div className="space-y-6">
            {reviews.map((review) => (
              <div key={review.id} className="border-b pb-6">
                <div className="flex items-start">
                  <div className="relative h-10 w-10 rounded-full overflow-hidden mr-3">
                    <Image
                      src={review.avatar || "/placeholder.svg"}
                      alt={review.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{review.name}</h4>
                      <span className="text-sm text-muted-foreground">
                        {review.date}
                      </span>
                    </div>
                    <div className="flex my-1">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <Star
                          key={value}
                          className={`h-4 w-4 ${
                            review.rating >= value
                              ? "text-yellow-400 fill-yellow-400"
                              : "text-gray-300"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-muted-foreground">{review.comment}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
