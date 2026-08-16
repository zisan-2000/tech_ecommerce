"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { cachedFetchJson } from "@/lib/client-cache-fetch";
import { ChevronLeft, ChevronRight, Shirt, Sparkles } from "lucide-react";

type Brand = {
  id: number;
  name: string;
  slug: string;
  logo: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
};

export default function BrandSlider({
  title = "Our Brands",
  subtitle = "Shop from your favorite brands",
  limit = 20,
}: {
  title?: string;
  subtitle?: string;
  limit?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [error, setError] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const brandsData = await cachedFetchJson<Brand[]>("/api/brands?view=storefront", {
          ttlMs: 5 * 60 * 1000,
        });

        if (!mounted) return;

        setBrands(Array.isArray(brandsData) ? brandsData : []);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Failed to load brands");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const visible = useMemo(() => brands.slice(0, limit), [brands, limit]);

  const scrollByCards = (dir: "left" | "right") => {
    const el = scrollerRef.current;
    if (!el) return;

    const card = el.querySelector<HTMLElement>("[data-brand-card='1']");
    const cardW = card ? card.offsetWidth : 140;

    el.scrollBy({
      left: dir === "left" ? -cardW * 1.5 : cardW * 1.5,
      behavior: "smooth",
    });
  };

  // Get gradient color based on brand name (for placeholder)
  const getBrandColor = (name: string) => {
    const colors = [
      "from-blue-500 to-blue-600",
      "from-purple-500 to-purple-600",
      "from-pink-500 to-pink-600",
      "from-emerald-500 to-emerald-600",
      "from-orange-500 to-orange-600",
      "from-indigo-500 to-indigo-600",
      "from-rose-500 to-rose-600",
      "from-teal-500 to-teal-600",
    ];
    const index = name.length % colors.length;
    return colors[index];
  };

  return (
    <section className="w-full bg-background">
      <div className="w-full px-3 py-3 sm:px-5 sm:py-4">
        {/* Header */}
        <div className="mb-3 sm:mb-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h2>

          <p className="mt-1 text-xs text-muted-foreground sm:mt-2 sm:text-sm">
            {subtitle}
          </p>
        </div>

        {error ? (
          <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive sm:p-3 sm:text-sm">
            {error}
          </div>
        ) : null}

        <div className="relative">
          {visible.length >= 4 && (
            <>
              <button
                onClick={() => scrollByCards("left")}
                className="absolute -left-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-card text-muted-foreground shadow-md sm:-left-3 sm:h-9 sm:w-9"
                aria-label="Previous brands"
              >
                <ChevronLeft className="h-5 w-5 sm:h-5 sm:w-5" />
              </button>

              <button
                onClick={() => scrollByCards("right")}
                className="absolute -right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-card text-muted-foreground shadow-md sm:-right-3 sm:h-9 sm:w-9"
                aria-label="Next brands"
              >
                <ChevronRight className="h-5 w-5 sm:h-5 sm:w-5" />
              </button>
            </>
          )}

          <div
            ref={scrollerRef}
            className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 scroll-smooth sm:gap-4 sm:pb-2"
          >
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="min-w-[96px] max-w-[96px] flex-shrink-0 snap-start sm:min-w-[160px] sm:max-w-[160px]"
                  >
                    <div className="h-[130px] animate-pulse rounded-2xl border border-border bg-card shadow-sm sm:h-[200px] sm:rounded-[22px]" />
                  </div>
                ))
              : visible.map((brand) => (
                  <div
                    key={brand.id}
                    data-brand-card="1"
                    className="min-w-[96px] max-w-[96px] flex-shrink-0 snap-start sm:min-w-[160px] sm:max-w-[160px]"
                  >
                    <Link
                      href={`/ecommerce/brands/${brand.slug}`}
                      className="block h-[130px] rounded-2xl border border-border bg-card px-2 py-3 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-xl sm:h-[200px] sm:rounded-[22px] sm:border-2 sm:px-3 sm:py-5"
                    >
                      <div className="mx-auto flex h-[58px] w-[58px] items-center justify-center rounded-full border-[3px] border-primary bg-background p-1 sm:h-[100px] sm:w-[100px] sm:border-[4px] sm:p-1.5">
                        <div className="flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full bg-secondary sm:h-[80px] sm:w-[80px]">
                          {brand.logo ? (
                            <Image
                              src={brand.logo}
                              alt={brand.name}
                              width={96}
                              height={96}
                              className="h-full w-full rounded-full object-contain"
                            />
                          ) : (
                            <span className="text-base font-bold text-secondary-foreground sm:text-2xl">
                              {brand.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>

                      <h3 className="mt-2 truncate text-sm font-medium text-card-foreground sm:mt-3 sm:text-base">
                        {brand.name}
                      </h3>

                      {brand.productCount > 0 && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
                          {brand.productCount} products
                        </p>
                      )}
                    </Link>
                  </div>
                ))}
          </div>
        </div>
      </div>
    </section>
  );
}
