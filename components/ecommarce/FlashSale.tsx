"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Flame, Zap } from "lucide-react";
import type { StorefrontHomeData } from "@/lib/storefront-home";
import { cn } from "@/lib/utils";

export type FlashSaleProduct = StorefrontHomeData["flashSaleProducts"][number];

const formatPrice = (value: number) =>
  `৳${Math.round(value).toLocaleString("en-US")}`;

function remainingTime(endsAt: string) {
  const milliseconds = Math.max(0, new Date(endsAt).getTime() - Date.now());
  const totalSeconds = Math.floor(milliseconds / 1000);
  return {
    expired: milliseconds <= 0,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function FlashSaleCountdown({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState<ReturnType<typeof remainingTime> | null>(null);

  useEffect(() => {
    const update = () => setRemaining(remainingTime(endsAt));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  if (remaining?.expired) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Deal ended</div>;
  }

  const values = [[remaining?.days, "Days"], [remaining?.hours, "Hrs"], [remaining?.minutes, "Min"], [remaining?.seconds, "Sec"]] as const;
  return (
    <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-orange-500 bg-orange-50/40 dark:bg-orange-950/20" aria-label="Time remaining in this deal" role="timer">
      {values.map(([value, label], index) => (
        <div key={label} className={cn("flex min-w-0 flex-col items-center py-1.5", index > 0 && "border-l border-orange-200 dark:border-orange-900")}>
          <span className="text-sm font-extrabold tabular-nums text-orange-700 dark:text-orange-300">{value === undefined || value === null ? "--" : String(value).padStart(2, "0")}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function FlashSaleCard({ product }: { product: FlashSaleProduct }) {
  const sale = product.flashSale;
  if (!sale?.active || !sale.endsAt) return null;

  const stock = product.variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock) || 0), 0);
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-orange-300 hover:shadow-xl dark:border-slate-800 dark:bg-slate-950">
      <div className="relative mb-3">
        <span className="absolute left-0 top-0 z-10 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-extrabold text-white shadow-sm">Save: {formatPrice(sale.savings)}</span>
        <Link href={`/ecommerce/products/${product.id}`} className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-white" aria-label={`View ${product.name}`}>
          {product.image ? (
            <Image src={product.image} alt={product.name} fill sizes="(max-width: 640px) 72vw, (max-width: 1024px) 38vw, 260px" className="object-contain p-5 transition duration-300 group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No image</div>
          )}
        </Link>
      </div>

      <Link href={`/ecommerce/products/${product.id}`} className="mb-2 line-clamp-2 min-h-12 text-[15px] font-semibold leading-6 text-slate-900 transition hover:text-orange-600 dark:text-slate-100">{product.name}</Link>
      <div className="mb-3 flex min-h-7 items-baseline justify-center gap-2">
        <span className="text-lg font-extrabold text-red-600">{formatPrice(Number(product.basePrice))}</span>
        <span className="text-sm text-slate-500 line-through">{formatPrice(sale.regularPrice)}</span>
      </div>

      <div className="mt-auto space-y-3">
        <FlashSaleCountdown endsAt={sale.endsAt} />
        <Link href={`/ecommerce/products/${product.id}`} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 text-sm font-extrabold text-white shadow-sm transition hover:from-orange-600 hover:to-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
          <Zap className="h-4 w-4 fill-current" aria-hidden="true" /> View Deal
        </Link>
        <p className="sr-only">{stock} units currently in stock</p>
      </div>
    </article>
  );
}

export default function FlashSale({ productsData }: { productsData: FlashSaleProduct[]; isAuthenticated?: boolean }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const products = useMemo(() => productsData.filter((product) => product.flashSale?.active).slice(0, 20), [productsData]);
  const scroll = (direction: "left" | "right") => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: (direction === "left" ? -1 : 1) * Math.max(280, scroller.clientWidth * 0.82), behavior: "smooth" });
  };
  if (products.length === 0) return null;

  return (
    <section className="bg-slate-50 px-3 py-8 dark:bg-slate-900/40 sm:px-6 lg:py-10" aria-labelledby="flash-sale-title">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Flame className="h-7 w-7 fill-orange-500 text-orange-500" aria-hidden="true" />
              <h2 id="flash-sale-title" className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">Flash Sale</h2>
            </div>
            <p className="text-base text-muted-foreground">Limited time deals. Grab yours before the clock runs out.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => scroll("left")} className="grid h-11 w-11 place-items-center rounded-full border bg-background transition hover:border-orange-500 hover:text-orange-600" aria-label="Previous flash sale products"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => scroll("right")} className="grid h-11 w-11 place-items-center rounded-full border bg-background transition hover:border-orange-500 hover:text-orange-600" aria-label="Next flash sale products"><ChevronRight className="h-5 w-5" /></button>
            <Link href="/ecommerce/flash-sale" className="ml-1 inline-flex h-11 items-center gap-1 rounded-full border bg-background px-5 text-sm font-bold transition hover:border-orange-500 hover:text-orange-600">View All <ChevronRight className="h-4 w-4" /></Link>
          </div>
        </div>
        <div ref={scrollerRef} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {products.map((product) => <div key={product.id} className="w-[78vw] max-w-[290px] shrink-0 snap-start sm:w-[280px] lg:w-[265px]"><FlashSaleCard product={product} /></div>)}
        </div>
      </div>
    </section>
  );
}
