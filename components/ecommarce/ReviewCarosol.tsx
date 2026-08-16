"use client";

import { useEffect, useRef, useState } from "react";

type ReviewUser = { name: string; image?: string | null };
type ReviewProduct = { name: string };
type FeaturedReview = {
  id: number;
  rating: number;
  comment: string;
  user: ReviewUser;
  product: ReviewProduct;
  createdAt: string;
};

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 1l1.545 3.13L12 4.635l-2.5 2.435.59 3.44L7 8.885l-3.09 1.625L4.5 7.07 2 4.635l3.455-.505L7 1z"
            fill={i < rating ? "#EF9F27" : "none"}
            stroke={i < rating ? "#BA7517" : "currentColor"}
            strokeWidth="0.8"
            className={i < rating ? "" : "text-border"}
          />
        </svg>
      ))}
    </div>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  {
    bg: "bg-blue-50 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-300",
  },
  {
    bg: "bg-purple-50 dark:bg-purple-950",
    text: "text-purple-700 dark:text-purple-300",
  },
  {
    bg: "bg-emerald-50 dark:bg-emerald-950",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  {
    bg: "bg-amber-50 dark:bg-amber-950",
    text: "text-amber-700 dark:text-amber-300",
  },
  {
    bg: "bg-rose-50 dark:bg-rose-950",
    text: "text-rose-700 dark:text-rose-300",
  },
];

function ReviewCard({
  review,
  colorIdx,
}: {
  review: FeaturedReview;
  colorIdx: number;
}) {
  const color = AVATAR_COLORS[colorIdx % AVATAR_COLORS.length];
  const truncated =
    review.comment.length > 100
      ? review.comment.slice(0, 100) + "…"
      : review.comment;

  return (
    <div className="w-[280px] flex-shrink-0 rounded-xl border border-border bg-card p-4 select-none">
      <Stars rating={review.rating} />

      <p className="mt-2.5 mb-3 text-sm text-foreground leading-relaxed min-h-[52px]">
        "{truncated}"
      </p>

      <div className="border-t border-border pt-3 mb-3">
        <p className="text-[11px] text-muted-foreground truncate">
          {review.product.name}
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        {review.user.image ? (
          <img
            src={review.user.image}
            alt={review.user.name}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-medium ${color.bg} ${color.text}`}
          >
            {getInitials(review.user.name)}
          </div>
        )}
        <div>
          <p className="text-xs font-medium text-foreground leading-none mb-0.5">
            {review.user.name}
          </p>
          <p className="text-[10px] text-muted-foreground">Verified buyer</p>
        </div>
      </div>
    </div>
  );
}

export default function ReviewCarousel() {
  const [reviews, setReviews] = useState<FeaturedReview[]>([]);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/reviews/feature?featured=true&view=storefront")
      .then((r) => r.json())
      .then((data) => {
        const list: FeaturedReview[] =
          data?.data ?? data?.reviews ?? data ?? [];
        setReviews(list);
      })
      .catch(console.error);
  }, []);

  if (!reviews.length) return null;

  const doubled = [...reviews, ...reviews];

  return (
    <section className="overflow-hidden pb-12">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            What customers say
          </p>
          <h2 className="text-2xl font-semibold text-foreground">
            Trusted by our buyers
          </h2>
        </div>

      <div className="relative">
          {/* Fade edges */}
          <div className="pointer-events-none absolute left-0 top-0 h-full w-20 z-10 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-20 z-10 bg-gradient-to-l from-background to-transparent" />

          <div className="overflow-hidden">
            <div
              ref={trackRef}
              className="flex gap-4"
              style={{
                width: "max-content",
                animation: paused ? "none" : "scroll-left 100s linear infinite",
              }}
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              {doubled.map((review, i) => (
                <ReviewCard
                  key={`${review.id}-${i}`}
                  review={review}
                  colorIdx={i}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scroll-left {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </section>
  );
}
