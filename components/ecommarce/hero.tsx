"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { cachedFetchJson } from "@/lib/client-cache-fetch";
import { cn } from "@/lib/utils";

interface Banner {
  id: number;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  image: string;
  mobileImage?: string | null;
  buttonText?: string | null;
  type: string;
  position: number;
  isActive: boolean;
  href?: string;
}

type Props = {
  heroInterval?: number;
  banner1Interval?: number;
  banner2Interval?: number;
  bannersData?: Banner[];
};

type SideBannerProps = {
  slides: Banner[];
  current: number;
  onSelect: (index: number) => void;
  priority?: boolean;
};

const FALLBACK_LINK = "/ecommerce/products";

function SideBanner({
  slides,
  current,
  onSelect,
  priority = false,
}: SideBannerProps) {
  if (slides.length === 0) return null;

  return (
    <div className="group/side relative h-full min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
      {slides.map((banner, index) => (
        <article
          key={banner.id}
          aria-hidden={index !== current}
          className={cn(
            "absolute inset-0 transition-opacity duration-500 ease-out motion-reduce:transition-none",
            index === current
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0",
          )}
        >
          <Link
            href={banner.href ?? FALLBACK_LINK}
            aria-label={`${banner.title}${banner.buttonText ? ` — ${banner.buttonText}` : ""}`}
            tabIndex={index === current ? 0 : -1}
            className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#174a92]"
          >
            <Image
              src={banner.image}
              alt=""
              fill
              priority={priority && index === 0}
              className="object-cover transition-transform duration-700 group-hover/side:scale-[1.025] motion-reduce:transition-none"
              sizes="(max-width: 1023px) 100vw, 32vw"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/5" />

            <div className="absolute inset-y-0 left-0 z-10 flex w-[58%] flex-col justify-center px-5 py-4 sm:px-6 lg:px-5 xl:px-7">
              {banner.subtitle ? (
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#2563eb] sm:text-[11px]">
                  {banner.subtitle}
                </p>
              ) : null}
              <h2 className="text-lg font-extrabold leading-[1.08] tracking-[-0.025em] text-slate-950 sm:text-xl xl:text-[25px]">
                {banner.title}
              </h2>
              {banner.description ? (
                <p className="mt-2 line-clamp-2 max-w-[240px] text-[11px] leading-relaxed text-slate-600 xl:text-xs">
                  {banner.description}
                </p>
              ) : null}
              {banner.buttonText ? (
                <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-md bg-[#175cd3] px-3 py-2 text-[10px] font-bold text-white shadow-sm transition-colors group-hover/side:bg-[#124aa9] sm:text-[11px]">
                  {banner.buttonText}
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </span>
              ) : null}
            </div>
          </Link>
        </article>
      ))}

      {slides.length > 1 ? (
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-white/80 px-2 py-1 shadow-sm backdrop-blur-sm">
          {slides.map((banner, index) => (
            <button
              key={banner.id}
              type="button"
              onClick={() => onSelect(index)}
              aria-label={`Show ${banner.title}`}
              aria-current={index === current ? "true" : undefined}
              className={cn(
                "h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174a92]",
                index === current ? "w-5 bg-[#175cd3]" : "w-1.5 bg-slate-300",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Hero({
  heroInterval = 6000,
  banner1Interval = 7000,
  banner2Interval = 8000,
  bannersData,
}: Props) {
  const [banners, setBanners] = useState<Banner[]>(() =>
    (bannersData ?? []).filter(
      (banner) => banner.isActive && banner.type !== "POPUP",
    ),
  );
  const [currentHero, setCurrentHero] = useState(0);
  const [currentBanner1, setCurrentBanner1] = useState(0);
  const [currentBanner2, setCurrentBanner2] = useState(0);
  const [autoplayPaused, setAutoplayPaused] = useState(false);

  useEffect(() => {
    if (bannersData) return;

    let cancelled = false;
    const load = async () => {
      try {
        const data = await cachedFetchJson<Banner[]>(
          "/api/banners?view=storefront&active=true",
          { ttlMs: 2 * 60 * 1000 },
        );
        if (!cancelled) {
          setBanners(
            data.filter(
              (banner) => banner.isActive && banner.type !== "POPUP",
            ),
          );
        }
      } catch (error) {
        console.error("Failed to load homepage banners", error);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [bannersData]);

  const heroSlides = useMemo(
    () =>
      banners
        .filter((banner) => banner.type === "HERO")
        .sort((a, b) => a.position - b.position),
    [banners],
  );
  const banner1Slides = useMemo(
    () =>
      banners
        .filter((banner) => banner.type === "BANNER1")
        .sort((a, b) => a.position - b.position),
    [banners],
  );
  const banner2Slides = useMemo(
    () =>
      banners
        .filter((banner) => banner.type === "BANNER2")
        .sort((a, b) => a.position - b.position),
    [banners],
  );

  useEffect(() => {
    setCurrentHero((current) =>
      Math.min(current, Math.max(heroSlides.length - 1, 0)),
    );
  }, [heroSlides.length]);
  useEffect(() => {
    setCurrentBanner1((current) =>
      Math.min(current, Math.max(banner1Slides.length - 1, 0)),
    );
  }, [banner1Slides.length]);
  useEffect(() => {
    setCurrentBanner2((current) =>
      Math.min(current, Math.max(banner2Slides.length - 1, 0)),
    );
  }, [banner2Slides.length]);

  useEffect(() => {
    if (autoplayPaused || heroSlides.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentHero((current) => (current + 1) % heroSlides.length);
    }, heroInterval);
    return () => window.clearInterval(timer);
  }, [autoplayPaused, heroInterval, heroSlides.length]);

  useEffect(() => {
    if (autoplayPaused || banner1Slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentBanner1((current) => (current + 1) % banner1Slides.length);
    }, banner1Interval);
    return () => window.clearInterval(timer);
  }, [autoplayPaused, banner1Interval, banner1Slides.length]);

  useEffect(() => {
    if (autoplayPaused || banner2Slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentBanner2((current) => (current + 1) % banner2Slides.length);
    }, banner2Interval);
    return () => window.clearInterval(timer);
  }, [autoplayPaused, banner2Interval, banner2Slides.length]);

  if (heroSlides.length === 0) return null;

  const hasSideBanners = banner1Slides.length > 0 || banner2Slides.length > 0;
  const showPreviousHero = () =>
    setCurrentHero(
      (current) => (current - 1 + heroSlides.length) % heroSlides.length,
    );
  const showNextHero = () =>
    setCurrentHero((current) => (current + 1) % heroSlides.length);

  return (
    <section
      aria-label="Featured promotions"
      aria-roledescription="carousel"
      className="w-full bg-[#f4f6f8]"
      onMouseEnter={() => setAutoplayPaused(true)}
      onMouseLeave={() => setAutoplayPaused(false)}
      onFocusCapture={() => setAutoplayPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setAutoplayPaused(false);
        }
      }}
    >
      <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5 lg:px-6 lg:py-5">
        <div
          className={cn(
            "grid gap-3",
            hasSideBanners
              ? "lg:h-[clamp(350px,25.8vw,420px)] lg:grid-cols-[minmax(0,2.28fr)_minmax(320px,1fr)]"
              : "lg:h-[clamp(350px,25.8vw,420px)] lg:grid-cols-1",
          )}
        >
          <div className="group/hero relative aspect-[16/9] min-h-0 overflow-hidden rounded-xl bg-slate-950 shadow-[0_3px_16px_rgba(15,23,42,0.10)] sm:aspect-[2/1] lg:aspect-auto lg:h-full">
            {heroSlides.map((banner, index) => (
              <article
                key={banner.id}
                aria-hidden={index !== currentHero}
                className={cn(
                  "absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none",
                  index === currentHero
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-none opacity-0",
                )}
              >
                <Link
                  href={banner.href ?? FALLBACK_LINK}
                  aria-label={`${banner.title}${banner.buttonText ? ` — ${banner.buttonText}` : ""}`}
                  tabIndex={index === currentHero ? 0 : -1}
                  className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
                >
                  <Image
                    src={banner.image}
                    alt=""
                    fill
                    priority={index === 0}
                    className="object-cover transition-transform duration-[1400ms] group-hover/hero:scale-[1.018] motion-reduce:transition-none"
                    sizes="(max-width: 1023px) 100vw, 69vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/55 to-transparent" />

                  <div className="absolute inset-y-0 left-0 z-10 flex w-[68%] flex-col justify-center px-6 py-8 text-white sm:w-[58%] sm:px-10 lg:w-[55%] lg:px-12 xl:px-16">
                    {banner.subtitle ? (
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300 sm:text-xs lg:text-[13px]">
                        {banner.subtitle}
                      </p>
                    ) : null}
                    <h2 className="max-w-xl text-[25px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-4xl lg:text-[clamp(34px,3vw,48px)]">
                      {banner.title}
                    </h2>
                    {banner.description ? (
                      <p className="mt-3 line-clamp-2 max-w-lg text-xs leading-relaxed text-slate-200 sm:text-sm lg:mt-4 lg:text-[15px]">
                        {banner.description}
                      </p>
                    ) : null}
                    {banner.buttonText ? (
                      <span className="mt-5 inline-flex w-fit items-center gap-2 rounded-md bg-white px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md transition-colors group-hover/hero:bg-cyan-50 sm:px-5 sm:text-sm">
                        {banner.buttonText}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    ) : null}
                  </div>
                </Link>
              </article>
            ))}

            {heroSlides.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={showPreviousHero}
                  aria-label="Show previous promotion"
                  className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-[0_3px_12px_rgba(15,23,42,0.18)] transition hover:scale-105 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#175cd3] sm:left-4 sm:h-11 sm:w-11"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={showNextHero}
                  aria-label="Show next promotion"
                  className="absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-[0_3px_12px_rgba(15,23,42,0.18)] transition hover:scale-105 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#175cd3] sm:right-4 sm:h-11 sm:w-11"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>

                <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-950/35 px-3 py-2 backdrop-blur-sm">
                  {heroSlides.map((banner, index) => (
                    <button
                      key={banner.id}
                      type="button"
                      onClick={() => setCurrentHero(index)}
                      aria-label={`Show ${banner.title}`}
                      aria-current={index === currentHero ? "true" : undefined}
                      className={cn(
                        "h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                        index === currentHero
                          ? "w-8 bg-white"
                          : "w-2 bg-white/55 hover:bg-white/80",
                      )}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>

          {hasSideBanners ? (
            <div className="grid min-h-0 gap-3 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-2">
              {banner1Slides.length > 0 ? (
                <div className="relative aspect-[9/4] min-h-0 lg:aspect-auto">
                  <SideBanner
                    slides={banner1Slides}
                    current={currentBanner1}
                    onSelect={setCurrentBanner1}
                    priority
                  />
                </div>
              ) : null}
              {banner2Slides.length > 0 ? (
                <div className="relative aspect-[9/4] min-h-0 lg:aspect-auto">
                  <SideBanner
                    slides={banner2Slides}
                    current={currentBanner2}
                    onSelect={setCurrentBanner2}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
