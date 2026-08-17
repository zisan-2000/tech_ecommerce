"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cachedFetchJson } from "@/lib/client-cache-fetch";

interface Banner {
  id: number;
  title: string;
  image: string;
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
  mobileAutoInterval?: number;
};

export default function Hero({
  heroInterval = 5000,
  banner1Interval = 3000,
  banner2Interval = 4000,
  mobileAutoInterval = 4000,
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
  const [mobileCurrentIndex, setMobileCurrentIndex] = useState(0);

  const heroTimerRef = useRef<NodeJS.Timeout | null>(null);
  const banner1TimerRef = useRef<NodeJS.Timeout | null>(null);
  const banner2TimerRef = useRef<NodeJS.Timeout | null>(null);
  const mobileTimerRef = useRef<NodeJS.Timeout | null>(null);

  /* ================= FETCH ================= */
  useEffect(() => {
    const load = async () => {
      const data =
        bannersData ??
        (await cachedFetchJson<Banner[]>("/api/banners?view=storefront&active=true", {
          ttlMs: 2 * 60 * 1000,
        }));
      setBanners((data as Banner[]).filter((b) => b.isActive && b.type !== "POPUP"));
    };
    load();
  }, [bannersData]);

  /* ================= SPLIT ================= */
  const heroSlides = useMemo(
    () =>
      banners
        .filter((b) => b.type === "HERO")
        .sort((a, b) => a.position - b.position),
    [banners]
  );

  const banner1Slides = useMemo(
    () =>
      banners
        .filter((b) => b.type === "BANNER1")
        .sort((a, b) => a.position - b.position),
    [banners]
  );

  const banner2Slides = useMemo(
    () =>
      banners
        .filter((b) => b.type === "BANNER2")
        .sort((a, b) => a.position - b.position),
    [banners]
  );

  // Mobile combined slides: HERO -> BANNER1 -> BANNER2
  const mobileSlides = useMemo(() => {
    const slides: Array<{ type: string; data: Banner; index: number }> = [];
    
    heroSlides.forEach((slide, idx) => {
      slides.push({ type: "HERO", data: slide, index: idx });
    });
    
    banner1Slides.forEach((slide, idx) => {
      slides.push({ type: "BANNER1", data: slide, index: idx });
    });
    
    banner2Slides.forEach((slide, idx) => {
      slides.push({ type: "BANNER2", data: slide, index: idx });
    });
    
    return slides;
  }, [heroSlides, banner1Slides, banner2Slides]);

  const hasSideBanners = banner1Slides.length > 0 || banner2Slides.length > 0;

  /* ================= AUTO SLIDE HERO ================= */
  useEffect(() => {
    if (heroSlides.length <= 1) return;

    heroTimerRef.current = setInterval(() => {
      setCurrentHero((prev) => (prev + 1) % heroSlides.length);
    }, heroInterval);

    return () => {
      if (heroTimerRef.current) clearInterval(heroTimerRef.current);
    };
  }, [heroSlides.length, heroInterval]);

  /* ================= AUTO SLIDE BANNER1 ================= */
  useEffect(() => {
    if (banner1Slides.length <= 1) return;

    banner1TimerRef.current = setInterval(() => {
      setCurrentBanner1((prev) => (prev + 1) % banner1Slides.length);
    }, banner1Interval);

    return () => {
      if (banner1TimerRef.current) clearInterval(banner1TimerRef.current);
    };
  }, [banner1Slides.length, banner1Interval]);

  /* ================= AUTO SLIDE BANNER2 ================= */
  useEffect(() => {
    if (banner2Slides.length <= 1) return;

    banner2TimerRef.current = setInterval(() => {
      setCurrentBanner2((prev) => (prev + 1) % banner2Slides.length);
    }, banner2Interval);

    return () => {
      if (banner2TimerRef.current) clearInterval(banner2TimerRef.current);
    };
  }, [banner2Slides.length, banner2Interval]);

  /* ================= MOBILE AUTO SLIDE ================= */
  useEffect(() => {
    if (mobileSlides.length <= 1) return;

    mobileTimerRef.current = setInterval(() => {
      setMobileCurrentIndex((prev) => (prev + 1) % mobileSlides.length);
    }, mobileAutoInterval);

    return () => {
      if (mobileTimerRef.current) clearInterval(mobileTimerRef.current);
    };
  }, [mobileSlides.length, mobileAutoInterval]);

  // Reset mobile index when slides change
  useEffect(() => {
    setMobileCurrentIndex(0);
  }, [mobileSlides.length]);

  const goToMobileSlide = (index: number) => {
    setMobileCurrentIndex(index);
    // Reset timer
    if (mobileTimerRef.current) {
      clearInterval(mobileTimerRef.current);
      if (mobileSlides.length > 1) {
        mobileTimerRef.current = setInterval(() => {
          setMobileCurrentIndex((prev) => (prev + 1) % mobileSlides.length);
        }, mobileAutoInterval);
      }
    }
  };

  const nextMobileSlide = () => {
    goToMobileSlide((mobileCurrentIndex + 1) % mobileSlides.length);
  };

  const prevMobileSlide = () => {
    goToMobileSlide((mobileCurrentIndex - 1 + mobileSlides.length) % mobileSlides.length);
  };

  if (heroSlides.length === 0) return null;

  // Get current mobile slide data
  const currentMobileSlide = mobileSlides[mobileCurrentIndex];

  return (
    <section className="w-full">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
        
        {/* ================= MOBILE VIEW (shows one carousel) ================= */}
        <div className="block lg:hidden">
          {mobileSlides.length > 0 && currentMobileSlide && (
            <div className="relative overflow-hidden rounded-2xl bg-muted">
              <div className="relative h-[300px] sm:h-[400px]">
                <Link
                  href={currentMobileSlide.data.href ?? "#"}
                  className="block h-full w-full"
                >
                  <Image
                    src={currentMobileSlide.data.image}
                    alt={currentMobileSlide.data.title}
                    fill
                    priority={mobileCurrentIndex === 0}
                    className="object-cover"
                    sizes="100vw"
                  />
                </Link>

                {/* Previous Button */}
                {mobileSlides.length > 1 && (
                  <>
                    <button
                      onClick={prevMobileSlide}
                      className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 backdrop-blur-sm transition-all duration-200 hover:scale-110"
                      aria-label="Previous slide"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>

                    {/* Next Button */}
                    <button
                      onClick={nextMobileSlide}
                      className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 backdrop-blur-sm transition-all duration-200 hover:scale-110"
                      aria-label="Next slide"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}

                {/* Mobile Dots with type indicators */}
                {mobileSlides.length > 1 && (
                  <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
                    {mobileSlides.map((slide, i) => (
                      <button
                        key={i}
                        onClick={() => goToMobileSlide(i)}
                        aria-label={`Go to slide ${i + 1} (${slide.type})`}
                        className={`transition-all ${
                          i === mobileCurrentIndex
                            ? "w-8 h-2 bg-white/90 rounded-full"
                            : "w-2 h-2 bg-white/50 rounded-full hover:bg-white/70"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ================= DESKTOP VIEW (Original layout) ================= */}
        <div className="hidden lg:block">
          <div
            className={`grid items-stretch gap-8 ${
              hasSideBanners ? "grid-cols-[2fr_1fr]" : "grid-cols-1"
            }`}
          >
            {/* LEFT HERO */}
            <div className="relative overflow-hidden rounded-2xl bg-muted">
              <div className="relative h-[500px]">
                {heroSlides.map((slide, index) => (
                  <div
                    key={slide.id}
                    className={`absolute inset-0 transition-opacity duration-700 ${
                      index === currentHero ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <Link href={slide.href ?? "#"} className="block h-full w-full">
                      <Image
                        src={slide.image}
                        alt={slide.title}
                        fill
                        priority={index === 0}
                        className="object-cover"
                        sizes="66vw"
                      />
                    </Link>
                  </div>
                ))}

                {heroSlides.length > 1 && (
                  <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
                    {heroSlides.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentHero(i)}
                        aria-label={`Go to slide ${i + 1}`}
                        className={`h-2 rounded-full transition-all ${
                          i === currentHero ? "w-10 bg-white/90" : "w-2 bg-white/50"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT SIDE BANNERS */}
            {hasSideBanners && (
              <div className="flex flex-col gap-8">
                {/* Banner 1 */}
                {banner1Slides.length > 0 && (
                  <div className="relative overflow-hidden rounded-2xl bg-muted shadow-sm">
                    <div className="relative h-[245px]">
                      {banner1Slides.map((banner, index) => (
                        <div
                          key={banner.id}
                          className={`absolute inset-0 transition-opacity duration-700 ${
                            index === currentBanner1 ? "opacity-100" : "opacity-0"
                          }`}
                        >
                          <Link href={banner.href ?? "#"} className="block h-full w-full">
                            <Image
                              src={banner.image}
                              alt={banner.title}
                              fill
                              className="object-cover"
                              sizes="33vw"
                            />
                          </Link>
                        </div>
                      ))}

                      {banner1Slides.length > 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                          {banner1Slides.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setCurrentBanner1(i)}
                              aria-label={`Go to banner 1 slide ${i + 1}`}
                              className={`h-1.5 rounded-full transition-all ${
                                i === currentBanner1 ? "w-8 bg-white/90" : "w-2 bg-white/50"
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Banner 2 */}
                {banner2Slides.length > 0 && (
                  <div className="relative overflow-hidden rounded-2xl bg-muted shadow-sm">
                    <div className="relative h-[245px]">
                      {banner2Slides.map((banner, index) => (
                        <div
                          key={banner.id}
                          className={`absolute inset-0 transition-opacity duration-700 ${
                            index === currentBanner2 ? "opacity-100" : "opacity-0"
                          }`}
                        >
                          <Link href={banner.href ?? "#"} className="block h-full w-full">
                            <Image
                              src={banner.image}
                              alt={banner.title}
                              fill
                              className="object-cover"
                              sizes="33vw"
                            />
                          </Link>
                        </div>
                      ))}

                      {banner2Slides.length > 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                          {banner2Slides.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setCurrentBanner2(i)}
                              aria-label={`Go to banner 2 slide ${i + 1}`}
                              className={`h-1.5 rounded-full transition-all ${
                                i === currentBanner2 ? "w-8 bg-white/90" : "w-2 bg-white/50"
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
