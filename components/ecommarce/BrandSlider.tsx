"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { cachedFetchJson } from "@/lib/client-cache-fetch";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

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
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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

  const visible = useMemo(
    () =>
      [...brands]
        .filter((brand) => brand.productCount > 0)
        .sort(
          (first, second) =>
            second.productCount - first.productCount ||
            first.name.localeCompare(second.name),
        )
        .slice(0, limit),
    [brands, limit],
  );

  const updateScrollControls = useCallback(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    setCanScrollLeft(element.scrollLeft > 2);
    setCanScrollRight(element.scrollLeft < maxScrollLeft - 2);
  }, []);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;

    const frame = window.requestAnimationFrame(updateScrollControls);
    element.addEventListener("scroll", updateScrollControls, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScrollControls);
    observer?.observe(element);

    return () => {
      window.cancelAnimationFrame(frame);
      element.removeEventListener("scroll", updateScrollControls);
      observer?.disconnect();
    };
  }, [updateScrollControls, visible.length]);

  const scrollByCards = (dir: "left" | "right") => {
    const el = scrollerRef.current;
    if (!el) return;

    const card = el.querySelector<HTMLElement>("[data-brand-card='1']");
    const cardWidth = card ? card.offsetWidth : 156;
    const distance = Math.max(cardWidth * 3, el.clientWidth * 0.72);

    el.scrollBy({
      left: dir === "left" ? -distance : distance,
      behavior: "smooth",
    });
  };

  return (
    <section className="w-full bg-[#f5f6f8]">
      <div className="w-full px-3 py-5 sm:px-5 sm:py-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-bold tracking-tight text-slate-900 sm:text-[22px]">
              {title}
            </h2>
            <p className="mt-1 text-[12px] text-slate-500 sm:text-[13px]">
              {subtitle}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => scrollByCards("left")}
              disabled={!canScrollLeft}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Previous brands"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollByCards("right")}
              disabled={!canScrollRight}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Next brands"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <Link
              href="/ecommerce/brands"
              className="hidden h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-[#174a92] hover:text-[#174a92] sm:inline-flex"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive sm:p-3 sm:text-sm">
            {error}
          </div>
        ) : null}

        <div className="relative overflow-hidden">
          <div
            ref={scrollerRef}
            className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1"
          >
            {loading
              ? Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-[112px] min-w-[132px] animate-pulse snap-start rounded-lg border border-slate-200 bg-white sm:min-w-[156px] lg:min-w-[172px]"
                  >
                    <div className="mx-3 mt-3 h-12 rounded bg-slate-100" />
                    <div className="mx-3 mt-3 h-3 w-20 rounded bg-slate-100" />
                  </div>
                ))
              : visible.map((brand) => (
                  <Link
                    key={brand.id}
                    data-brand-card="1"
                    href={`/ecommerce/products?brand=${encodeURIComponent(brand.slug)}`}
                    aria-label={`Shop ${brand.name} products`}
                    className="group flex h-[112px] min-w-[132px] snap-start flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[#174a92]/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174a92] sm:min-w-[156px] lg:min-w-[172px]"
                  >
                    <div className="relative flex h-[54px] items-center justify-center overflow-hidden rounded-md border border-slate-100 bg-slate-50 px-3">
                      {brand.logo ? (
                        <Image
                          src={brand.logo}
                          alt={`${brand.name} logo`}
                          fill
                          sizes="(max-width: 640px) 108px, 140px"
                          className="object-contain p-2"
                        />
                      ) : (
                        <span className="max-w-full truncate text-center text-[15px] font-black uppercase tracking-[-0.035em] text-slate-800 sm:text-[16px]">
                          {brand.name}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-[11px] font-semibold text-slate-800 group-hover:text-[#174a92]">
                          {brand.name}
                        </h3>
                        <p className="mt-0.5 text-[9px] text-slate-500">
                          {brand.productCount} {brand.productCount === 1 ? "product" : "products"}
                        </p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#174a92]" />
                    </div>
                  </Link>
                ))}
          </div>

          {!loading && !error && visible.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-[12px] text-slate-500">
              Brand products will appear here when they are available.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
