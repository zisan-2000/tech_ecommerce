"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

type TopProduct = {
  id: number;
  name: string;
  image: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  brand: { name: string } | null;
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function TopSellingProducts() {
  const [products, setProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetch("/api/products/top-selling", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load popular products");
        return response.json();
      })
      .then((data) => {
        if (active) setProducts(Array.isArray(data) ? data.slice(0, 4) : []);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Popular product loading failed", error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-32 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading popular products" />
      </div>
    );
  }

  if (products.length === 0) return null;

  return (
    <aside className="mt-8 rounded-2xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold">Popular products</h2>
        <Link href="/ecommerce/bestsellers" className="text-xs font-semibold text-primary hover:underline">
          View all
        </Link>
      </div>
      <div className="space-y-3">
        {products.map((product) => (
          <Link
            key={product.id}
            href={`/ecommerce/products/${product.id}`}
            className="group flex gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/40"
          >
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
              <Image
                src={product.image || "/placeholder.svg"}
                alt=""
                fill
                sizes="64px"
                className="object-contain p-1"
              />
            </div>
            <div className="min-w-0 flex-1">
              {product.brand && (
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {product.brand.name}
                </p>
              )}
              <h3 className="mt-0.5 line-clamp-2 text-xs font-semibold leading-5 group-hover:text-primary">
                {product.name}
              </h3>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs font-bold text-primary">
                  {money(product.price, product.currency)}
                </span>
                {product.originalPrice && product.originalPrice > product.price && (
                  <span className="text-[10px] text-muted-foreground line-through">
                    {money(product.originalPrice, product.currency)}
                  </span>
                )}
              </div>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
          </Link>
        ))}
      </div>
    </aside>
  );
}
