"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client"; // তুমি header এ যেটা use করছো
import { Star } from "lucide-react";

type ReviewUser = {
  id: string;
  name: string | null;
};

type Review = {
  id: number;
  productId: number;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user: ReviewUser;
};

type ReviewResponse = {
  reviews: Review[];
  pagination: { page: number; limit: number; total: number; pages: number };
  averageRating: number;
};

function cn(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

function Stars({
  value,
  onChange,
  size = 18,
  readonly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readonly?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;

  return (
    <div className="inline-flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const v = i + 1;
        const active = v <= display;
        return (
          <button
            key={v}
            type="button"
            disabled={readonly}
            onMouseEnter={() => !readonly && setHover(v)}
            onMouseLeave={() => !readonly && setHover(null)}
            onClick={() => !readonly && onChange?.(v)}
            className={cn(
              "p-0.5 rounded",
              !readonly && "hover:scale-105 transition"
            )}
            aria-label={`Rate ${v} star`}
          >
            <Star
              style={{ width: size, height: size }}
              className={cn(
                active ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

export default function ProductReviews({ productId }: { productId: number }) {
  const router = useRouter();
  const { data: session } = useSession();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [avg, setAvg] = useState(0);

  const [page, setPage] = useState(1);
  const limit = 10;
  const [pages, setPages] = useState(1);

  // form
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const meId = (session?.user as any)?.id as string | undefined;

  const myExisting = useMemo(() => {
    if (!meId) return null;
    return reviews.find((r) => r.userId === meId) ?? null;
  }, [reviews, meId]);

  // load reviews
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/reviews?view=storefront&productId=${productId}&page=${page}&limit=${limit}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("Failed to load reviews");

        const data = (await res.json()) as ReviewResponse;
        if (!mounted) return;

        setReviews(data.reviews || []);
        setAvg(Number(data.averageRating || 0));
        setPages(data.pagination?.pages || 1);

        // if user already reviewed (when that review is in current page)
        const mine = (data.reviews || []).find((r) => r.userId === meId);
        if (mine) {
          setRating(mine.rating);
          setComment(mine.comment ?? "");
        } else {
          setRating(0);
          setComment("");
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [productId, page, meId]);

  const submit = async () => {
    if (!session?.user) {
      router.push("/signin");
      return;
    }
    if (rating < 1 || rating > 5) return;

    try {
      setSubmitting(true);
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          productId,
          rating,
          comment: comment.trim() ? comment.trim() : null,
        }),
      });

      if (res.status === 401) {
        router.push("/signin");
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "Failed to submit review");
        return;
      }

      // refresh list (stay on same page)
      // best: reload current page reviews
      const reload = await fetch(
        `/api/reviews?view=storefront&productId=${productId}&page=${page}&limit=${limit}`,
        { cache: "no-store" }
      );
      const payload = (await reload.json()) as ReviewResponse;
      setReviews(payload.reviews || []);
      setAvg(Number(payload.averageRating || 0));
      setPages(payload.pagination?.pages || 1);

      // keep filled state
      setRating(data.rating ?? rating);
      setComment(data.comment ?? comment);

      alert(myExisting ? "Review updated!" : "Review submitted!");
    } catch (e) {
      console.error(e);
      alert("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            Customer Reviews
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Stars value={Math.round(avg)} readonly />
            <span className="text-xs text-muted-foreground">
              {avg.toFixed(1)} average rating
            </span>
          </div>
        </div>
      </div>

      {/* Write review */}
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="text-sm font-semibold text-foreground">
          {session?.user ? "Write a review" : "Login to write a review"}
        </div>

        {!session?.user ? (
          <div className="mt-3 flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              You must be logged in to submit a review.
            </p>
            <button
              type="button"
              onClick={() => router.push("/signin")}
              className="h-10 px-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-95 transition"
            >
              Sign In
            </button>
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Rating:</span>
              <Stars value={rating} onChange={setRating} />
              {myExisting ? (
                <span className="text-xs text-muted-foreground">
                  (You already reviewed — updating will overwrite it)
                </span>
              ) : null}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Write your opinion..."
              className="mt-3 w-full min-h-[110px] rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />

            <button
              type="button"
              disabled={submitting || rating < 1}
              onClick={submit}
              className="mt-3 h-10 px-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-95 transition disabled:opacity-50"
            >
              {submitting ? "Submitting..." : myExisting ? "Update Review" : "Submit Review"}
            </button>
          </>
        )}
      </div>

      {/* Review list */}
      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <div className="px-4 py-3 border-b border-border font-semibold text-sm">
          Reviews
        </div>

        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : reviews.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No reviews yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {reviews.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">
                      {r.user?.name || "Anonymous"}
                    </div>
                    <div className="mt-1">
                      <Stars value={r.rating} readonly size={16} />
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "2-digit",
                    })}
                  </div>
                </div>

                {r.comment ? (
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {r.comment}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-border hover:bg-muted transition disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>

          <div className="text-xs text-muted-foreground">
            Page {page} of {pages}
          </div>

          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-border hover:bg-muted transition disabled:opacity-50"
            disabled={page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
